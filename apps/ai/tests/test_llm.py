import asyncio
import os
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

import httpx
import openai
import pytest
from pydantic import BaseModel, ValidationError

from app.config import DEFAULT_MODELS, get_settings
from app.llm import LLMError, UnavailableLLM, get_llm
from app.llm.fake import FakeLLM
from app.llm.gemini_client import GeminiClient
from app.llm.openai_client import OpenAIClient, tuning_options
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


async def test_fallback_logs_why_the_primary_model_failed(caplog) -> None:
    async def generate_content(*, model: str, **_: Any) -> Any:
        if model == "primary":
            raise RuntimeError("503 UNAVAILABLE")
        return SimpleNamespace(parsed=ASSESSMENT)

    stub = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    with caplog.at_level("WARNING", logger="app.llm.base"):
        await GeminiClient("", "primary", fallback_models=["backup"], client=stub).assess("SYS-TEXT", "USER-TEXT")
    assert "fell back to backup" in caplog.text and "primary: call failed" in caplog.text
    assert "SYS-TEXT" not in caplog.text and "USER-TEXT" not in caplog.text  # Prompts never logged


# ---- OpenAIClient ----
def stub_openai(result: Any = None, *, raises: Exception | None = None, delay_s: float = 0) -> Any:
    """Minimal stand-in for AsyncOpenAI exposing client.responses.parse."""
    calls: list[dict[str, Any]] = []

    async def parse(**kwargs: Any) -> Any:
        calls.append(kwargs)
        if delay_s:
            await asyncio.sleep(delay_s)
        if raises:
            raise raises
        return result

    client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    client.calls = calls
    return client


async def test_openai_returns_parsed_and_sends_schema() -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=ASSESSMENT, output_text=""))
    llm = OpenAIClient("", "gpt-4.1-nano", client=stub)

    assert await llm.assess("system", "user") == ASSESSMENT
    call = stub.calls[0]
    assert (call["model"], call["instructions"], call["input"]) == ("gpt-4.1-nano", "system", "user")
    assert call["text_format"] is LLMAssessment
    assert call["temperature"] == 0.1 and "reasoning" not in call


@pytest.mark.parametrize(
    ("model", "options"),
    [
        ("gpt-5-nano", {"reasoning": {"effort": "minimal"}}),
        ("gpt-5", {"reasoning": {"effort": "minimal"}}),
        ("gpt-5.6-luna", {"reasoning": {"effort": "none"}}),
        ("gpt-6-luna", {"reasoning": {"effort": "none"}}),
        ("o4-mini", {"reasoning": {"effort": "low"}}),
        ("gpt-5-pro", {"reasoning": {"effort": "high"}}),
        ("ft:gpt-5-nano:org::id", {"reasoning": {"effort": "minimal"}}),
        ("gpt-5-chat-latest", {"temperature": 0.1}),
        ("gpt-4o-mini", {"temperature": 0.1}),
    ],
)
def test_tuning_options_pick_the_cheapest_setting_each_model_accepts(model: str, options: dict) -> None:
    assert tuning_options(model, 0.1) == options


def openai_bad_request(param: str) -> openai.BadRequestError:
    body = {"message": "Unsupported value", "type": "invalid_request_error", "param": param, "code": "unsupported_value"}
    response = httpx.Response(400, request=httpx.Request("POST", "https://api.openai.com/v1/responses"), json={"error": body})
    return openai.BadRequestError("Unsupported value", response=response, body=body)


def parse_rejecting(rejected: set[str], calls: list[dict[str, Any]]) -> Any:
    """Stub parse() that answers 400 for the given efforts ("temperature" = any temperature)."""

    async def parse(**kwargs: Any) -> Any:
        calls.append(kwargs)
        effort = kwargs.get("reasoning", {}).get("effort")
        if effort in rejected:
            raise openai_bad_request("reasoning.effort")
        if "temperature" in kwargs and "temperature" in rejected:
            raise openai_bad_request("temperature")
        return SimpleNamespace(output_parsed=ASSESSMENT)

    return SimpleNamespace(responses=SimpleNamespace(parse=parse))


async def test_openai_rejected_effort_retries_low_then_remembers_it() -> None:
    calls: list[dict[str, Any]] = []
    llm = OpenAIClient("", "gpt-5.9-new", client=parse_rejecting({"none"}, calls))
    assert await llm.assess("s", "u") == ASSESSMENT
    assert [c["reasoning"]["effort"] for c in calls] == ["none", "low"]  # Not the model's slower default
    await llm.assess("s", "u")
    assert len(calls) == 3 and calls[2]["reasoning"] == {"effort": "low"}  # No repeated rejected call


