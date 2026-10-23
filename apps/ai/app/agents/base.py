"""What every request-type agent hands back to the supervisor."""

import json
from dataclasses import dataclass, field
from datetime import date

from ..schemas.requests import PolicySet

WEEKDAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"]


@dataclass(frozen=True)
class BuiltPrompt:
    system: str
    user: str
    prompt_version: str
    policies: PolicySet
    injection_flags: list[str]
    # Type-specific limits already broken (deterministic, computed by the agent):
    # each one forces an escalation in apply_autonomy.
    limit_reasons: list[str] = field(default_factory=list)
    days_requested: float | None = None  # LEAVE only


def day_label(d: date) -> str:
    return f"{d.isoformat()} ({WEEKDAYS[d.weekday()]})"


def to_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def policy_lines(policies: PolicySet) -> str:
    return "\n".join(f"- {p.key}: {p.title}. {p.content}" for p in policies.items)
