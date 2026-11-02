"""Chat turn contract: apps/api `AgentService.chatWithAgent` -> POST /api/chat -> web `AgentChatPage`."""

from typing import Any, Literal

from pydantic import BaseModel, Field

from .common import ApiModel, RequestType, RiskLevel

MAX_MESSAGE_CHARS = 2000
MAX_REPLY_CHARS = 1500

ChatIntent = Literal["POLICY_QUESTION", "LEAVE_BALANCE", "REQUEST_STATUS", "CREATE_REQUEST", "SMALL_TALK", "OUT_OF_SCOPE"]


DraftType = Literal["LEAVE", "OVERTIME", "ATTENDANCE_EXPLANATION"]


class ChatDraft(BaseModel):
    """Request fields the employee gave so far. Null = not given yet; code checks every value."""

    request_type: DraftType
    leave_type: Literal["ANNUAL", "SICK", "UNPAID", "PERSONAL"] | None = Field(description="LEAVE only")
    start_date: str | None = Field(description="LEAVE: YYYY-MM-DD")
    end_date: str | None = Field(description="LEAVE: YYYY-MM-DD, same as start_date for one day")
    half_day: Literal["AM", "PM"] | None = Field(description="LEAVE of one day only: morning or afternoon")
    date: str | None = Field(description="OVERTIME and ATTENDANCE_EXPLANATION: YYYY-MM-DD")
    start_time: str | None = Field(description="OVERTIME: HH:mm, 24h")
    end_time: str | None = Field(description="OVERTIME: HH:mm, 24h")
    duration_hours: float | None = Field(description="OVERTIME: hours, when they give a length instead of an end time")
    issue: Literal["MISSING_CLOCK_IN", "MISSING_CLOCK_OUT", "LATE", "EARLY_LEAVE"] | None = Field(
        description="ATTENDANCE_EXPLANATION only"
    )
    requested_time: str | None = Field(description="ATTENDANCE_EXPLANATION: HH:mm the employee says is right")
    reason: str | None = Field(description="The employee's own reason, never invented")


class ChatLLMOutput(BaseModel):
    """Structured output the LLM returns for one chat turn (snake_case: it is the LLM schema, not the wire)."""

    intent: ChatIntent
    reply: str = Field(description="Answer to the employee, in Vietnamese, short")
    policy_refs: list[str] = Field(description="Keys of the provided policies the reply relies on; empty if none")
    draft: ChatDraft | None = Field(description="CREATE_REQUEST only: the request being prepared, else null")


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
    risk_level: RiskLevel  # LOW: passes the checks below; MEDIUM: will go to a manager or be refused
    status: Literal["draft"] = "draft"


class ChatResponse(ApiModel):
    conversation_id: str
    reply: str
    citation_keys: list[str] = []
    action_card: ChatActionCard | None = None
