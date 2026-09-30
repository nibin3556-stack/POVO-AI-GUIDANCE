"""Global exception handlers: every error leaves as the standard envelope.

Stack traces are logged server-side only; clients get a readable message and
the request id (X-Request-ID header) to quote. Unlike Mosaic's temporary debug
branch, the 500 handler never echoes exception text: it can carry SQL or data.

`ApiError` lets a handler return a non-2xx envelope WITH data. The next-call
409 needs that: the frontend reads `data.flags` to point the rep at the notes
that still need attention.
"""
import logging
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from schema.response_schema import ResponseSchema

logger = logging.getLogger("povo")


class ApiError(Exception):
    """An expected failure with a status, a message and optional envelope data."""

    def __init__(self, status: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.data = data


def _envelope(status_code: int, message: str, data: Any = None,
              headers: Optional[dict] = None) -> JSONResponse:
    content = ResponseSchema(data=data, status=status_code, message=message).model_dump(mode="json")
    return JSONResponse(status_code=status_code, content=content, headers=headers)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
        return _envelope(exc.status, exc.message, exc.data)

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        # Keep the exception's own headers (WWW-Authenticate, Retry-After).
        return _envelope(exc.status_code, message, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {}
        location = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
        detail = first.get("msg", "Invalid request")
        message = f"Validation error on '{location}': {detail}" if location else detail
        return _envelope(422, message)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s (request_id=%s)", request.method,
                         request.url.path, getattr(request.state, "request_id", None))
        return _envelope(500, "An unexpected error occurred. Please try again.")