@pytest.mark.parametrize(
    ("model", "rejected", "last"),
    [("gpt-5.9-new", {"none", "low"}, {}), ("gpt-9-new", {"temperature"}, {})],
)
async def test_openai_falls_back_to_the_model_defaults_last(model: str, rejected: set[str], last: dict) -> None:
    calls: list[dict[str, Any]] = []
    assert await OpenAIClient("", model, client=parse_rejecting(rejected, calls)).assess("s", "u") == ASSESSMENT
    assert {k: v for k, v in calls[-1].items() if k in ("reasoning", "temperature")} == last


async def test_openai_asks_not_to_store_hr_prompts() -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=ASSESSMENT))
    await OpenAIClient("", "gpt-5.6-luna", client=stub).assess("s", "u")
    assert stub.calls[0]["store"] is False


async def test_openai_sdk_schema_error_is_invalid_output_without_model_text() -> None:
    try:
        LLMAssessment.model_validate_json('{"decision": "MAYBE", "note": "SECRET-REPLY"}')
    except ValidationError as exc:
        error = exc
    with pytest.raises(LLMError, match="invalid output: .* schema error") as raised:
        await OpenAIClient("", "m", client=stub_openai(raises=error)).assess("s", "u")
    assert "SECRET-REPLY" not in str(raised.value)


async def test_openai_refusal_reason_is_kept() -> None:
    refusal = SimpleNamespace(type="refusal", refusal="I can't help with that")
    response = SimpleNamespace(output_parsed=None, output_text="", output=[SimpleNamespace(content=[refusal])])
    with pytest.raises(LLMError, match="invalid output: refused: I can't help with that"):
        await OpenAIClient("", "m", client=stub_openai(response)).assess("s", "u")


async def test_openai_other_bad_requests_are_not_retried() -> None:
    stub = stub_openai(raises=openai_bad_request("input"))
    with pytest.raises(LLMError, match="BadRequestError"):
        await OpenAIClient("", "gpt-5.6-luna", client=stub).assess("s", "u")
    assert len(stub.calls) == 1


async def test_openai_falls_back_to_parsing_text() -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=None, output_text=ASSESSMENT.model_dump_json()))
    assert await OpenAIClient("", "m", client=stub).assess("s", "u") == ASSESSMENT


@pytest.mark.parametrize("text", ["I can't help with that.", '{"decision": "MAYBE"}', "", None])
async def test_openai_invalid_output_or_refusal_raises_llm_error(text: str | None) -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=None, output_text=text))
    with pytest.raises(LLMError, match="invalid output"):
        await OpenAIClient("", "m", client=stub).assess("s", "u")


async def test_openai_sdk_error_and_timeout_raise_llm_error() -> None:
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    rate_limited = openai.RateLimitError("Rate limit", response=httpx.Response(429, request=request), body=None)
    for error, name in ((rate_limited, "RateLimitError"), (openai.APITimeoutError(request), "APITimeoutError")):
        with pytest.raises(LLMError, match=f"call failed: {name}"):
            await OpenAIClient("", "m", client=stub_openai(raises=error)).assess("s", "u")
    slow = stub_openai(SimpleNamespace(output_parsed=ASSESSMENT), delay_s=1)
    with pytest.raises(LLMError, match="timed out"):
        await OpenAIClient("", "m", client=slow, timeout_s=0.05).assess("s", "u")


async def test_openai_falls_back_to_next_model_and_reports_it() -> None:
    calls: list[str] = []

    async def parse(*, model: str, **_: Any) -> Any:
        calls.append(model)
        if model == "primary":
            raise RuntimeError("500 server error")
        return SimpleNamespace(output_parsed=ASSESSMENT)

    llm = OpenAIClient("", "primary", fallback_models=["backup"], client=SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    assert await llm.assess("s", "u") == ASSESSMENT
    assert calls == ["primary", "backup"] and (llm.model, llm.last_model) == ("primary", "backup")


def test_openai_requires_api_key() -> None:
    with pytest.raises(LLMError, match="OPENAI_API_KEY"):
        OpenAIClient("", "m")


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


# ---- complete(): any structured schema (chat turns) ----
class Reply(BaseModel):
    answer: str


async def test_openai_complete_sends_the_given_schema() -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=Reply(answer="ok")))
    assert await OpenAIClient("", "gpt-5.6-luna", client=stub).complete("s", "u", Reply) == Reply(answer="ok")
    assert stub.calls[0]["text_format"] is Reply


async def test_gemini_complete_sends_the_given_schema() -> None:
    stub = stub_genai(SimpleNamespace(parsed=Reply(answer="ok"), text=None))
    assert await GeminiClient("", "m", client=stub).complete("s", "u", Reply) == Reply(answer="ok")
    assert stub.calls[0]["config"].response_schema is Reply


