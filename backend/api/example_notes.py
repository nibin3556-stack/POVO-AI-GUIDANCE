"""AI example notes for a post-call note field (see helpers/example_notes.py)."""
from fastapi import APIRouter, Depends, HTTPException

from database.tables import app
from database.warehouse import get_warehouse
from helpers import prep
from helpers.dependency import RequestContext, require_permission
from helpers.example_notes import suggest_notes
from helpers.targets import universe
from registry.permissions_seed import CALL_ASSESS
from schema.example_notes import ExampleNotesRequest
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/example-notes", tags=["example-notes"])
Guard = Depends(require_permission(CALL_ASSESS))


@router.post("")
def example_notes(body: ExampleNotesRequest, ctx: RequestContext = Guard) -> dict:
    u = universe(ctx.territory_id)
    p = prep.person_or_none(u, body.participant_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    others: list[str] = []
    if body.call_id:
        from api.calls import load_call  # local import: api modules stay independent at import time
        call = load_call(ctx, body.call_id)
        if body.participant_id not in call["PARTICIPANTS"]:
            raise HTTPException(status_code=404, detail="Participant not found on this call")
        if body.category == "additional":
            # Additional Notes are about what else came up, so the model sees what was already covered.
            rows = get_warehouse().query(
                f"SELECT POINT_TEXT FROM {app('APP_CALL_POINT_ASSESSMENT')} WHERE CALL_ID = :cid "
                f"AND WAS_RAISED = TRUE AND CATEGORY <> 'additional' ORDER BY CATEGORY, POINT_RANK",
                {"cid": body.call_id})
            others = [r["POINT_TEXT"] for r in rows if r.get("POINT_TEXT")]
    reception = body.reception if body.category in ("messaging", "closing") else None
    return ok(suggest_notes(u, p, body.category, (body.point_text or "").strip(), reception, others,
                            ctx.request_id))
