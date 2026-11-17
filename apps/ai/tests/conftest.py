from collections.abc import AsyncIterator

import httpx
import pytest

from app.mock_api.fixtures import MockStore, demo_store
from app.mock_api.server import create_mock_api
from app.tools.base import ApiClient


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def store() -> MockStore:
    return demo_store()


@pytest.fixture
async def api(store: MockStore) -> AsyncIterator[ApiClient]:
    """ApiClient wired to the in-process mock API (no network, no ports)."""
    transport = httpx.ASGITransport(app=create_mock_api(store))
    async with ApiClient("http://mock", store.token, transport=transport, backoff_s=0) as client:
        yield client