async def test_complete_parses_text_into_the_given_schema_and_falls_back() -> None:
    answers = iter([SimpleNamespace(output_parsed=None, output_text="not json"), SimpleNamespace(output_parsed=None, output_text='{"answer": "từ model 2"}')])

    async def parse(**kwargs: Any) -> Any:
        return next(answers)

    llm = OpenAIClient("", "a", fallback_models=["b"], client=SimpleNamespace(responses=SimpleNamespace(parse=parse)))
    assert await llm.complete("s", "u", Reply) == Reply(answer="từ model 2")
    assert llm.last_model == "b"


async def test_fake_llm_complete_checks_the_scripted_schema() -> None:
    assert await FakeLLM([Reply(answer="x")]).complete("s", "u", Reply) == Reply(answer="x")
    with pytest.raises(LLMError, match="asked for Reply"):
        await FakeLLM([ASSESSMENT]).complete("s", "u", Reply)
    with pytest.raises(LLMError, match="no scripted Reply"):
        await FakeLLM().complete("s", "u", Reply)


async def test_unavailable_llm_complete_raises() -> None:
    with pytest.raises(LLMError, match="not configured"):
        await UnavailableLLM("no key").complete("s", "u", Reply)


# ---- factory ----
def test_get_llm_by_provider() -> None:
    settings = get_settings()
    assert isinstance(get_llm(replace(settings, llm_provider="fake")), FakeLLM)
    gemini = get_llm(
        replace(settings, llm_provider="gemini", gemini_api_key="x", llm_model="gemini-m", llm_fallback_models=("gemini-f",))
    )
    assert isinstance(gemini, GeminiClient) and gemini.models == ["gemini-m", "gemini-f"]
    oa = get_llm(replace(settings, llm_provider="openai", openai_api_key="x", llm_model="gpt-m", llm_fallback_models=("gpt-f",)))
    assert isinstance(oa, OpenAIClient) and oa.models == ["gpt-m", "gpt-f"]
    with pytest.raises(ValueError):
        get_llm(replace(settings, llm_provider="nope"))


@pytest.mark.parametrize(
    ("provider", "model", "fallbacks"),
    [
        ("openai", "gemini-3.8-flash", ()),
        ("openai", "gpt-5.6-luna", ("gemini-3.5-flash",)),
        ("gemini", "gpt-5-nano", ()),
    ],
)
def test_models_of_the_other_provider_are_refused_at_startup(provider: str, model: str, fallbacks: tuple) -> None:
    settings = replace(
        get_settings(),
        llm_provider=provider,
        openai_api_key="x",
        gemini_api_key="x",
        llm_model=model,
        llm_fallback_models=fallbacks,
    )
    with pytest.raises(ValueError, match="LLM_MODEL"):
        get_llm(settings)


async def test_last_model_names_every_model_tried_when_all_fail() -> None:
    llm = OpenAIClient("", "a", fallback_models=["b"], client=stub_openai(SimpleNamespace(output_parsed=ASSESSMENT)))
    await llm.assess("s", "u")
    llm._client = stub_openai(raises=RuntimeError("down"))
    with pytest.raises(LLMError):
        await llm.assess("s", "u")
    assert llm.last_model == "a/b"  # Not "a", the model that answered the previous request


# ---- live (opt-in: RUN_LIVE_LLM=1, uses GEMINI_API_KEY from .env) ----
@pytest.mark.skipif(os.getenv("RUN_LIVE_LLM") != "1", reason="set RUN_LIVE_LLM=1 to call Gemini")
async def test_gemini_live_smoke() -> None:
    model, fallbacks = DEFAULT_MODELS["gemini"]
    llm = get_llm(replace(get_settings(), llm_provider="gemini", llm_model=model, llm_fallback_models=(fallbacks,)))
    result = await llm.assess(
        "You evaluate HR leave requests. Only cite policy keys given by the user.",
        "Policy keys: LEAVE.NOTICE_DAYS. Employee has 10 days left, asks 2 days with 10 days notice "
        "for a family trip. Reply in the required JSON; employee_message in Vietnamese.",
    )
    assert result.decision in {"APPROVED", "REJECTED", "ESCALATED"}
    assert 0 <= result.confidence <= 1


@pytest.mark.skipif(os.getenv("RUN_LIVE_LLM") != "1", reason="set RUN_LIVE_LLM=1 to call OpenAI")
async def test_openai_live_smoke() -> None:
    settings = get_settings()
    model, fallbacks = DEFAULT_MODELS["openai"]
    llm = get_llm(replace(settings, llm_provider="openai", llm_model=model, llm_fallback_models=(fallbacks,)))
    result = await llm.assess(
        "You evaluate HR leave requests. Only cite policy keys given by the user.",
        "Policy keys: LEAVE.NOTICE_DAYS. Employee has 10 days left, asks 2 days with 10 days notice "
        "for a family trip. Reply in the required JSON; employee_message in Vietnamese.",
    )
    assert result.decision in {"APPROVED", "REJECTED", "ESCALATED"}
    assert 0 <= result.confidence <= 1


