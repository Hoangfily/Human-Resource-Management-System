import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from ..agents.supervisor import EvaluationDeps, evaluate_request
from ..config import Settings, get_settings
from ..deps import get_evaluation_deps
from ..schemas.decision import EvaluateRequest, EvaluateResponse
from ..tools.base import ApiError

router = APIRouter()


def require_service_token(
    x_service_token: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    """Only the HR API may call the AI service (fail closed if no token is configured)."""
    if not settings.ai_inbound_token:
        raise HTTPException(status_code=503, detail="AI_INBOUND_TOKEN is not configured")
    if not hmac.compare_digest(x_service_token.encode(), settings.ai_inbound_token.encode()):  # bytes: no TypeError on non-ASCII
        raise HTTPException(status_code=401, detail="Invalid service token")


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    response_model_exclude_none=True,
    dependencies=[Depends(require_service_token)],
)
async def evaluate(
    body: EvaluateRequest,
    deps: EvaluationDeps = Depends(get_evaluation_deps),
) -> EvaluateResponse | JSONResponse:
    """Called by the API when a request becomes PENDING."""
    try:
        return await evaluate_request(body.request_id, deps)
    except ApiError as exc:  # The request itself could not be loaded
        status = 404 if exc.status == 404 else 502
        return JSONResponse(
            status_code=status,
            content={"code": exc.code, "message": exc.message, "requestId": deps.api.correlation_id},
        )
