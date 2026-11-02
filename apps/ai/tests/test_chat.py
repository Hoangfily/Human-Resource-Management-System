"""HTTP /api/chat contract (apps/api AgentService.chatWithAgent -> AI -> web AgentChatPage)."""

from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import date

import httpx
import pytest

from app.agents.chat_agent import ChatDeps
from app.config import get_settings
from app.deps import get_chat_deps
from app.llm.fake import FakeLLM
from app.main import app
from app.schemas.chat import MAX_MESSAGE_CHARS
from app.tools.base import ApiClient

pytestmark = pytest.mark.anyio

TOKEN = "test-inbound-token"
HEADERS = {"X-Service-Token": TOKEN}


@pytest.fixture
async def client(api: ApiClient) -> AsyncIterator[httpx.AsyncClient]:
    settings = replace(get_settings(), ai_inbound_token=TOKEN, ai_service_token="svc")

    async def deps() -> AsyncIterator[ChatDeps]:
        yield ChatDeps(api=api, llm=FakeLLM(), settings=settings, today=date(2026, 11, 3))

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_chat_deps] = deps
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://ai") as c:
        yield c
    app.dependency_overrides.clear()


async def chat(client: httpx.AsyncClient, body: dict, headers: dict = HEADERS) -> httpx.Response:
    return await client.post("/api/chat", json=body, headers=headers)


async def test_turn_uses_the_api_field_names(client: httpx.AsyncClient) -> None:
    response = await chat(client, {"employeeId": "emp-1", "message": "Tôi còn bao nhiêu ngày phép?", "conversationId": "conv-7"})
    assert response.status_code == 200
    body = response.json()
    assert body["conversationId"] == "conv-7"
    assert isinstance(body["reply"], str) and body["reply"]
    assert body["citationKeys"] == []
    assert "actionCard" not in body  # Omitted, not null, when there is no draft


async def test_new_conversation_gets_an_id(client: httpx.AsyncClient) -> None:
    first = (await chat(client, {"employeeId": "emp-1", "message": "Xin chào"})).json()
    second = (await chat(client, {"employeeId": "emp-1", "message": "Xin chào"})).json()
    assert first["conversationId"] and first["conversationId"] != second["conversationId"]


@pytest.mark.parametrize("headers", [{}, {"X-Service-Token": "wrong"}])
async def test_only_the_api_may_call(client: httpx.AsyncClient, headers: dict) -> None:
    assert (await chat(client, {"employeeId": "emp-1", "message": "hi"}, headers)).status_code == 401


async def test_fails_closed_without_inbound_token(client: httpx.AsyncClient) -> None:
    app.dependency_overrides[get_settings] = lambda: replace(get_settings(), ai_inbound_token="", ai_service_token="svc")
    assert (await chat(client, {"employeeId": "emp-1", "message": "hi"})).status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"message": "hi"},  # No employee: the AI would not know whose data to read
        {"employeeId": "", "message": "hi"},
        {"employeeId": "emp-1", "message": ""},
        {"employeeId": "emp-1", "message": "x" * (MAX_MESSAGE_CHARS + 1)},
    ],
)
async def test_invalid_turn_is_rejected(client: httpx.AsyncClient, body: dict) -> None:
    assert (await chat(client, body)).status_code == 422
