"""User-written text (reason, explanation) is data, never instructions (spec §7.2).

Two layers: the text is fenced in <untrusted> tags the prompt tells the model to treat
as data, and a heuristic detector flags injection attempts so the request is escalated
even if the model is fooled.
"""

import re
import unicodedata

_PATTERNS: dict[str, re.Pattern[str]] = {
    # Patterns run on lowercase text without Vietnamese diacritics (see _normalize).
    "ignore_instructions": re.compile(
        r"\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?|previous|above)\b"
        r"|\b(bo qua|quen|phot lo|vo hieu)\b.{0,40}\b(huong dan|chi dan|quy tac|quy dinh|lenh|prompt)\b"
    ),
    "role_override": re.compile(
        r"\b(you are now|act as|pretend to be|system prompt|developer mode|jailbreak)\b"
        r"|\b(ban la|dong vai|gia lam)\b.{0,30}\b(admin|quan tri|he thong|developer|hr|quan ly)\b"
    ),
    "force_decision": re.compile(
        r"\b(must|you should|please)\s+(auto[- ]?)?approve\b|\bauto[- ]?approve\b"
        r"|\b(hay|phai|bat buoc|yeu cau ai)\s+(tu dong\s+)?(duyet|phe duyet|chap thuan)\b"
        r"|\b(duyet|phe duyet) ngay\b"
    ),
    "output_spoof": re.compile(r"[\"']?\b(decision|risk_level|riskLevel|confidence|policy_refs)\b[\"']?\s*[:=]", re.I),
    "tag_spoof": re.compile(r"<\s*/?\s*(untrusted|system|instructions?|assistant)\b", re.I),
}


def _normalize(text: str) -> str:
    text = text.lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def detect_injection(text: str) -> list[str]:
    """Names of the injection patterns found in `text` (empty list = looks clean)."""
    normalized = _normalize(text)
    found = []
    for name, pattern in _PATTERNS.items():
        target = text if name in ("output_spoof", "tag_spoof") else normalized
        if pattern.search(target):
            found.append(name)
    return found


def wrap_untrusted(text: str, field: str) -> str:
    """Fence user text; angle brackets are neutralised so it cannot close the fence."""
    safe = text.replace("<", "‹").replace(">", "›")
    return f'<untrusted field="{field}">\n{safe}\n</untrusted>'
