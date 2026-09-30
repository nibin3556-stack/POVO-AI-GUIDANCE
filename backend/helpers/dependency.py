"""Request context: the real user, the effective user, permissions, territory.

Every data endpoint depends on `require_permission(...)`, which resolves:

  * real       - the employee the Posit identity header names (USERNAME, then
                 EMAIL). Unknown or inactive -> 403 "Your account is not set up".
  * effective  - the employee in X-Impersonate-Employee-Id, honoured ONLY when
                 the real user holds user.impersonate (else 403); otherwise
                 the real user.
  * territory  - ALWAYS the effective employee's HOME_TERRITORY_ID. No endpoint
                 takes a territory from the request.

Permissions are the REAL user's: a manager impersonating a rep keeps the
right to exit impersonation and still sees exactly the rep's data.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request

from core.identity import resolve_upstream_identity
from core.request_id import get_request_id
from helpers.territory_data import get_refs
from registry.permissions_seed import USER_IMPERSONATE, permissions_for

IMPERSONATE_HEADER = "X-Impersonate-Employee-Id"
NOT_SET_UP = "Your account is not set up for POVO AI Guidance"


@dataclass
class RequestContext:
    real: dict
    effective: dict
    permissions: list[str]
    request_id: str

    @property
    def is_impersonating(self) -> bool:
        return self.real["EMPLOYEE_ID"] != self.effective["EMPLOYEE_ID"]

    @property
    def territory_id(self) -> str:
        return self.effective.get("HOME_TERRITORY_ID") or ""


def _active(e: dict) -> bool:
    v = e.get("IS_ACTIVE")
    return v is None or v is True or str(v).lower() in ("true", "1", "t")


def find_employee(value: str) -> Optional[dict]:
    v = value.strip().lower()
    emps = get_refs().employees
    for key in ("USERNAME", "EMAIL"):
        for e in emps:
            if (e.get(key) or "").strip().lower() == v:
                return e
    if "@" in v:  # an email whose local part is the username
        local = v.split("@", 1)[0]
        for e in emps:
            if (e.get("USERNAME") or "").strip().lower() == local:
                return e
    return None


def employee_by_id(employee_id: str) -> Optional[dict]:
    eid = (employee_id or "").strip().lower()
    return next((e for e in get_refs().employees if (e.get("EMPLOYEE_ID") or "").lower() == eid), None)


def get_request_context(request: Request) -> RequestContext:
    ident = resolve_upstream_identity(request)
    real = find_employee(ident) if ident else None
    if real is None or not _active(real):
        raise HTTPException(status_code=403, detail=NOT_SET_UP)
    perms = permissions_for(real.get("ROLE_CODE"))
    effective = real
    imp = (request.headers.get(IMPERSONATE_HEADER) or "").strip()
    if imp and imp.lower() != real["EMPLOYEE_ID"].lower():
        if USER_IMPERSONATE not in perms:
            raise HTTPException(status_code=403, detail="You do not have permission to impersonate other users")
        target = employee_by_id(imp)
        if target is None or not _active(target):
            raise HTTPException(status_code=403, detail="The employee you are viewing as is not available")
        effective = target
    return RequestContext(real, effective, perms, get_request_id(request))


def require_permission(permission: Optional[str] = None) -> Callable[..., RequestContext]:
    def dep(ctx: RequestContext = Depends(get_request_context)) -> RequestContext:
        if permission and permission not in ctx.permissions:
            raise HTTPException(status_code=403, detail="You do not have access to this feature")
        return ctx
    return dep


def employee_out(e: dict) -> dict:
    """The contract `Employee` shape."""
    t = get_refs().territories.get(e.get("HOME_TERRITORY_ID") or "", {})
    return {"employee_id": e["EMPLOYEE_ID"], "network_id": e.get("NETWORK_ID"), "username": e.get("USERNAME"),
            "full_name": e.get("FULL_NAME"), "initials": e.get("INITIALS"),
            "business_unit": e.get("BUSINESS_UNIT"), "role_code": e.get("ROLE_CODE"),
            "role_title": e.get("ROLE_TITLE"), "access_level": e.get("ACCESS_LEVEL"),
            "access_regions": e.get("ACCESS_REGIONS"), "home_territory_id": e.get("HOME_TERRITORY_ID"),
            "territory_name": t.get("TERRITORY_NAME"), "region": t.get("REGION")}


def territory_out(tid: str) -> dict:
    t = get_refs().territories.get(tid, {})
    return {"territory_id": tid, "territory_name": t.get("TERRITORY_NAME"), "city": t.get("CITY"),
            "state": t.get("STATE"), "region": t.get("REGION")}
