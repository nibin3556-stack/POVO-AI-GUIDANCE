"""The backend's only outbound AI call: POST a JSON body to an n8n webhook.

Contract (ARCHITECTURE §6): every workflow ends in a Guard node that answers
`{"ok": true, ...payload}` or `{"ok": false, "reason": "..."}`.

`post()` returns the payload dict on `ok: true` and **None on anything else**:
AI disabled, no N8N_BASE_URL, connection refused, timeout, non-2xx, non-JSON,
`ok: false`. Callers treat None as "use the deterministic POC rules", so the
app always works without n8n, and no AI failure ever reaches the rep as an
error.

One pooled httpx client per process (connection reuse across requests). The
connect timeout is short: a host that is down is known in seconds, while the
read timeout (N8N_TIMEOUT_SECONDS) allows for the LLM. No retries: these calls
are not idempotent and a retry doubles the wait for a request that is usually
failing for a reason a second attempt will not fix.

Logs carry the path, status and timing only; never the body (it can hold note
text) and never the webhook URL's host credentials.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import httpx

from core.config import get_settings

logger = logging.getLogger("povo.n8n")
CONNECT_TIMEOUT_SECONDS = 5.0

_client: Optional[httpx.Client] = None
_lock = threading.Lock()


def get_client() -> httpx.Client:
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                s = get_settings()
                _client = httpx.Client(
                    base_url=(s.n8n_base_url or "").rstrip("/"),
                    timeout=httpx.Timeout(s.n8n_timeout_seconds, connect=CONNECT_TIMEOUT_SECONDS),
                    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                )
    return _client


def set_client(client: Optional[httpx.Client]) -> None:
    """Replace the pooled client (tests inject an httpx.MockTransport)."""
    global _client
    with _lock:
        old, _client = _client, client
    if old is not None and old is not client:
        old.close()


def close_client() -> None:
    set_client(None)


def post(path: str, body: dict) -> Optional[dict]:
    s = get_settings()
    if not s.ai_active:
        return None
    started = time.perf_counter()
    try:
        resp = get_client().post(path, json=body)
    except httpx.HTTPError as exc:
        logger.warning("n8n %s unreachable (%s); using rules", path, type(exc).__name__)
        return None
    ms = int((time.perf_counter() - started) * 1000)
    if resp.status_code >= 300:
        logger.warning("n8n %s answered %s in %d ms; using rules", path, resp.status_code, ms)
        return None
    try:
        data = resp.json()
    except ValueError:
        logger.warning("n8n %s returned non-JSON in %d ms; using rules", path, ms)
        return None
    if isinstance(data, list) and len(data) == 1:  # Respond-to-Webhook can wrap the item
        data = data[0]
    if not isinstance(data, dict) or data.get("ok") is not True:
        reason = data.get("reason") if isinstance(data, dict) else None
        logger.info("n8n %s guard rejected the output (%s) in %d ms; using rules", path,
                    str(reason)[:120] if reason else "no ok flag", ms)
        return None
    logger.info("n8n %s ok in %d ms", path, ms)
    return data


def ping() -> str:
    """'ok' | 'disabled' | 'error' for /health."""
    s = get_settings()
    if not s.ai_active:
        return "disabled"
    try:
        resp = get_client().get("/healthz", timeout=3.0)
        return "ok" if resp.status_code < 500 else "error"
    except httpx.HTTPError:
        return "error"
