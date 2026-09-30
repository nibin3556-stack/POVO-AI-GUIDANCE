"""Per-request UUID v4 request IDs.

The frontend sends X-Request-ID; the middleware validates it and regenerates it
server-side when it is missing or not a UUID v4 (never trust the client),
echoes it on the response, and exposes it on request.state and in a context
variable, so audit rows, n8n bodies and log lines all carry the same id.
"""
import uuid
from contextvars import ContextVar
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"

#: Read by the log filter (core/logging.py) and by code with no Request handy.
current_request_id: ContextVar[Optional[str]] = ContextVar("current_request_id", default=None)


def is_valid_uuid4(value: Optional[str]) -> bool:
    try:
        return uuid.UUID(str(value)).version == 4
    except (ValueError, TypeError):
        return False


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming = request.headers.get(REQUEST_ID_HEADER)
        request_id = incoming if is_valid_uuid4(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        token = current_request_id.set(request_id)
        try:
            response = await call_next(request)
        finally:
            current_request_id.reset(token)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


def get_request_id(request: Request) -> str:
    rid = getattr(request.state, "request_id", None)
    return rid or str(uuid.uuid4())
