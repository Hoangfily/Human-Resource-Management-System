from fastapi import FastAPI

from .api.router import router

app = FastAPI(title="HR Agent AI", version="0.1.0")
app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai"}
