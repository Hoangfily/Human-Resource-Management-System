"""Chat mode (docs/02-agent-tools.md): answers one employee about policy, their balance and requests,
and drafts requests for them to confirm. Reads only that employee's data; never writes.

The AI's service token can read every employee, so everything here is read for `employee_id`
from the API (the logged-in user), never for a name or id found in the message.
"""

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from ..config import Settings
from ..guardrails.untrusted import detect_injection, wrap_untrusted
from ..llm import LLMClient
from ..prompts import load_prompt
from ..schemas.chat import MAX_REPLY_CHARS, ChatLLMOutput, ChatRequest, ChatResponse
from ..schemas.requests import EmployeeContext, LeaveBalance, PolicySet, RequestDetail
from ..tools.base import ApiClient
from ..tools.read_tools import get_employee, get_leave_balance, get_policies, list_requests
from .base import day_label, policy_lines, to_json
from .chat_drafts import build_card, missing_fields
from .chat_memory import ConversationStore, Turn

logger = logging.getLogger(__name__)

HISTORY_DAYS = 180  # Requests older than this are not shown to the model
MAX_REQUESTS_SHOWN = 10
CALENDAR_DAYS = 21  # Days listed so the model resolves "thứ 6 tuần sau" without date arithmetic

TYPE_LABELS = {
    "LEAVE": "Nghỉ phép",
    "OVERTIME": "Làm thêm giờ",
    "ATTENDANCE_EXPLANATION": "Giải trình chấm công",
    "SHIFT_CHANGE": "Đổi ca",
}


@dataclass
class ChatDeps:
    api: ApiClient
    llm: LLMClient
    settings: Settings
    today: date  # Company timezone
    memory: ConversationStore


@dataclass(frozen=True)
class ChatContext:
    employee: EmployeeContext
    balances: list[LeaveBalance]
    requests: list[RequestDetail]
    policies: PolicySet


async def gather_chat_context(deps: ChatDeps, employee_id: str) -> ChatContext:
    employee, balances, requests, policies = await asyncio.gather(
        get_employee(deps.api, employee_id),
        get_leave_balance(deps.api, employee_id),
        list_requests(deps.api, employee_id, since=deps.today - timedelta(days=HISTORY_DAYS)),
        get_policies(deps.api),
    )
    newest = sorted(requests, key=lambda r: r.created_at, reverse=True)[:MAX_REQUESTS_SHOWN]
    return ChatContext(employee=employee, balances=balances, requests=newest, policies=policies)


def _num(value: float) -> float | int:
    """5.0 -> 5, so the model does not answer "5.0 ngày"."""
    return int(value) if float(value).is_integer() else value


def _request_line(r: RequestDetail) -> dict:
    p = r.payload
    if r.type == "LEAVE":
        when = f"{p.get('startDate')} → {p.get('endDate')}"
    elif r.type == "OVERTIME":
        when = f"{p.get('date')} {p.get('startTime')}–{p.get('endTime')}"
    elif r.type == "SHIFT_CHANGE":
        when = str(p.get("newDate") or p.get("shiftDate"))
    else:
        when = f"{p.get('date')} ({p.get('issue')})"
    return {
        "code": f"#{r.id[:8]}",
        "type": TYPE_LABELS.get(r.type, r.type),
        "status": r.status,
        "when": when,
        "createdAt": r.created_at.date().isoformat(),
    }


