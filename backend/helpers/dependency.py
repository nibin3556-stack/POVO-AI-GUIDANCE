"""Request context: the brand, the real user, the effective user, permissions, territory.

Every data endpoint depends on `require_permission(...)`, which resolves:

  * brand      - X-Brand-Code when sent, else DEFAULT_BRAND_CODE, else the
                 user's first brand. Only an ACTIVE brand (CFG_BRAND) the
                 user has an active DIM_SALES_ASSIGNMENT row in can be used
                 (else 403).
  * real       - the employee the Posit identity header names (USERNAME, then
                 EMAIL), in that brand. Unknown or inactive -> 403 "Your
                 account is not set up".
  * effective  - the employee in X-Impersonate-Employee-Id (same brand),
                 honoured ONLY when the real user holds user.impersonate (an
                 admin user, ADMIN_USERS_FILE; else 403); otherwise the real user.
  * territory  - ALWAYS the effective employee's sales-assignment territory in the
                 brand. No endpoint takes a territory from the request.
  * features   - the brand's enabled features (CFG_BRAND_FEATURE). A guarded
                 endpoint whose feature is off answers 403.

Permissions are the REAL user's: a manager impersonating a rep keeps the
right to exit impersonation and still sees exactly the rep's data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Request

from core.config import get_settings
from core.identity import resolve_upstream_identity
from core.request_id import get_request_id
from helpers import brands
from helpers.territory_data import all_assignments, all_employees, get_refs, in_brand
from registry.permissions_seed import USER_IMPERSONATE, permissions_for

IMPERSONATE_HEADER = "X-Impersonate-Employee-Id"
BRAND_HEADER = "X-Brand-Code"
NOT_SET_UP = "Your account is not set up for POVO AI Guidance"
FEATURE_OFF = "This feature is not enabled for the selected brand"


@dataclass
class RequestContext:
    real: dict
    effective: dict
    permissions: list[str]
    request_id: str
    brand_code: str = ""
    #: Active brands the signed-in user can switch to (CFG_BRAND rows).
    brands: list[dict] = field(default_factory=list)
    features: set[str] = field(default_factory=set)
    is_admin: bool = False

    @property
    def is_impersonating(self) -> bool:
        return self.real["EMPLOYEE_ID"] != self.effective["EMPLOYEE_ID"]

    @property
    def territory_id(self) -> str:
        return self.effective.get("HOME_TERRITORY_ID") or ""

    def has(self, feature: str) -> bool:
        return feature in self.features


def _active(e: dict) -> bool:
    v = e.get("IS_ACTIVE")
    return v is None or v is True or str(v).lower() in ("true", "1", "t")


def _matches(value: str, rows: list[dict]) -> list[dict]:
    """Rows (any brand) whose USERNAME or EMAIL is the identity."""
    v = value.strip().lower()
    for key in ("USERNAME", "EMAIL"):
        hits = [e for e in rows if (e.get(key) or "").strip().lower() == v]
        if hits:
            return hits
    if "@" in v:  # an email whose local part is the username
        local = v.split("@", 1)[0]
        return [e for e in rows if (e.get("USERNAME") or "").strip().lower() == local]
    return []


def identity_rows(value: str) -> list[dict]:
    """The signed-in person in every brand they have a sales assignment in (employee-in-brand dicts)."""
    people = {p["EMPLOYEE_ID"]: p for p in _matches(value, all_employees())}
    return [in_brand(people[a["EMPLOYEE_ID"]], a) for a in all_assignments() if a.get("EMPLOYEE_ID") in people]


def find_employee(value: str, brand_code: Optional[str] = None) -> Optional[dict]:
    brand_code = brand_code or get_settings().default_brand_code
    return next((e for e in identity_rows(value) if e.get("BRAND_CODE") == brand_code), None)


def employee_by_id(employee_id: str, brand_code: str) -> Optional[dict]:
    eid = (employee_id or "").strip().lower()
    return next((e for e in get_refs(brand_code).employees if (e.get("EMPLOYEE_ID") or "").lower() == eid), None)


def user_brands(rows: list[dict]) -> list[dict]:
    """Active CFG_BRAND rows the user has an active sales assignment in, in brand order."""
    mine = {e.get("BRAND_CODE") for e in rows if _active(e)}
    return [b for b in brands.brands() if b["BRAND_CODE"] in mine]


def _pick_brand(request: Request, available: list[dict]) -> str:
    codes = [b["BRAND_CODE"] for b in available]
    asked = (request.headers.get(BRAND_HEADER) or "").strip().upper()
    if asked:
        if asked not in codes:
            raise HTTPException(status_code=403, detail=f"You do not have access to the brand {asked}")
        return asked
    default = get_settings().default_brand_code
    return default if default in codes else codes[0]


def get_request_context(request: Request) -> RequestContext:
    ident = resolve_upstream_identity(request)
    rows = identity_rows(ident) if ident else []
    available = user_brands(rows)
    if not available:
        raise HTTPException(status_code=403, detail=NOT_SET_UP)
    brand = _pick_brand(request, available)
    real = next((e for e in rows if e.get("BRAND_CODE") == brand), None)
    if real is None or not _active(real):
        raise HTTPException(status_code=403, detail=NOT_SET_UP)
    features = brands.enabled_features(brand)
    admin = brands.is_admin(ident)
    perms = permissions_for(real.get("ROLE_CODE"), admin)
    effective = real
    imp = (request.headers.get(IMPERSONATE_HEADER) or "").strip()
    if imp and imp.lower() != real["EMPLOYEE_ID"].lower():
        if USER_IMPERSONATE not in perms:
            raise HTTPException(status_code=403, detail="You do not have permission to impersonate other users")
        target = employee_by_id(imp, brand)
        if target is None or not _active(target):
            raise HTTPException(status_code=403, detail="The employee you are viewing as is not available")
        effective = target
    return RequestContext(real, effective, perms, get_request_id(request), brand, available, features, admin)


def require_permission(permission: Optional[str] = None,
                       feature: Optional[str] = None) -> Callable[..., RequestContext]:
    def dep(ctx: RequestContext = Depends(get_request_context)) -> RequestContext:
        if permission and permission not in ctx.permissions:
            raise HTTPException(status_code=403, detail="You do not have access to this feature")
        if feature and not ctx.has(feature):
            raise HTTPException(status_code=403, detail=FEATURE_OFF)
        return ctx
    return dep


def employee_out(e: dict) -> dict:
    """The contract `Employee` shape."""
    t = get_refs(e["BRAND_CODE"]).territories.get(e.get("HOME_TERRITORY_ID") or "", {})
    return {"employee_id": e["EMPLOYEE_ID"], "network_id": e.get("NETWORK_ID"), "username": e.get("USERNAME"),
            "full_name": e.get("FULL_NAME"), "initials": e.get("INITIALS"),
            "business_unit": e.get("BUSINESS_UNIT"), "role_code": e.get("ROLE_CODE"),
            "role_title": e.get("ROLE_TITLE"), "access_level": e.get("ACCESS_LEVEL"),
            "access_regions": e.get("ACCESS_REGIONS"), "home_territory_id": e.get("HOME_TERRITORY_ID"),
            "territory_name": t.get("TERRITORY_NAME"), "region": t.get("REGION")}


def territory_out(brand_code: str, tid: str) -> dict:
    t = get_refs(brand_code).territories.get(tid, {})
    return {"territory_id": tid, "territory_name": t.get("TERRITORY_NAME"), "city": t.get("CITY"),
            "state": t.get("STATE"), "region": t.get("REGION")}
