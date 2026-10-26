"""HTTP client for apps/api: auth, correlation id, retries and stable errors."""

import asyncio
import time
import uuid
from typing import Any

import httpx

RETRYABLE_STATUS = {502, 503, 504}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str = "") -> None:
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code
        self.message = message


class ApiClient:
    """One instance per evaluation, so every call shares one correlation id.

    Every call is recorded in `calls` (method, path, status, ms) for the agent trace.
    """

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout_s: float = 10,
        max_retries: int = 3,
        backoff_s: float = 0.2,
        correlation_id: str | None = None,
    ) -> None:
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.max_retries = max_retries
        self.backoff_s = backoff_s
        self.calls: list[dict[str, Any]] = []
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/api/v1",
            transport=transport,
            timeout=timeout_s,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Correlation-Id": self.correlation_id,
            },
        )

    async def __aenter__(self) -> "ApiClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, json: dict[str, Any]) -> Any:
        return await self._request("POST", path, json=json)

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if "params" in kwargs and kwargs["params"]:
            kwargs["params"] = {k: v for k, v in kwargs["params"].items() if v is not None}
        attempt = 0
        while True:
            started = time.perf_counter()
            try:
                response = await self._http.request(method, path, **kwargs)
            except httpx.TransportError as exc:  # Includes timeouts
                self._record(method, path, None, started)
                # A write that may have reached the API (read timeout, dropped connection) is not
                # replayed: the API may already have applied it. Only "never sent" errors are retried.
                never_sent = isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout))
                if method != "GET" and not never_sent:
                    raise ApiError(0, "WRITE_OUTCOME_UNKNOWN", str(exc)) from exc
                if attempt < self.max_retries:
                    attempt += 1
                    await asyncio.sleep(self.backoff_s * 2 ** (attempt - 1))
                    continue
                raise ApiError(0, "API_UNREACHABLE", str(exc)) from exc

            self._record(method, path, response.status_code, started)
            # A proxy can answer 502/503/504 after the API applied a write: writes are never replayed
            # (the supervisor reads the request back and reports what it shows).
            retryable = RETRYABLE_STATUS if method == "GET" else set()
            if response.status_code in retryable and attempt < self.max_retries:
                attempt += 1
                await asyncio.sleep(self.backoff_s * 2 ** (attempt - 1))
                continue
            if response.is_error:
                raise _to_api_error(response)
            return response.json() if response.content else None

    def _record(self, method: str, path: str, status: int | None, started: float) -> None:
        self.calls.append(
            {
                "method": method,
                "path": path,
                "status": status,
                "ms": round((time.perf_counter() - started) * 1000),
            }
        )


def _to_api_error(response: httpx.Response) -> ApiError:
    try:
        body = response.json()
    except ValueError:
        body = {}
    return ApiError(
        response.status_code,
        body.get("code", f"HTTP_{response.status_code}"),
        body.get("message", response.text[:200]),
    )
