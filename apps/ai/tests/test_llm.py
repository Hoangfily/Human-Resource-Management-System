import asyncio
import os
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

import pytest

from app.config import get_settings
from app.llm import LLMError, get_llm
from app.llm.fake import FakeLLM
from app.llm.gemini_client import GeminiClient
from app.schemas.decision import LLMAssessment

pytestmark = pytest.mark.anyio

ASSESSMENT = LLMAssessment(
    decision="APPROVED",
    risk_level="LOW",
    confidence=0.92,
    policy_refs=["LEAVE.NOTICE_DAYS"],
    rationale="Đủ phép, báo trước đúng hạn",
    employee_message="Đơn nghỉ của bạn đã được duyệt.",
)


def stub_genai(result: Any = None, *, raises: Exception | None = None, delay_s: float = 0) -> Any:
    """Minimal stand-in for genai.Client exposing client.aio.models.generate_content."""
    calls: list[dict[str, Any]] = []

    async def generate_content(**kwargs: Any) -> Any:
        calls.append(kwargs)
        if delay_s:
            await asyncio.sleep(delay_s)
        if raises:
            raise raises
        return result

    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    client.calls = calls
    return client


# ---- GeminiClient ----
async def test_gemini_returns_parsed_and_sends_schema() -> None:
    stub = stub_genai(SimpleNamespace(parsed=ASSESSMENT, text=None))
    llm = GeminiClient("", "gemini-test", client=stub)

    assert await llm.assess("system", "user") == ASSESSMENT
    call = stub.calls[0]
    assert call["model"] == "gemini-test" and call["contents"] == "user"
    assert call["config"].response_schema is LLMAssessment
    assert call["config"].system_instruction == "system"


async def test_gemini_falls_back_to_parsing_text() -> None:
    stub = stub_genai(SimpleNamespace(parsed=None, text=ASSESSMENT.model_dump_json()))
    assert await GeminiClient("", "m", client=stub).assess("s", "u") == ASSESSMENT


@pytest.mark.parametrize("text", ["not json", '{"decision": "MAYBE"}', "", None])
async def test_gemini_invalid_output_raises_llm_error(text: str | None) -> None:
    stub = stub_genai(SimpleNamespace(parsed=None, text=text))
    with pytest.raises(LLMError, match="invalid output"):
        await GeminiClient("", "m", client=stub).assess("s", "u")


async def test_gemini_sdk_error_raises_llm_error() -> None:
    stub = stub_genai(raises=RuntimeError("429 RESOURCE_EXHAUSTED"))
    with pytest.raises(LLMError, match="RESOURCE_EXHAUSTED"):
        await GeminiClient("", "m", client=stub).assess("s", "u")


async def test_gemini_timeout_raises_llm_error() -> None:
    stub = stub_genai(SimpleNamespace(parsed=ASSESSMENT), delay_s=1)
    with pytest.raises(LLMError, match="timed out"):
        await GeminiClient("", "m", client=stub, timeout_s=0.05).assess("s", "u")


async def test_gemini_falls_back_to_next_model_and_reports_it() -> None:
    calls: list[str] = []

    async def generate_content(*, model: str, **_: Any) -> Any:
        calls.append(model)
        if model == "primary":
            raise RuntimeError("503 UNAVAILABLE")
        return SimpleNamespace(parsed=ASSESSMENT)

    stub = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    llm = GeminiClient("", "primary", fallback_models=["backup"], client=stub)

    assert await llm.assess("s", "u") == ASSESSMENT
    assert calls == ["primary", "backup"]
    assert (llm.model, llm.last_model) == ("primary", "backup")


async def test_gemini_all_models_fail_lists_every_error() -> None:
    stub = stub_genai(raises=RuntimeError("503 UNAVAILABLE"))
    llm = GeminiClient("", "a", fallback_models=["b", "a"], client=stub)  # Duplicate "a" ignored
    with pytest.raises(LLMError) as exc:
        await llm.assess("s", "u")
    assert [c["model"] for c in stub.calls] == ["a", "b"]
    assert "a: call failed" in str(exc.value) and "b: call failed" in str(exc.value)


def test_gemini_requires_api_key() -> None:
    with pytest.raises(LLMError, match="GEMINI_API_KEY"):
        GeminiClient("", "m")


# ---- FakeLLM ----
async def test_fake_llm_scripted_order_last_repeats_and_records_prompts() -> None:
    second = ASSESSMENT.model_copy(update={"decision": "REJECTED"})
    llm = FakeLLM([ASSESSMENT, second])

    assert (await llm.assess("s1", "u1")).decision == "APPROVED"
    assert (await llm.assess("s2", "u2")).decision == "REJECTED"
    assert (await llm.assess("s3", "u3")).decision == "REJECTED"
    assert llm.prompts == [("s1", "u1"), ("s2", "u2"), ("s3", "u3")]


async def test_fake_llm_raises_scripted_errors_as_llm_error() -> None:
    with pytest.raises(LLMError):
        await FakeLLM([TimeoutError("slow")]).assess("s", "u")


async def test_fake_llm_without_script_escalates() -> None:
    result = await FakeLLM().assess("s", "u")
    assert (result.decision, result.confidence) == ("ESCALATED", 0.0)


# ---- factory ----
def test_get_llm_by_provider() -> None:
    settings = get_settings()
    assert isinstance(get_llm(replace(settings, llm_provider="fake")), FakeLLM)
    gemini = get_llm(
        replace(settings, llm_provider="gemini", gemini_api_key="x", llm_model="m", llm_fallback_models=("f",))
    )
    assert isinstance(gemini, GeminiClient) and gemini.models == ["m", "f"]
    with pytest.raises(ValueError):
        get_llm(replace(settings, llm_provider="nope"))


# ---- live (opt-in: RUN_LIVE_LLM=1, uses GEMINI_API_KEY from .env) ----
@pytest.mark.skipif(os.getenv("RUN_LIVE_LLM") != "1", reason="set RUN_LIVE_LLM=1 to call Gemini")
async def test_gemini_live_smoke() -> None:
    llm = get_llm(replace(get_settings(), llm_provider="gemini"))
    result = await llm.assess(
        "You evaluate HR leave requests. Only cite policy keys given by the user.",
        "Policy keys: LEAVE.NOTICE_DAYS. Employee has 10 days left, asks 2 days with 10 days notice "
        "for a family trip. Reply in the required JSON; employee_message in Vietnamese.",
    )
    assert result.decision in {"APPROVED", "REJECTED", "ESCALATED"}
    assert 0 <= result.confidence <= 1


def test_unbuildable_llm_becomes_unavailable_instead_of_raising() -> None:
    from app.llm import UnavailableLLM, get_llm_or_unavailable

    settings = get_settings()
    for broken in (replace(settings, llm_provider="gemini", gemini_api_key=""), replace(settings, llm_provider="nope")):
        llm = get_llm_or_unavailable(broken)
        assert isinstance(llm, UnavailableLLM) and llm.last_model == "unavailable"


async def test_unavailable_llm_always_raises_llm_error() -> None:
    from app.llm import UnavailableLLM

    with pytest.raises(LLMError, match="not configured: no key"):
        await UnavailableLLM("no key").assess("s", "u")


def test_any_build_error_becomes_unavailable(monkeypatch) -> None:
    import app.llm as llm_module

    def no_sdk(settings):
        raise ImportError("No module named 'google.genai'")

    monkeypatch.setattr(llm_module, "get_llm", no_sdk)
    llm = llm_module.get_llm_or_unavailable(get_settings())
    assert isinstance(llm, llm_module.UnavailableLLM) and "ImportError" in llm.cause
