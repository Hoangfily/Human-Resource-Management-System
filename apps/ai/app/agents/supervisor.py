"""Decision mode: evaluate one PENDING request end to end (docs/02-agent-tools.md).

get_request -> skip if not PENDING -> gather context + prompt -> LLM -> guardrails
-> decide_request or escalate_to_human (trace attached).
Fail safe: any failure after the request is loaded ends in an escalation, never a guess.
"""

import logging
import os
import time
import traceback
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import ValidationError

from ..config import Settings
from ..guardrails.policy import apply_autonomy, escalation_risk
from ..llm import LLMClient, LLMError
from ..schemas.common import FinalAction, RequestStatus, RequestType, RiskLevel
from ..schemas.decision import AiDecisionInput, DecisionResult, EscalateInput, EvaluateResponse, LLMAssessment, Trace
from ..schemas.requests import RequestDetail
from ..tools.base import ApiClient, ApiError
from ..tools.read_tools import get_autonomy_config, get_request
from ..tools.write_tools import decide_request, escalate_to_human
from .attendance_agent import build_attendance_prompt, gather_attendance_context
from .base import BuiltPrompt
from .leave_agent import build_leave_prompt, gather_leave_context
from .overtime_agent import build_overtime_prompt, gather_overtime_context
from .shift_agent import build_shift_prompt, gather_shift_context

logger = logging.getLogger(__name__)


@dataclass
class EvaluationDeps:
    api: ApiClient
    llm: LLMClient
    settings: Settings
    today: date  # In company timezone


@dataclass(frozen=True)
class TypeAgent:
    """One specialist per request type: gathers its context, then builds its prompt."""

    gather: Callable[[ApiClient, RequestDetail, date], Awaitable[Any]]
    build: Callable[[Any, Settings], BuiltPrompt]


AGENTS: dict[RequestType, TypeAgent] = {
    RequestType.LEAVE: TypeAgent(gather_leave_context, build_leave_prompt),
    RequestType.OVERTIME: TypeAgent(gather_overtime_context, build_overtime_prompt),
    RequestType.ATTENDANCE_EXPLANATION: TypeAgent(gather_attendance_context, build_attendance_prompt),
    RequestType.SHIFT_CHANGE: TypeAgent(gather_shift_context, build_shift_prompt),
}


async def evaluate_request(request_id: str, deps: EvaluationDeps) -> EvaluateResponse:
    """Raises ApiError only when the request itself cannot be loaded."""
    try:
        request = await get_request(deps.api, request_id)
    except ApiError:
        raise
    except Exception as exc:  # The API answered, but with a request we cannot read
        _log_failure("Unreadable request %s", request_id, exc)
        return await _escalate_unreadable(deps, request_id, exc)
    if request.status is not RequestStatus.PENDING:
        return EvaluateResponse(
            request_id=request.id,
            action=FinalAction.SKIP,
            status=request.status,
            reasons=[f"Đơn đang ở trạng thái {request.status}, không cần AI đánh giá"],
        )

    run = _Run(deps, request)
    agent = AGENTS.get(request.type)
    if agent is None:
        return await run.escalate([f"Loại đơn {request.type} chưa được AI hỗ trợ"])

    # From here on the request is known: every failure must end in an escalation, never a 500
    # that leaves it PENDING with nobody assigned (unexpected data shapes, bad template times...).
    try:
        ctx = await agent.gather(deps.api, request, deps.today)
        built = agent.build(ctx, deps.settings)
        autonomy = await get_autonomy_config(deps.api, request.type)
    except Exception as exc:
        if not isinstance(exc, (ApiError, ValidationError)):
            _log_failure("Unexpected error while preparing request %s", request.id, exc)
        return await run.escalate([f"Không lấy đủ dữ liệu để đánh giá ({_short(exc)})"])
    run.prompt_version = built.prompt_version
    run.policy_version = built.policies.version
    run.injection_flags = built.injection_flags

    started = time.perf_counter()
    try:
        assessment = await deps.llm.assess(built.system, built.user)
    except Exception as exc:  # LLMError, or a bug in an LLM client
        # LLMError messages are ours; other messages may carry prompt or payload text, so the
        # trace (stored by the API, read by HR) only gets the exception type. Details go to the log.
        if isinstance(exc, LLMError):
            error = str(exc)
        else:
            _log_failure("Unexpected LLM client error for request %s", request.id, exc)
            error = type(exc).__name__
        run.record_llm(started, error=error)
        return await run.escalate(["AI không đánh giá được do lỗi kỹ thuật, cần người duyệt"])
    run.record_llm(started)
    run.assessment = assessment

    try:
        guard = apply_autonomy(
            assessment,
            autonomy,
            known_policy_keys=built.policies.keys(),
            global_min_confidence=deps.settings.ai_min_confidence,
            injection_flags=built.injection_flags,
            days_requested=built.days_requested,
            max_auto_days=deps.settings.ai_max_auto_leave_days,
            limit_reasons=built.limit_reasons,
        )
    except Exception as exc:
        _log_failure("Unexpected guardrail error for request %s", request.id, exc)
        return await run.escalate([f"Lỗi khi kiểm tra điều kiện tự quyết ({type(exc).__name__})"])
    if guard.action is FinalAction.ESCALATE:
        return await run.escalate(guard.reasons)
    return await run.decide(guard.action)


