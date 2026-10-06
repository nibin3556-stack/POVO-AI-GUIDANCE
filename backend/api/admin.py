"""Brand and feature configuration, for the users in ADMIN_USERS_FILE only.

The check is on the REAL signed-in identity (the Posit header), never on an
impersonated employee, and does not need a DIM_EMPLOYEE row: an admin may
configure a brand they do not sell. Every change is written to APP_AUDIT_LOG
under the brand it changed.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request

from core.identity import resolve_upstream_identity
from core.request_id import get_request_id
from helpers import brands
from helpers.audit import audit
from registry import features as F
from schema.admin import BrandSave, FeatureSave
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def require_admin(request: Request) -> str:
    """The admin's identity (username or email), or 403."""
    ident = resolve_upstream_identity(request)
    if not brands.is_admin(ident):
        raise HTTPException(status_code=403, detail="Only admin users can configure brands and features")
    return ident or ""


Admin = Depends(require_admin)


def _brand_out(b: dict) -> dict:
    return {"code": b["BRAND_CODE"], "name": b["BRAND_NAME"], "description": b.get("DESCRIPTION"),
            "is_active": brands._truthy(b.get("IS_ACTIVE")), "sort_order": int(b.get("SORT_ORDER") or 0),
            "enabled_features": len(brands.enabled_features(b["BRAND_CODE"])), "feature_count": len(F.FEATURES),
            "updated_at": b.get("UPDATED_AT"), "updated_by": b.get("UPDATED_BY")}


def _brand_or_404(code: str) -> dict:
    code = code.strip().upper()
    b = brands.brand(code)
    if b is None and brands.sync_brands():  # loaded by the data feed since the last sync
        b = brands.brand(code)
    if b is None:
        raise HTTPException(status_code=404, detail=f"Brand {code} not found")
    return b


@router.get("/me")
def admin_me(request: Request) -> dict:
    ident = resolve_upstream_identity(request)
    return ok({"username": ident, "is_admin": brands.is_admin(ident)})


@router.get("/brands")
def list_brands(_admin: str = Admin) -> dict:
    brands.clear_cache()  # admins always see the brand master as it is now (e.g. a brand the pipeline just added)
    brands.sync_brands()
    return ok([_brand_out(b) for b in brands.brands(active_only=False)])


@router.post("/brands")
def save_brand(body: BrandSave, request: Request, admin: str = Admin) -> dict:
    code = body.brand_code
    existing = brands.brand(code)
    sort_order = body.sort_order if body.sort_order is not None else \
        int((existing or {}).get("SORT_ORDER") or len(brands.brands(active_only=False)) + 1)
    brands.save_brand(code, body.brand_name, body.description, body.is_active, sort_order, admin)
    audit("BRAND_SAVE", "admin", code, admin, admin,
          {"created": existing is None, "is_active": body.is_active}, get_request_id(request), code)
    return ok(_brand_out(_brand_or_404(code)))


@router.get("/brands/{brand_code}/features")
def get_features(brand_code: str, _admin: str = Admin) -> dict:
    b = _brand_or_404(brand_code)
    return ok({"brand": _brand_out(b), "features": brands.feature_rows(b["BRAND_CODE"])})


@router.put("/brands/{brand_code}/features")
def put_features(brand_code: str, body: FeatureSave, request: Request, admin: str = Admin) -> dict:
    b = _brand_or_404(brand_code)
    unknown = sorted(set(body.features) - set(F.ALL_CODES))
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown features: {', '.join(unknown)}")
    brands.save_features(b["BRAND_CODE"], body.features, admin)
    audit("FEATURE_UPDATE", "admin", b["BRAND_CODE"], admin, admin,
          {"enabled": sorted(k for k, v in body.features.items() if v),
           "disabled": sorted(k for k, v in body.features.items() if not v)},
          get_request_id(request) or str(uuid.uuid4()), b["BRAND_CODE"])
    return ok({"brand": _brand_out(b), "features": brands.feature_rows(b["BRAND_CODE"])})
