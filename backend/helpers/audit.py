"""Audit rows in APP_AUDIT_LOG.

One row per business action (impersonation start/end, call create, assessment
save, compliance check, suggestion accept, next-call generate, job run), with
the acting (real) and effective employee, so an impersonated action is always
attributable to the manager who took it.

DETAIL_JSON carries ids and counts only: NEVER note text (it can hold PHI or an
adverse event before review), never tokens or header values.

An audit write failure is logged and swallowed: losing a trail row must not
fail the rep's save, and the application log still has the line.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Optional

from core.config import get_settings
from core.request_id import current_request_id
from database.warehouse import get_warehouse
from helpers.dates import now_utc

logger = logging.getLogger("povo.audit")
#: brand_code for an entry that spans every brand (a job run): stored as NULL.
ALL_BRANDS = ""


def audit(action: str, module: str, record_id: Optional[str], acted_by: Optional[str],
          effective: Optional[str], detail: Optional[dict[str, Any]] = None,
          request_id: Optional[str] = None, brand_code: Optional[str] = None) -> None:
    try:
        get_warehouse().insert("APP_AUDIT_LOG", [{
            "AUDIT_ID": str(uuid.uuid4()),
            "BRAND_CODE": get_settings().default_brand_code if brand_code is None else (brand_code or None),
            "REQUEST_ID": request_id or current_request_id.get() or str(uuid.uuid4()),
            "ACTED_BY_EMPLOYEE_ID": acted_by, "EFFECTIVE_EMPLOYEE_ID": effective,
            "ACTION": action, "MODULE": module, "RECORD_ID": record_id,
            "DETAIL_JSON": json.dumps(detail or {}, default=str), "CREATED_AT": now_utc(),
        }])
    except Exception:  # noqa: BLE001
        logger.exception("Audit write failed for %s %s", action, record_id)


def audit_ctx(ctx, action: str, module: str, record_id: Optional[str], detail: Optional[dict] = None) -> None:
    audit(action, module, record_id, ctx.real["EMPLOYEE_ID"], ctx.effective["EMPLOYEE_ID"], detail,
          ctx.request_id, ctx.brand_code)
