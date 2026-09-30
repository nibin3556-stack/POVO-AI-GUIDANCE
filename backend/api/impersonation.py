"""Impersonation: employee search, start and exit (managers only).

Impersonation itself is stateless on the server: the frontend sends
X-Impersonate-Employee-Id on every request and helpers/dependency.py honours
it only for holders of user.impersonate. These endpoints exist to validate the
choice up front and to put the start and the exit on the audit trail.
"""
from fastapi import APIRouter, Depends, HTTPException, Query

from helpers.audit import audit_ctx
from helpers.dependency import RequestContext, employee_by_id, employee_out, require_permission
from helpers.territory_data import get_refs
from registry.permissions_seed import USER_IMPERSONATE
from schema.impersonation import ImpersonationStart
from schema.response_schema import ok

employees_router = APIRouter(prefix="/api/v1/employees", tags=["impersonation"])
router = APIRouter(prefix="/api/v1/impersonation", tags=["impersonation"])


def _active(e: dict) -> bool:
    v = e.get("IS_ACTIVE")
    return v is None or v is True or str(v).lower() in ("true", "1", "t")


@employees_router.get("/search")
def search(q: str = Query(min_length=2, max_length=80), limit: int = Query(8, ge=1, le=50),
           ctx: RequestContext = Depends(require_permission(USER_IMPERSONATE))) -> dict:
    """Matches employee ID, network ID, username exactly; name or territory by substring."""
    v = q.strip().lower()
    refs = get_refs()
    hits = []
    for e in refs.employees:
        if not _active(e):
            continue
        terr = (refs.territories.get(e.get("HOME_TERRITORY_ID") or "", {}).get("TERRITORY_NAME") or "").lower()
        exact = v in ((e.get("EMPLOYEE_ID") or "").lower(), str(e.get("NETWORK_ID") or "").lower(),
                      (e.get("USERNAME") or "").lower())
        if exact or v in (e.get("FULL_NAME") or "").lower() or v in terr:
            hits.append((0 if exact else 1, e.get("FULL_NAME") or "", e))
    hits.sort(key=lambda h: (h[0], h[1]))
    return ok([employee_out(e) for _, _, e in hits[:limit]])


@router.post("")
def start(body: ImpersonationStart, ctx: RequestContext = Depends(require_permission(USER_IMPERSONATE))) -> dict:
    target = employee_by_id(body.employee_id)
    if target is None or not _active(target):
        raise HTTPException(status_code=404,
                            detail=f'No employee found for "{body.employee_id}". Check the name, Employee ID or '
                                   f"Network ID and try again")
    audit_ctx(ctx, "IMPERSONATE_START", "impersonation", target["EMPLOYEE_ID"],
              {"target_employee_id": target["EMPLOYEE_ID"], "target_territory_id": target.get("HOME_TERRITORY_ID")})
    return ok(employee_out(target))


@router.delete("")
def stop(ctx: RequestContext = Depends(require_permission(USER_IMPERSONATE))) -> dict:
    audit_ctx(ctx, "IMPERSONATE_END", "impersonation", ctx.effective["EMPLOYEE_ID"],
              {"was_impersonating": ctx.is_impersonating})
    return ok(employee_out(ctx.real))
