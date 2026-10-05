"""Territory Performance: KPI cards, AI guidance, and the three charts.

All figures are for the EFFECTIVE employee's territory, computed in Python
from the cached bronze data plus the assessed-call overlay (helpers/targets).
"""
import json
import logging
from typing import Literal

from fastapi import APIRouter, Depends, Query

from database.tables import app
from database.warehouse import get_warehouse
from helpers.dates import now_utc, today
from helpers.dependency import RequestContext, require_permission
from helpers.metrics import deciles, guidance, kpis, segmentation, writers
from helpers.targets import universe
from helpers.territory_data import get_refs, get_territory
from registry.permissions_seed import GUIDANCE_VIEW
from schema.response_schema import ok

logger = logging.getLogger("povo.performance")
router = APIRouter(prefix="/api/v1/performance", tags=["performance"])
Guard = Depends(require_permission(GUIDANCE_VIEW))


def _calendar():
    t = today()
    return get_refs().calendar(t.year, t.year + 1)


@router.get("/kpis")
def get_kpis(period: Literal["month", "quarter", "ytd"] = "month", ctx: RequestContext = Guard) -> dict:
    return ok(kpis.kpis(get_territory(ctx.territory_id), period, today(), _calendar(), get_refs().kpi_metrics,
                       get_refs().kpi_parameters))


def compute_guidance(territory_id: str) -> dict:
    return guidance.guidance(universe(territory_id), today())


@router.get("/guidance")
def get_guidance(ctx: RequestContext = Guard) -> dict:
    """Live by default. If the live computation fails, the nightly snapshot
    (APP_TERRITORY_GUIDANCE_SNAPSHOT) is served instead, marked `snapshot`."""
    try:
        return ok({**compute_guidance(ctx.territory_id), "source": "live", "generated_at": now_utc()})
    except Exception:  # noqa: BLE001
        logger.exception("Live guidance failed; trying the snapshot")
        rows = get_warehouse().query(
            f"SELECT PAYLOAD_JSON, CREATED_AT FROM {app('APP_TERRITORY_GUIDANCE_SNAPSHOT')} "
            f"WHERE TERRITORY_ID = :tid ORDER BY SNAPSHOT_DATE DESC LIMIT 1", {"tid": ctx.territory_id})
        if not rows:
            raise
        return ok({**json.loads(rows[0]["PAYLOAD_JSON"]), "source": "snapshot",
                   "generated_at": rows[0]["CREATED_AT"]})


@router.get("/segmentation")
def get_segmentation(ctx: RequestContext = Guard) -> dict:
    return ok(segmentation.public(segmentation.segment_stats(universe(ctx.territory_id), today())))


@router.get("/deciles")
def get_deciles(ctx: RequestContext = Guard) -> dict:
    return ok(deciles.decile_stats(universe(ctx.territory_id), today(), _calendar()))


@router.get("/new-writers")
def get_new_writers(grain: Literal["month", "week"] = Query("month"), ctx: RequestContext = Guard) -> dict:
    return ok(writers.new_writers(universe(ctx.territory_id), grain, today()))
