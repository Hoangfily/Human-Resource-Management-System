"""Versioned prompts. First line of each file: `<!-- version: <name>@<n> -->`.

Bump the version on every wording change: it is stored in each AgentTrace, so
evaluation results can be tied to the exact prompt that produced them.
"""

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_DIR = Path(__file__).parent
_HEADER = re.compile(r"^<!--\s*version:\s*(\S+)\s*-->\s*\n")


@dataclass(frozen=True)
class Prompt:
    version: str
    text: str


@lru_cache
def load_prompt(name: str) -> Prompt:
    raw = (_DIR / f"{name}.md").read_text(encoding="utf-8")
    match = _HEADER.match(raw)
    if not match:
        raise ValueError(f"Prompt {name}.md is missing its version header")
    return Prompt(version=match.group(1), text=raw[match.end() :].strip())
