"""Accounts table and each account's call-plan targets (POC accounts()/accList()).

  * hs_patients   = HS patients of the account's PHYSICIANS (NP/PA see the same
                    patients, so adding them would double count)
  * povo_patients = POVO patients of every target at the account
  * main_focus    = the competitive focus with the highest HS sum
  * claims-only accounts (no affiliated HCP) show their account-level claims
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from helpers.dependency import RequestContext, require_permission
from helpers.listing import MAX_LIMIT, page_slice, parse_sort, sort_rows
from helpers.targets import public, universe
from registry.features import PRE_CALL_TAB
from registry.permissions_seed import GUIDANCE_VIEW
from schema.response_schema import ok, paged

router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])
Guard = Depends(require_permission(GUIDANCE_VIEW, PRE_CALL_TAB))
SORTS = ("account_name", "hs_patients", "povo_patients", "target_count", "in_plan_count")


def _truthy(v) -> bool:
    return v is True or str(v).lower() in ("true", "1", "t")


def account_rows(u) -> list[dict]:
    out = []
    for a in u.td.accounts.values():
        ts = [t for t in u.list if t["account_id"] == a["ACCOUNT_ID"]]
        claims = _truthy(a.get("IS_CLAIMS_ONLY")) or not ts
        if claims:
            hs, povo, focus = int(a.get("CLAIMS_INDICATION_PATIENTS") or 0), int(a.get("CLAIMS_BRAND_PATIENTS") or 0), \
                a.get("CLAIMS_MAIN_FOCUS")
        else:
            hs = sum(t["hs_patients"] for t in ts if t["role_type"] == "HCP")
            povo = sum(t["povo_patients"] for t in ts)
            sums: dict[str, int] = {}
            for t in ts:
                sums[t["competitive_focus"]] = sums.get(t["competitive_focus"], 0) + t["hs_patients"]
            focus = max(sums, key=lambda k: sums[k]) if sums else "conventional"
        out.append({"account_id": a["ACCOUNT_ID"], "account_name": a.get("ACCOUNT_NAME"), "city": a.get("CITY"),
                    "state": a.get("STATE"), "zip": a.get("ZIP"), "hs_patients": hs, "povo_patients": povo,
                    "target_count": len(ts), "in_plan_count": sum(1 for t in ts if t["is_in_call_plan"]),
                    "main_focus": focus, "is_claims_only": claims})
    return out


@router.get("")
def list_accounts(page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=MAX_LIMIT),
                  sort: Optional[str] = None, ctx: RequestContext = Guard) -> dict:
    field, desc = parse_sort(sort, SORTS, "hs_patients:desc")
    rows = account_rows(universe(ctx.brand_code, ctx.territory_id))
    key = (lambda r: (r["account_name"] or "").lower()) if field == "account_name" else (lambda r: r[field])
    rows = sort_rows(rows, key, desc, lambda r: (r["account_name"] or ""))
    return paged(page_slice(rows, page, limit), page, limit, len(rows))


@router.get("/{account_id}/targets")
def account_targets(account_id: str, ctx: RequestContext = Guard) -> dict:
    u = universe(ctx.brand_code, ctx.territory_id)
    if account_id not in u.td.accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    rows = [t for t in u.list if t["account_id"] == account_id and t["is_in_call_plan"]]
    return ok([public(t) for t in rows])
