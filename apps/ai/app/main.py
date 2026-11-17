from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.router import router
from .config import get_settings, is_production, production_secret_problems
from .deps import llm_client
from .llm import UnavailableLLM


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """APP_ENV=production: refuse to start with missing, example or weak service tokens."""
    if is_production():
        problems = production_secret_problems(get_settings())
        if problems:
            raise RuntimeError("Refusing to start in production: " + "; ".join(problems))
    yield


app = FastAPI(title="HR Agent AI", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    """`degraded` means the LLM could not be built: every request would be escalated.
    The cause is in the service log, not here: this route is not authenticated."""
    llm = llm_client()
    if isinstance(llm, UnavailableLLM):
        return {"status": "degraded", "service": "ai", "llm": "unavailable"}
    return {"status": "ok", "service": "ai", "llm": llm.model}
