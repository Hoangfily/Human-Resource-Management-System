"""Chat turn contract: apps/api `AgentService.chatWithAgent` -> POST /api/chat -> web `AgentChatPage`."""

from typing import Any, Literal

from pydantic import Field

from .common import ApiModel, RequestType, RiskLevel

MAX_MESSAGE_CHARS = 2000


class ChatRequest(ApiModel):
    """Sent by the API. `employee_id` is the logged-in user (from their JWT), never taken from the message."""

    employee_id: str = Field(min_length=1)
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    conversation_id: str | None = Field(default=None, max_length=100)


class PolicyCheck(ApiModel):
    rule: str  # Policy key, e.g. LEAVE.NOTICE_DAYS
    passed: bool
    description: str


class ActionCardData(ApiModel):
    """What the web card shows (labels only); the request itself is `ChatActionCard.payload`."""

    type_name: str
    dates: str
    duration_text: str
    reason: str
    leave_type: str | None = None
    days_count: float | None = None


class ChatActionCard(ApiModel):
    """A drafted request for the employee to confirm. The web creates it with the employee's own token:
    the AI never writes in chat mode."""

    id: str
    type: Literal["REQUEST_DRAFT"] = "REQUEST_DRAFT"
    title: str
    request_type: RequestType
    data: ActionCardData
    payload: dict[str, Any]  # Body `payload` for POST /requests, already in the API format
    policy_checks: list[PolicyCheck] = []
    risk_level: RiskLevel
    confidence: float = Field(ge=0, le=1)
    status: Literal["draft"] = "draft"


class ChatResponse(ApiModel):
    conversation_id: str
    reply: str
    citation_keys: list[str] = []
    action_card: ChatActionCard | None = None