def settings_from_env(monkeypatch, **env: str | None) -> Any:
    for name, value in env.items():
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    try:
        return get_settings()
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize("unset", [None, ""])  # docker-compose passes ${LLM_MODEL:-} as ""
def test_default_models_follow_the_provider(monkeypatch, unset: str | None) -> None:
    for provider in ("openai", "gemini"):
        settings = settings_from_env(
            monkeypatch, LLM_PROVIDER=provider, LLM_MODEL=unset, LLM_FALLBACK_MODELS=unset, LLM_TIMEOUT_S=unset
        )
        assert (settings.llm_model, settings.llm_fallback_models[0]) == DEFAULT_MODELS[provider]
        assert settings.llm_timeout_s == 20


@pytest.mark.parametrize(
    ("openai_key", "gemini_key", "provider"),
    [("sk-x", "", "openai"), ("", "AQ.x", "gemini"), ("sk-x", "AQ.x", "openai"), ("", "", "openai")],
)
@pytest.mark.parametrize("unset", [None, ""])
def test_provider_follows_the_key_when_unset(monkeypatch, openai_key, gemini_key, provider, unset) -> None:
    """A .env written for Gemini (no LLM_PROVIDER line) keeps working after the default became openai."""
    settings = settings_from_env(
        monkeypatch, LLM_PROVIDER=unset, OPENAI_API_KEY=openai_key, GEMINI_API_KEY=gemini_key, LLM_MODEL=None
    )
    assert settings.llm_provider == provider and settings.llm_model == DEFAULT_MODELS[provider][0]


def test_provider_follows_a_gemini_model_when_unset(monkeypatch) -> None:
    """An old .env with LLM_MODEL=gemini-... and both keys must not become openai + a Gemini model."""
    settings = settings_from_env(
        monkeypatch, LLM_PROVIDER=None, OPENAI_API_KEY="sk-x", GEMINI_API_KEY="AQ.x", LLM_MODEL="gemini-3.8-flash"
    )
    assert (settings.llm_provider, settings.llm_model) == ("gemini", "gemini-3.8-flash")


def test_provider_and_model_are_trimmed(monkeypatch) -> None:
    settings = settings_from_env(monkeypatch, LLM_PROVIDER=" OpenAI ", LLM_MODEL=" gpt-6-luna ")
    assert (settings.llm_provider, settings.llm_model) == ("openai", "gpt-6-luna")


def test_unbuildable_llm_becomes_unavailable_instead_of_raising() -> None:
    from app.llm import UnavailableLLM, get_llm_or_unavailable

    settings = get_settings()
    no_key = replace(settings, llm_provider="gemini", gemini_api_key="", llm_model="gemini-m", llm_fallback_models=())
    for broken in (no_key, replace(settings, llm_provider="nope")):
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


async def test_openai_effort_is_sent_for_reasoning_models_only() -> None:
    stub = stub_openai(SimpleNamespace(output_parsed=Reply(answer="ok")))
    llm = OpenAIClient("", "gpt-5.6-luna", client=stub)
    await llm.complete("s", "u", Reply, effort="low")
    await llm.complete("s", "u", Reply)  # Decision mode keeps the cheapest setting
    assert [c["reasoning"] for c in stub.calls] == [{"effort": "low"}, {"effort": "none"}]

    stub = stub_openai(SimpleNamespace(output_parsed=Reply(answer="ok")))
    await OpenAIClient("", "gpt-4.1-mini", client=stub).complete("s", "u", Reply, effort="low")
    assert "reasoning" not in stub.calls[0] and "temperature" in stub.calls[0]


async def test_rejected_effort_falls_back_and_is_remembered_per_effort() -> None:
    calls: list[dict[str, Any]] = []
    llm = OpenAIClient("", "gpt-5.9-new", client=parse_rejecting({"low"}, calls))
    await llm.complete("s", "u", ASSESSMENT.__class__, effort="low")
    await llm.complete("s", "u", ASSESSMENT.__class__, effort="low")
    assert [c.get("reasoning") for c in calls] == [{"effort": "low"}, None, None]


def test_effort_never_lowers_a_models_own_setting() -> None:
    from app.llm.openai_client import _more

    assert _more("low", "none") and _more("low", "minimal")
    assert not _more("low", "high") and not _more("low", "low") and not _more("weird", "none")
