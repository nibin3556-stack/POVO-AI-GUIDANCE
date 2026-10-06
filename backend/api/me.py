"""GET /api/v1/me: who is signed in, who the app is showing, the brand, its features, and "today"."""
from fastapi import APIRouter, Depends

from helpers.dates import today
from helpers.dependency import RequestContext, employee_out, get_request_context, territory_out
from registry.features import ALL_CODES
from helpers.territory_data import get_territory
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/me", tags=["session"])


@router.get("")
def me(ctx: RequestContext = Depends(get_request_context)) -> dict:
    td = get_territory(ctx.brand_code, ctx.territory_id)
    dates = [a["EVENT_DATE"] for a in td.activity if a["EVENT_DATE"]]
    return ok({"signed_in": employee_out(ctx.real), "effective": employee_out(ctx.effective),
               "is_impersonating": ctx.is_impersonating, "permissions": ctx.permissions,
               "territory": territory_out(ctx.brand_code, ctx.territory_id), "today": today(),
               "data_as_of": max(dates) if dates else None,
               "brand": next(({"code": b["BRAND_CODE"], "name": b["BRAND_NAME"]} for b in ctx.brands
                              if b["BRAND_CODE"] == ctx.brand_code), {"code": ctx.brand_code, "name": ctx.brand_code}),
               "brands": [{"code": b["BRAND_CODE"], "name": b["BRAND_NAME"]} for b in ctx.brands],
               # Catalog order, so the frontend can compare lists without sorting.
               "features": [f for f in ALL_CODES if f in ctx.features],
               "is_admin": ctx.is_admin})
