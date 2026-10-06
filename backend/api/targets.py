"""Pre-Call Planning: Must-Wins, the Full Call Plan table and its facets.

  * Must-Wins: the top 5 by HS volume with no JAK use, and the top 5 JAK users.
  * Full Call Plan: in-plan targets (D10-D2) that are not Must-Wins, filtered
    by comma-separated lists and sorted from a whitelist. Ties always fall
    back to HS volume (desc), then HCP id, as in the POC.
  * Facets: counts over the Full Call Plan universe (unfiltered).
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query

from helpers.dependency import RequestContext, require_permission
from helpers.listing import MAX_LIMIT, csv_set, page_slice, parse_sort, sort_rows
from helpers.targets import public, universe
from registry.features import MUST_WINS, PRE_CALL_TAB
from registry.permissions_seed import GUIDANCE_VIEW
from schema.response_schema import ok, paged

router = APIRouter(prefix="/api/v1/targets", tags=["targets"])
Guard = Depends(require_permission(GUIDANCE_VIEW, PRE_CALL_TAB))
SORTS = ("name", "decile", "hs_patients", "pef", "last_call_date")
SORT_KEYS = {"name": lambda t: t["name"].lower(), "decile": lambda t: t["decile"],
             "hs_patients": lambda t: t["hs_patients"], "pef": lambda t: t["pef"],
             "last_call_date": lambda t: t["last_call_date"] or date.min}


@router.get("/must-wins")
def must_wins(ctx: RequestContext = Depends(require_permission(GUIDANCE_VIEW, MUST_WINS))) -> dict:
    u = universe(ctx.brand_code, ctx.territory_id)
    return ok({"territory_name": u.td.territory.get("TERRITORY_NAME"),
               "hs_volume": [public(t) for t in u.must_hs], "hs_jak": [public(t) for t in u.must_jak]})


@router.get("/facets")
def facets(ctx: RequestContext = Guard) -> dict:
    u = universe(ctx.brand_code, ctx.territory_id)
    plan = u.plan_targets()

    def count(key, code):
        return sum(1 for t in plan if t[key] == code)

    return ok({
        "focus": [{"code": f["FOCUS_CODE"], "label": f["LABEL"], "color_hex": f["COLOR_HEX"],
                   "count": count("competitive_focus", f["FOCUS_CODE"])} for f in u.refs.focus],
        "segment": [{"code": s["SEGMENT_CODE"], "label": s["SHORT_NAME"],
                     "count": count("segment_code", s["SEGMENT_CODE"])} for s in u.refs.segments],
        "tier": [{"code": t["TIER_CODE"], "label": t["TIER_NAME"], "count": count("tier_code", t["TIER_CODE"])}
                 for t in u.refs.tiers],
        "account": [{"code": a["ACCOUNT_ID"], "label": a["ACCOUNT_NAME"], "count": count("account_id", a["ACCOUNT_ID"])}
                    for a in sorted(u.td.accounts.values(), key=lambda a: (a.get("ACCOUNT_NAME") or ""))],
        "role": [{"code": r, "label": r, "count": count("role_type", r)} for r in ("HCP", "NP", "PA")],
    })


@router.get("")
def list_targets(page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=MAX_LIMIT),
                 sort: Optional[str] = None, focus: Optional[str] = None, segment: Optional[str] = None,
                 tier: Optional[str] = None, account_id: Optional[str] = None, role: Optional[str] = None,
                 ctx: RequestContext = Guard) -> dict:
    field, desc = parse_sort(sort, SORTS, "hs_patients:desc")
    u = universe(ctx.brand_code, ctx.territory_id)
    rows = u.plan_targets()
    for key, value in (("competitive_focus", focus), ("segment_code", segment), ("tier_code", tier),
                       ("account_id", account_id), ("role_type", role)):
        wanted = csv_set(value)
        if wanted:
            rows = [t for t in rows if t[key] in wanted]
    rows = sort_rows(rows, SORT_KEYS[field], desc, lambda t: (-t["hs_patients"], t["hcp_id"]))
    return paged([public(t) for t in page_slice(rows, page, limit)], page, limit, len(rows))
