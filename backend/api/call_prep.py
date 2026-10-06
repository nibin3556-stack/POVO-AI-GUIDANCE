"""Call Prep: the participant profile and the top-3 talking points per category."""
from fastapi import APIRouter, Depends

from helpers import prep
from helpers.dependency import RequestContext, require_permission
from helpers.targets import universe
from registry.features import AI_CALL_PREP, PRE_CALL_TAB
from registry.permissions_seed import GUIDANCE_VIEW
from schema.call_prep import CallPrepRequest
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/call-prep", tags=["call-prep"])
profile_router = APIRouter(prefix="/api/v1/targets", tags=["call-prep"])
Guard = Depends(require_permission(GUIDANCE_VIEW, PRE_CALL_TAB))


@profile_router.get("/{hcp_id}/profile")
def profile(hcp_id: str, ctx: RequestContext = Guard) -> dict:
    return ok(prep.profile(universe(ctx.brand_code, ctx.territory_id), hcp_id))


@router.post("")
def call_prep(body: CallPrepRequest, ctx: RequestContext = Guard) -> dict:
    return ok(prep.call_prep(universe(ctx.brand_code, ctx.territory_id), body.hcp_id, body.participant_id, body.category,
                             ctx.request_id, use_ai=ctx.has(AI_CALL_PREP)))
