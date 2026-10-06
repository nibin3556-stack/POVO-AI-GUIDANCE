"""Scheduled jobs, called by the n8n nightly workflow with a service token.

Auth is the shared POVO_SERVICE_TOKEN in `X-POVO-Service-Token`, compared in
constant time (hmac.compare_digest) so the comparison leaks nothing about the
token. No token configured means the endpoints refuse to run (503), never that
they run open. Both endpoints take NO request body (n8n posts an empty one).
"""
import hmac
import json
import logging
import uuid

from fastapi import APIRouter, Header, HTTPException

from core.config import get_settings
from database.tables import app, key_id
from database.warehouse import get_warehouse
from helpers.audit import ALL_BRANDS, audit
from helpers.dates import now_utc, today
from helpers.brands import brands, has_feature
from helpers.territory_data import get_refs
from registry.features import AI_GUIDANCE
from schema.response_schema import ok

logger = logging.getLogger("povo.jobs")
router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


def _authorize(token: str | None) -> None:
    expected = get_settings().povo_service_token
    if not expected:
        raise HTTPException(status_code=503, detail="Service token is not configured")
    if not token or not hmac.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid service token")


@router.post("/refresh-guidance")
def refresh_guidance(x_povo_service_token: str | None = Header(default=None)) -> dict:
    _authorize(x_povo_service_token)
    from api.performance import compute_guidance  # the same computation the page shows

    wh = get_warehouse()
    run_id, started = str(uuid.uuid4()), now_utc()
    wh.insert("APP_JOB_RUN", [{"BRAND_CODE": None, "RUN_ID": run_id, "JOB_NAME": "refresh-guidance", "STARTED_AT": started,
                               "FINISHED_AT": None, "STATUS": "running", "DETAIL": None}])
    snap_date, done, failed = today(), 0, []
    try:
        # Every active brand with AI guidance on, every territory of that brand.
        work = [(b["BRAND_CODE"], tid) for b in brands() if has_feature(b["BRAND_CODE"], AI_GUIDANCE)
                for tid in sorted(get_refs(b["BRAND_CODE"]).territories)]
        for brand, tid in work:
            try:
                payload = compute_guidance(brand, tid)
                wh.merge("APP_TERRITORY_GUIDANCE_SNAPSHOT", ["SNAPSHOT_ID"], [{
                    "SNAPSHOT_ID": key_id(brand, tid, snap_date), "BRAND_CODE": brand, "TERRITORY_ID": tid, "SNAPSHOT_DATE": snap_date,
                    "PAYLOAD_JSON": json.dumps(payload, default=str), "CREATED_AT": now_utc()}])
                done += 1
            except Exception:  # noqa: BLE001 - one territory must not stop the rest
                logger.exception("Guidance refresh failed for %s/%s", brand, tid)
                failed.append(f"{brand}/{tid}")
        status = "success" if not failed else "failed"
        detail = f"{done} territories refreshed" + (f"; failed: {', '.join(failed)}" if failed else "")
    except Exception as exc:  # noqa: BLE001
        status, detail = "failed", type(exc).__name__
    wh.merge("APP_JOB_RUN", ["RUN_ID"], [{"BRAND_CODE": None, "RUN_ID": run_id, "JOB_NAME": "refresh-guidance", "STARTED_AT": started,
                                          "FINISHED_AT": now_utc(), "STATUS": status, "DETAIL": detail}])
    audit("JOB_RUN", "jobs", run_id, "service", "service", {"job": "refresh-guidance", "territories": done,
                                                            "status": status}, brand_code=ALL_BRANDS)
    return ok({"run_id": run_id, "territories": done, "snapshot_date": snap_date})


@router.post("/purge-ai-cache")
def purge_ai_cache(x_povo_service_token: str | None = Header(default=None)) -> dict:
    _authorize(x_povo_service_token)
    wh = get_warehouse()
    now = now_utc()
    n = wh.query(f"SELECT COUNT(*) AS N FROM {app('APP_AI_CACHE')} WHERE EXPIRES_AT < :now", {"now": now})
    wh.execute(f"DELETE FROM {app('APP_AI_CACHE')} WHERE EXPIRES_AT < :now", {"now": now})
    deleted = int(n[0]["N"]) if n else 0
    audit("JOB_RUN", "jobs", None, "service", "service", {"job": "purge-ai-cache", "deleted": deleted},
          brand_code=ALL_BRANDS)
    return ok({"deleted": deleted})