def calendar_lines(today: date) -> str:
    """Today and the coming days with weekday and week (weeks run Monday to Sunday)."""
    monday = today - timedelta(days=today.weekday())
    weeks = {0: "tuần này", 1: "tuần sau", 2: "2 tuần sau", 3: "3 tuần sau"}
    lines = []
    for i in range(CALENDAR_DAYS + 1):
        d = today + timedelta(days=i)
        label = "hôm nay" if i == 0 else "ngày mai" if i == 1 else weeks[(d - monday).days // 7]
        lines.append(f"- {day_label(d)}: {label}")
    return "\n".join(lines)


def build_chat_user_prompt(ctx: ChatContext, today: date, history: list[Turn], message: str) -> str:
    balances = [
        {
            "leaveType": b.leave_type_code,
            "year": b.year,
            "total": _num(b.total_days),
            "used": _num(b.used_days),
            "pending": _num(b.pending_days),
            "available": _num(b.available_days),
        }
        for b in ctx.balances
    ]
    join = ctx.employee.join_date
    profile = {"role": ctx.employee.role, "status": ctx.employee.status, "joinDate": join.isoformat() if join else None}
    conversation = "\n".join(
        f"{wrap_untrusted(t.user, 'employee')}\nAssistant: {t.assistant}" for t in history
    ) or "(none)"
    return "\n\n".join([
        f"## Today\n{day_label(today)}",
        f"## Calendar\n{calendar_lines(today)}",
        f"## Employee profile\n{to_json(profile)}",
        f"## Leave balances\n{to_json(balances) if balances else '(none)'}",
        f"## Recent requests (newest first)\n{to_json([_request_line(r) for r in ctx.requests]) if ctx.requests else '(none)'}",
        f"## Policies\n{policy_lines(ctx.policies)}",
        f"## Conversation so far\n{conversation}",
        f"## New message\n{wrap_untrusted(message, 'employee')}",
    ])


async def chat_turn(body: ChatRequest, deps: ChatDeps) -> ChatResponse:
    """One chat turn. ApiError (data unreadable) and LLMError propagate: the route answers 502/503
    and the API shows its own fallback reply instead of a made-up answer."""
    started = time.perf_counter()
    conversation_id = body.conversation_id or str(uuid.uuid4())
    history = deps.memory.history(body.employee_id, conversation_id)
    ctx = await gather_chat_context(deps, body.employee_id)

    prompt = load_prompt("chat")
    user = build_chat_user_prompt(ctx, deps.today, history, body.message)
    out = await deps.llm.complete(prompt.text, user, ChatLLMOutput)

    known = ctx.policies.keys()
    citations = list(dict.fromkeys(ref for ref in out.policy_refs if ref in known))  # Drop invented keys
    reply = out.reply.strip()[:MAX_REPLY_CHARS] or "Xin lỗi, mình chưa trả lời được câu này. Bạn thử hỏi lại theo cách khác nhé."

    card = None
    if out.intent == "CREATE_REQUEST" and out.draft:
        result = await build_card(out.draft, body.employee_id, deps.api, deps.settings, deps.today)
        card = result.card
        if result.problem and not (out.missing_fields and missing_fields(out.draft)):
            reply = result.problem  # Code found what the model missed (invalid value, weekend only…)
        if card:  # Written by code so it always matches the card (the model may still ask for a field it has)
            reply = f"Mình đã soạn {card.title.lower()} ({card.data.dates}). Bạn kiểm tra thẻ bên dưới rồi bấm “Xác nhận gửi duyệt” nhé."
        if card and card.risk_level != "LOW":
            reply += " Lưu ý: đơn chưa đạt một số quy định (xem trong thẻ), nếu vẫn gửi thì đơn có thể bị từ chối hoặc chuyển cho quản lý xem xét."

    # The card is remembered as text, so "đổi sang thứ 6" can amend it in the next turn
    remembered = reply
    if card:
        d = card.data
        remembered += f"\n[Thẻ đơn đã soạn: {card.title}, {d.dates}, {d.duration_text}, lý do: {d.reason}]"
    deps.memory.add(body.employee_id, conversation_id, Turn(user=body.message, assistant=remembered))

    # No message text in logs (personal data): intent, flags and timing only
    logger.info(
        "chat turn intent=%s card=%s model=%s refs=%d injection=%s ms=%d",
        out.intent,
        card.request_type if card else "-",
        deps.llm.last_model,
        len(citations),
        detect_injection(body.message) or "-",
        (time.perf_counter() - started) * 1000,
    )
    return ChatResponse(conversation_id=conversation_id, reply=reply, citation_keys=citations, action_card=card)
