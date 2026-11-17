"""Measure real LLM decision quality on the live scenarios.

    python -m app.eval                      # all live LEAVE scenarios, once
    python -m app.eval --repeat 3           # each scenario 3 times (consistency)
    python -m app.eval --only sick --out results.json
    python -m app.eval --delay 10           # pace calls on a free-tier key

Runs where the LLM failed (quota, timeout) are marked ERR and excluded from quality metrics.
Exit code 1 when any request was wrongly auto-approved: the most costly error.
"""

import argparse
import asyncio
import json
import sys
import time
from collections import Counter
from dataclasses import asdict, dataclass

from .config import get_settings
from .llm import get_llm
from .scenarios import load_scenarios, run_scenario
from .schemas.common import FinalAction

AUTO = {FinalAction.APPROVE, FinalAction.REJECT}


@dataclass
class Result:
    scenario: str
    expected: str
    got: str
    correct: bool
    proposed: str | None  # What the LLM said before guardrails
    risk: str | None
    confidence: float | None
    policy_refs: list[str]
    model: str
    seconds: float
    reasons: list[str]
    llm_error: str | None = None  # Quota/timeout/etc.: the run says nothing about quality


def summarize(all_results: list[Result]) -> dict[str, float | int]:
    """Quality metrics only count runs where the LLM answered; errors are reported apart."""
    results = [r for r in all_results if not r.llm_error]
    total = len(results) or 1
    got = Counter(r.got for r in results)
    return {
        "runs": len(all_results),
        "llm_errors": len(all_results) - len(results),
        "valid_runs": len(results),
        "accuracy": sum(r.correct for r in results) / total,
        # Auto-approved although a human should have decided (or it should be rejected)
        "false_approvals": sum(r.got == "APPROVE" and r.expected != "APPROVE" for r in results),
        "false_rejections": sum(r.got == "REJECT" and r.expected != "REJECT" for r in results),
        # Should have been decided automatically but went to a human: lost automation, not a risk
        "unnecessary_escalations": sum(r.got == "ESCALATE" and r.expected in ("APPROVE", "REJECT") for r in results),
        "automation_rate": (got["APPROVE"] + got["REJECT"]) / total,
        "avg_seconds": sum(r.seconds for r in results) / total,
    }


def _llm_error(writes: list[dict]) -> str | None:
    """The LLM error recorded in the trace of the last write, if any."""
    if not writes:
        return None
    calls = writes[-1]["body"].get("trace", {}).get("toolCalls", [])
    return next((c["error"] for c in calls if c.get("tool") == "llm.assess" and "error" in c), None)


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--type", default="leave")
    parser.add_argument("--only", help="run scenarios whose id contains this text")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--out", help="write every result as JSON to this file")
    parser.add_argument("--delay", type=float, default=0, help="seconds between runs (free-tier rate limits)")
    args = parser.parse_args(argv)

    settings = get_settings()
    if settings.llm_provider == "fake":
        print("LLM_PROVIDER=fake: results say nothing about real decision quality.", file=sys.stderr)
    llm = get_llm(settings)

    scenarios = [s for s in load_scenarios(args.type) if s.live and (not args.only or args.only in s.id)]
    if not scenarios:
        print("No live scenario matches.", file=sys.stderr)
        return 2

    results: list[Result] = []
    for scenario in scenarios:
        for _ in range(args.repeat):
            started = time.perf_counter()
            response, store = await run_scenario(scenario, llm, settings)
            a = response.assessment
            llm_error = _llm_error(store.writes)
            result = Result(
                scenario=scenario.id,
                expected=scenario.expected_action.value,
                got=response.action.value,
                correct=response.action is scenario.expected_action,
                proposed=a.decision if a else None,
                risk=a.risk_level.value if a else None,
                confidence=a.confidence if a else None,
                policy_refs=a.policy_refs if a else [],
                model=llm.last_model,
                seconds=round(time.perf_counter() - started, 1),
                reasons=response.reasons,
                llm_error=llm_error,
            )
            results.append(result)
            mark = "ERR " if llm_error else "OK  " if result.correct else "FAIL"
            print(
                f"{mark} {scenario.id:<45} expected {result.expected:<8} got {result.got:<8} "
                f"llm={result.proposed or '-':<9} risk={result.risk or '-':<6} "
                f"conf={result.confidence if result.confidence is not None else '-'!s:<5} "
                f"{result.seconds:>5}s {result.model}"
            )
            if llm_error:
                print(f"     llm error: {llm_error[:200]}")
            elif not result.correct and result.reasons:
                print(f"     reasons: {'; '.join(result.reasons)}")
            if args.delay:
                await asyncio.sleep(args.delay)

    summary = summarize(results)
    print("\n" + "\n".join(f"{k:<24} {v:.2f}" if isinstance(v, float) else f"{k:<24} {v}" for k, v in summary.items()))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({"summary": summary, "results": [asdict(r) for r in results]}, f, ensure_ascii=False, indent=2)
    return 1 if summary["false_approvals"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Vietnamese output on Windows consoles
    raise SystemExit(asyncio.run(main()))