@dataclass
class _Run:
    """State of one evaluation, used to build the trace and the write calls."""

    deps: EvaluationDeps
    request: RequestDetail
    prompt_version: str = "none"
    policy_version: str | None = None
    injection_flags: list[str] | None = None
    assessment: LLMAssessment | None = None
    llm_call: dict[str, Any] | None = None

    @property
    def idempotency_key(self) -> str:
        # Stable for one version of the request: a retried /evaluate cannot decide twice.
        return f"ai-eval:{self.request.id}:{self.request.updated_at.isoformat()}"

    def record_llm(self, started: float, error: str | None = None) -> None:
        self.llm_call = {
            "tool": "llm.assess",
            "model": self.deps.llm.last_model,
            "ms": round((time.perf_counter() - started) * 1000),
        }
        if error:
            self.llm_call["error"] = error[:300]

    def trace(self, guard_reasons: list[str]) -> Trace:
        a = self.assessment
        calls = list(self.deps.api.calls) + ([self.llm_call] if self.llm_call else [])
        return Trace(
            model=self.deps.llm.last_model,
            prompt_version=self.prompt_version,
            policy_version=self.policy_version,
            tool_calls=calls,
            policy_refs=a.policy_refs if a else [],
            proposed_decision=a.decision if a else None,
            risk_level=a.risk_level if a else None,
            confidence=a.confidence if a else None,
            rationale=a.rationale if a else None,
            guard_reasons=guard_reasons,
            latency_ms=self.llm_call["ms"] if self.llm_call else None,
        )

    async def escalate(self, reasons: list[str]) -> EvaluateResponse:
        reason = "; ".join(reasons)
        if self.assessment:
            reason += f". Nhận định của AI: {self.assessment.rationale}"
        body = EscalateInput(
            reason=reason,
            risk_level=escalation_risk(self.assessment, self.injection_flags or ()),
            idempotency_key=self.idempotency_key,
            trace=self.trace(reasons),
        )
        return await self._write(FinalAction.ESCALATE, reasons, lambda: escalate_to_human(self.deps.api, self.request.id, body))

    async def decide(self, action: FinalAction) -> EvaluateResponse:
        a = self.assessment
        assert a is not None and a.decision in ("APPROVED", "REJECTED")
        body = AiDecisionInput(
            decision=a.decision,
            reason=a.employee_message,
            risk_level=a.risk_level,
            confidence=a.confidence,
            policy_refs=a.policy_refs,
            idempotency_key=self.idempotency_key,
            trace=self.trace([]),
        )
        return await self._write(action, [], lambda: decide_request(self.deps.api, self.request.id, body))

    async def _after_uncertain_write(
        self, action: FinalAction, reasons: list[str], send: Callable[[], Awaitable[DecisionResult]], exc: ApiError, retried: bool
    ) -> EvaluateResponse:
        """The write timed out or conflicted: look at the request before deciding what happened."""
        target = {
            FinalAction.APPROVE: RequestStatus.APPROVED,
            FinalAction.REJECT: RequestStatus.REJECTED,
            FinalAction.ESCALATE: RequestStatus.ESCALATED,
        }[action]
        try:
            now = (await get_request(self.deps.api, self.request.id)).status
        except Exception:
            now = None
        if now is RequestStatus.PENDING and not retried:
            # Nothing landed: send the same write once more (same idempotency key).
            return await self._write(action, reasons, send, retried=True)
        applied: bool | None = False
        if now is target:
            note = f"Đơn đã ở trạng thái {now} (có thể do chính lần ghi này), cần kiểm tra lại"
            applied = None  # Cannot tell whether it was us or a person
        elif now is RequestStatus.ESCALATED:
            note = "API đã chuyển đơn cho người duyệt"
        else:
            note = f"API không nhận kết quả: {exc.code}" + (f", đơn đang ở trạng thái {now}" if now else "")
        return EvaluateResponse(
            request_id=self.request.id,
            action=action,
            status=now,
            applied=applied,
            reasons=[*reasons, note],
            assessment=self.assessment,
        )

    async def _write(
        self,
        action: FinalAction,
        reasons: list[str],
        send: Callable[[], Awaitable[DecisionResult]],
        retried: bool = False,
    ) -> EvaluateResponse:
        try:
            result = await send()
        except ApiError as exc:
            if exc.code == "WRITE_OUTCOME_UNKNOWN" or exc.status == 409:
                # The write may have landed (timeout), or the request moved on (cancelled, decided by
                # a manager, or by our own earlier attempt).
                return await self._after_uncertain_write(action, reasons, send, exc, retried)
            # Anything else (400, 404, 5xx...) was refused: the request stays where it was, PENDING
            # requests remain in the manager's queue.
            return EvaluateResponse(
                request_id=self.request.id,
                action=action,
                applied=False,
                reasons=[*reasons, f"API không nhận kết quả: {exc.code}"],
                assessment=self.assessment,
            )
        except Exception as exc:
            # The API answered something unreadable: whether the write happened is unknown.
            _log_failure("Unreadable API answer while writing request %s", self.request.id, exc)
            return EvaluateResponse(
                request_id=self.request.id,
                action=action,
                applied=None,
                reasons=[*reasons, f"Không đọc được phản hồi của API ({type(exc).__name__}), cần kiểm tra lại đơn"],
                assessment=self.assessment,
            )
        if not result.applied and result.escalation_reason:
            reasons = [*reasons, f"API chuyển cho người duyệt: {result.escalation_reason}"]
        return EvaluateResponse(
            request_id=self.request.id,
            action=action,
            status=result.status,
            applied=result.applied,
            reasons=reasons,
            assessment=self.assessment,
        )

