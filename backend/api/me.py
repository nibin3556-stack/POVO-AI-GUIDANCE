"""GET /api/v1/me: who is signed in, who the app is showing, and "today"."""
from fastapi import APIRouter, Depends

from helpers.dates import today
from helpers.dependency import RequestContext, employee_out, get_request_context, territory_out
from helpers.territory_data import get_territory
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/me", tags=["session"])


@router.get("")
def me(ctx: RequestContext = Depends(get_request_context)) -> dict:
    td = get_territory(ctx.territory_id)
    dates = [a["EVENT_DATE"] for a in td.activity if a["EVENT_DATE"]]
    return ok({"signed_in": employee_out(ctx.real), "effective": employee_out(ctx.effective),
               "is_impersonating": ctx.is_impersonating, "permissions": ctx.permissions,
               "territory": territory_out(ctx.territory_id), "today": today(),
               "data_as_of": max(dates) if dates else None})
