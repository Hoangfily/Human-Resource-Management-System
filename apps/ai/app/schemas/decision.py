from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .common import ApiModel, FinalAction, RequestStatus, RiskLevel


class LLMAssessment(BaseModel):
    """Structured output the LLM must return (also used as Gemini response_schema)."""

    decision: Literal["APPROVED", "REJECTED", "ESCALATED"]
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    confidence: float = Field(ge=0, le=1)
    policy_refs: list[str] = Field(description="Policy keys from the provided list that support the decision")
    rationale: str = Field(description="Internal reasoning for the human reviewer, concise")
    employee_message: str = Field(description="Polite message to the employee, in Vietnamese")


class Trace(ApiModel):
    """Stored by the API as AgentTrace."""

    mode: Literal["CHAT", "DECISION"] = "DECISION"
    model: str
    prompt_version: str
    policy_version: str | None = None
    tool_calls: list[dict[str, Any]] = []
    policy_refs: list[str] = []
    proposed_decision: str | None = None
    risk_level: RiskLevel | None = None
    confidence: float | None = None
    rationale: str | None = None
    guard_reasons: list[str] = []
    latency_ms: int | None = None


class AiDecisionInput(ApiModel):
    """Body of POST /requests/:id/ai-decision."""

    decision: Literal["APPROVED", "REJECTED"]
    reason: str
    risk_level: RiskLevel
    confidence: float
    policy_refs: list[str]
    idempotency_key: str
    trace: Trace


class EscalateInput(ApiModel):
    """Body of POST /requests/:id/escalate."""

    reason: str
    risk_level: RiskLevel
    idempotency_key: str
    trace: Trace | None = None


class DecisionResult(ApiModel):
    id: str
    status: RequestStatus
    applied: bool = True
    escalation_reason: str | None = None


class EvaluateRequest(ApiModel):
    request_id: str


class AssessmentSummary(ApiModel):
    """LLMAssessment with camelCase keys (LLMAssessment itself stays snake_case for the LLM schema)."""

    decision: str
    risk_level: RiskLevel
    confidence: float
    policy_refs: list[str]
    rationale: str
    employee_message: str


class EvaluateResponse(ApiModel):
    request_id: str
    action: FinalAction
    status: RequestStatus | None = None  # Status reported by the API after our write
    applied: bool | None = None
    reasons: list[str] = []
    assessment: AssessmentSummary | None = None

    @field_validator("assessment", mode="before")
    @classmethod
    def _from_llm(cls, value: object) -> object:
        return value.model_dump() if isinstance(value, LLMAssessment) else value
