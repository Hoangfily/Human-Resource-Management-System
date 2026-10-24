# Evaluation scenarios

Synthetic requests with the decision a careful HR officer would make. Format: see the docstring of `app/scenarios.py`.

- `pytest` runs every scenario offline with its scripted `llm` answer (pipeline + guardrails).
- `python -m app.eval` runs the `live` ones against the real LLM and reports accuracy, false approvals/rejections and automation rate. Use `--delay` on a free-tier key.

Target 50-100 reviewed cases per request type before enabling autonomous actions in production. Use synthetic data only.
