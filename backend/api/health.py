"""GET /health: liveness for Posit and the ops check. No authentication.

Reports the data source, whether the warehouse answers a SELECT 1, and the n8n
state (ok / disabled / error). Never includes hosts, tokens or error text.
"""
from fastapi import APIRouter

from core.config import APP_VERSION, get_settings
from database.warehouse import get_warehouse
from helpers import n8n_client
from schema.response_schema import ok

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    s = get_settings()
    try:
        wh = "ok" if get_warehouse().ping() else "error"
    except Exception:  # noqa: BLE001
        wh = "error"
    n8n = n8n_client.ping()
    status = "ok" if wh == "ok" and n8n != "error" else "degraded"
    return ok({"status": status, "data_source": s.data_source, "warehouse": wh, "n8n": n8n,
               "version": APP_VERSION})
