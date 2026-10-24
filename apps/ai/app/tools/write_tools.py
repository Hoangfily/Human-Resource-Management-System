"""Guarded, auditable write tools that call the HR API (docs/02-agent-tools.md).

The API re-checks hard rules and autonomy limits; it may answer `applied: false`
and escalate instead of applying the AI decision.
"""

from ..schemas.decision import AiDecisionInput, DecisionResult, EscalateInput
from .base import ApiClient


async def decide_request(api: ApiClient, request_id: str, body: AiDecisionInput) -> DecisionResult:
    return DecisionResult.model_validate(await api.post(f"/requests/{request_id}/ai-decision", body.to_api()))


async def escalate_to_human(api: ApiClient, request_id: str, body: EscalateInput) -> DecisionResult:
    return DecisionResult.model_validate(await api.post(f"/requests/{request_id}/escalate", body.to_api()))
