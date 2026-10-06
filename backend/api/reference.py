"""GET /api/v1/reference: the lookups every screen labels and colours data with.

Not territory-specific, so it only needs a signed-in user. The frontend loads
it once per session and caches it.
"""
from fastapi import APIRouter, Depends

from helpers.dependency import RequestContext, get_request_context
from helpers.reference import build_reference
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/reference", tags=["reference"])


@router.get("")
def reference(ctx: RequestContext = Depends(get_request_context)) -> dict:
    return ok(build_reference(ctx.brand_code))
