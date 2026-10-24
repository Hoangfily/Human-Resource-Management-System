from fastapi import FastAPI

from .api.router import router
from .deps import llm_client
from .llm import UnavailableLLM

app = FastAPI(title="HR Agent AI", version="0.1.0")
app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    """`degraded` means the LLM could not be built: every request would be escalated.
    The cause is in the service log, not here: this route is not authenticated."""
    llm = llm_client()
    if isinstance(llm, UnavailableLLM):
        return {"status": "degraded", "service": "ai", "llm": "unavailable"}
    return {"status": "ok", "service": "ai", "llm": llm.model}
