from enum import StrEnum

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Snake_case in Python, camelCase on the wire (API contract)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    def to_api(self) -> dict:
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


# Enums mirror packages/shared/src/enums.
class RequestType(StrEnum):
    LEAVE = "LEAVE"
    OVERTIME = "OVERTIME"
    ATTENDANCE_EXPLANATION = "ATTENDANCE_EXPLANATION"
    SHIFT_CHANGE = "SHIFT_CHANGE"


class RequestStatus(StrEnum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    ESCALATED = "ESCALATED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class AutonomyLevel(StrEnum):
    SUGGEST_ONLY = "SUGGEST_ONLY"
    AUTO_APPROVE_LOW_RISK = "AUTO_APPROVE_LOW_RISK"
    AUTO_DECIDE_LOW_RISK = "AUTO_DECIDE_LOW_RISK"


class ActorType(StrEnum):
    HUMAN = "HUMAN"
    AI = "AI"
    SYSTEM = "SYSTEM"


class FinalAction(StrEnum):
    """What the AI service ends up doing with a request."""

    APPROVE = "APPROVE"
    REJECT = "REJECT"
    ESCALATE = "ESCALATE"
    SKIP = "SKIP"  # Request is not PENDING; nothing to do
