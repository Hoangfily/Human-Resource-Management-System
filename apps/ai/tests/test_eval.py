from app.eval import Result, summarize


def result(expected: str, got: str, llm_error: str | None = None) -> Result:
    return Result(
        scenario="s",
        expected=expected,
        got=got,
        correct=expected == got,
        proposed=None,
        risk=None,
        confidence=None,
        policy_refs=[],
        model="m",
        seconds=1.0,
        reasons=[],
        llm_error=llm_error,
    )


def test_summary_counts_error_types() -> None:
    summary = summarize(
        [
            result("APPROVE", "APPROVE"),
            result("ESCALATE", "APPROVE"),  # False approval: the dangerous one
            result("APPROVE", "REJECT"),  # False rejection
            result("REJECT", "ESCALATE"),  # Unnecessary escalation
        ]
    )
    assert summary["accuracy"] == 0.25
    assert (summary["false_approvals"], summary["false_rejections"], summary["unnecessary_escalations"]) == (1, 1, 1)
    assert summary["automation_rate"] == 0.75


def test_llm_errors_are_excluded_from_quality_metrics() -> None:
    summary = summarize([result("APPROVE", "APPROVE"), result("ESCALATE", "ESCALATE", llm_error="429")])
    assert (summary["runs"], summary["llm_errors"], summary["valid_runs"]) == (2, 1, 1)
    assert summary["accuracy"] == 1.0  # The errored run does not count as a lucky "correct"


def test_all_errors_does_not_divide_by_zero() -> None:
    summary = summarize([result("APPROVE", "ESCALATE", llm_error="429")])
    assert summary["valid_runs"] == 0 and summary["accuracy"] == 0
