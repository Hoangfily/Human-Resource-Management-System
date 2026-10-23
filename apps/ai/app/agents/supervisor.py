"""Decision mode: evaluate one PENDING request end to end (docs/02-agent-tools.md).

get_request -> skip if not PENDING -> gather context + prompt -> LLM -> guardrails
-> decide_request or escalate_to_human (trace attached).
Fail safe: any failure after the request is loaded ends in an escalation, never a guess.
"""

import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import Any

from pydantic import ValidationError

from ..config import Settings
from ..guardrails.policy import apply_autonomy, escalation_risk
from ..llm import LLMClient, LLMError
from ..schemas.common import FinalAction, RequestStatus, RequestType
from ..schemas.decision import AiDecisionInput, DecisionResult, EscalateInput, EvaluateResponse, LLMAssessment, Trace
from ..schemas.requests import RequestDetail
from ..tools.base import ApiClient, ApiError
from ..tools.read_tools import get_autonomy_config, get_request
from ..tools.write_tools import decide_request, escalate_to_human
from .base import BuiltPrompt
from .leave_agent import build_leave_prompt, gather_leave_context
from .overtime_agent import build_overtime_prompt, gather_overtime_context


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
    RequestType.LEAVE: TypeAgent(gather_leave_context, lambda ctx, _settings: build_leave_prompt(ctx)),
    RequestType.OVERTIME: TypeAgent(gather_overtime_context, build_overtime_prompt),
}


async def evaluate_request(request_id: str, deps: EvaluationDeps) -> EvaluateResponse:
    """Raises ApiError only when the request itself cannot be loaded."""
    request = await get_request(deps.api, request_id)
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

    try:
        ctx = await agent.gather(deps.api, request, deps.today)
        built = agent.build(ctx, deps.settings)
        autonomy = await get_autonomy_config(deps.api, request.type)
    except (ApiError, ValidationError) as exc:
        return await run.escalate([f"Không lấy đủ dữ liệu để đánh giá ({_short(exc)})"])
    run.prompt_version = built.prompt_version
    run.policy_version = built.policies.version
    run.injection_flags = built.injection_flags

    started = time.perf_counter()
    try:
        assessment = await deps.llm.assess(built.system, built.user)
    except LLMError as exc:
        run.record_llm(started, error=str(exc))
        return await run.escalate(["AI không đánh giá được do lỗi kỹ thuật, cần người duyệt"])
    run.record_llm(started)
    run.assessment = assessment

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
        return await self._write(FinalAction.ESCALATE, reasons, escalate_to_human(self.deps.api, self.request.id, body))

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
        return await self._write(action, [], decide_request(self.deps.api, self.request.id, body))

    async def _write(self, action: FinalAction, reasons: list[str], call: Any) -> EvaluateResponse:
        try:
            result: DecisionResult = await call
        except ApiError as exc:
            # E.g. the request was cancelled meanwhile (409). Nothing was applied.
            return EvaluateResponse(
                request_id=self.request.id,
                action=action,
                applied=False,
                reasons=[*reasons, f"API không nhận kết quả: {exc.code}"],
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


def _short(exc: Exception) -> str:
    if isinstance(exc, ApiError):
        return exc.code
    return type(exc).__name__
