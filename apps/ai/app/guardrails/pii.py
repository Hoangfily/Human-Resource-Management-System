"""PII minimization before anything is sent to the LLM (docs/05-business-spec.md §10.2)."""

import re
from typing import Any

# Fields never sent to the LLM, in camelCase (API) and snake_case (Python) forms.
DENY_KEYS = frozenset(
    {
        "email",
        "phone",
        "fullName",
        "full_name",
        "avatarUrl",
        "avatar_url",
        "deviceInfo",
        "device_info",
        "location",
    }
)

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Vietnamese phone: 0xxxxxxxxx or +84xxxxxxxxx, separators allowed between digits.
_PHONE = re.compile(r"(?<![\d+])(?:\+84|0)(?:[\s.-]?\d){9}(?!\d)")
# Citizen ID (CCCD) is 12 digits.
_CITIZEN_ID = re.compile(r"(?<!\d)\d{12}(?!\d)")


def redact_text(text: str) -> str:
    text = _EMAIL.sub("[EMAIL]", text)
    text = _CITIZEN_ID.sub("[ID_NUMBER]", text)
    return _PHONE.sub("[PHONE]", text)


def mask_for_llm(value: Any) -> Any:
    """Drop denied keys and redact contact details inside free text, recursively."""
    if isinstance(value, dict):
        return {k: mask_for_llm(v) for k, v in value.items() if k not in DENY_KEYS}
    if isinstance(value, list):
        return [mask_for_llm(v) for v in value]
    if isinstance(value, str):
        return redact_text(value)
    return value
