"""Chat mode (docs/02-agent-tools.md): answers one employee about policy, their balance and requests,
and drafts requests for them to confirm. Reads only that employee's data; never writes."""

import uuid
from dataclasses import dataclass
from datetime import date

from ..config import Settings
from ..llm import LLMClient
from ..schemas.chat import ChatRequest, ChatResponse
from ..tools.base import ApiClient


@dataclass
class ChatDeps:
    api: ApiClient
    llm: LLMClient
    settings: Settings
    today: date  # Company timezone


async def chat_turn(body: ChatRequest, deps: ChatDeps) -> ChatResponse:
    conversation_id = body.conversation_id or str(uuid.uuid4())
    # Step 1 of the chat plan: contract only. Policy Q&A, balance, request status and drafts come next.
    return ChatResponse(
        conversation_id=conversation_id,
        reply="Trợ lý AI đang được hoàn thiện, hiện chưa trả lời được câu hỏi này.",
    )
