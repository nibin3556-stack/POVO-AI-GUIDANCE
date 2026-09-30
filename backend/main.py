"""App factory: middleware, routers and lifespan.

Posit Connect entrypoint: `main:app` (rsconnect deploy fastapi ... --entrypoint main:app).

Startup opens the warehouse once (in local mode that loads the bronze CSVs
into DuckDB and creates the app tables), so the first request is not the one
that pays for it. Shutdown closes the warehouse pool and the n8n client.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from api import accounts, call_prep, calls, compliance, health, impersonation, jobs, me, performance, reference, targets
from core.config import get_settings
from core.exception_handler import register_exception_handlers
from core.logging import configure_logging
from core.request_id import REQUEST_ID_HEADER, RequestIdMiddleware
from core.security_headers import SecurityHeadersMiddleware
from database.warehouse import get_warehouse, reset_warehouse
from helpers import n8n_client
from helpers.dependency import IMPERSONATE_HEADER

logger = logging.getLogger("povo")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting %s (%s, data source %s, AI %s)", settings.app_name, settings.environment,
                    settings.data_source, "on" if settings.ai_active else "off")
        if settings.environment != "production":
            logger.info("Dev identity fallback active -> %s", settings.dev_fallback_username)
        try:
            get_warehouse()
        except Exception:  # noqa: BLE001 - /health reports it; requests retry the connection
            logger.exception("Warehouse could not be opened at startup")
        yield
        n8n_client.close_client()
        reset_warehouse()

    app = FastAPI(title=settings.app_name, lifespan=lifespan,
                  docs_url="/docs" if settings.environment != "production" else None, redoc_url=None)

    # Added innermost-first: the request id is assigned before anything else runs.
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.environment == "production")
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    if settings.cors_origins:
        # Explicit allowlist only (dev: the Vite server). In production both
        # Posit content items share an origin and no CORS is needed.
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                           allow_methods=["GET", "POST", "PUT", "DELETE"],
                           allow_headers=["Content-Type", REQUEST_ID_HEADER, IMPERSONATE_HEADER,
                                          settings.posit_identity_header],
                           expose_headers=[REQUEST_ID_HEADER])
    app.add_middleware(RequestIdMiddleware)

    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(reference.router)
    app.include_router(impersonation.employees_router)
    app.include_router(impersonation.router)
    app.include_router(performance.router)
    app.include_router(targets.router)
    app.include_router(call_prep.profile_router)
    app.include_router(accounts.router)
    app.include_router(call_prep.router)
    app.include_router(calls.router)
    app.include_router(compliance.router)
    app.include_router(jobs.router)
    return app


app = create_app()
