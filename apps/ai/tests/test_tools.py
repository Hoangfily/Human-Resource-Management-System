import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.llm import UnavailableLLM
from app.llm.fake import FakeLLM
from app.main import app


def test_health_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "llm_client", lambda: FakeLLM())
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai", "llm": "fake-llm"}


def test_health_reports_unavailable_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "llm_client", lambda: UnavailableLLM("LLMError: GEMINI_API_KEY is not set"))
    body = TestClient(app).get("/health").json()

    assert (body["status"], body["llm"]) == ("degraded", "unavailable")
    assert "detail" not in body  # The cause stays in the log (route is unauthenticated)