async def _escalate_unreadable(deps: EvaluationDeps, request_id: str, exc: Exception) -> EvaluateResponse:
    """Hand a request we cannot parse to a human by id, without context or trace."""
    reason = f"AI không đọc được dữ liệu đơn ({type(exc).__name__}), cần người duyệt"
    body = EscalateInput(reason=reason, risk_level=RiskLevel.MEDIUM, idempotency_key=f"ai-eval:{request_id}:unreadable")
    try:
        result = await escalate_to_human(deps.api, request_id, body)
    except Exception as escalate_error:
        _log_failure("Could not escalate unreadable request %s", request_id, escalate_error)
        return EvaluateResponse(request_id=request_id, action=FinalAction.ESCALATE, applied=False, reasons=[reason])
    return EvaluateResponse(
        request_id=request_id, action=FinalAction.ESCALATE, status=result.status, applied=result.applied, reasons=[reason]
    )


def _log_failure(message: str, request_id: str, exc: Exception) -> None:
    """Log what failed without the data: pydantic messages embed input values (free-text reasons,
    phone numbers...), and other exception texts may echo the prompt or the payload."""
    if isinstance(exc, ValidationError):
        fields = ", ".join(".".join(str(part) for part in e["loc"]) or "<root>" for e in exc.errors(include_input=False))
        detail = f"ValidationError on {fields}"
    elif isinstance(exc, ApiError):
        detail = f"ApiError {exc.status} {exc.code}"
    else:
        # Where it failed (file, line, function) helps debugging; the message text may hold data.
        frames = traceback.extract_tb(exc.__traceback__)[-3:]
        where = " <- ".join(f"{os.path.basename(f.filename)}:{f.lineno} {f.name}" for f in reversed(frames))
        detail = f"{type(exc).__name__} at {where}" if where else type(exc).__name__
    logger.error(message + " (%s)", request_id, detail)


def _short(exc: Exception) -> str:
    if isinstance(exc, ApiError):
        return exc.code
    return type(exc).__name__
