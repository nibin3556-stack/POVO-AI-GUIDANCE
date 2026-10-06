"""AI compliance check on a call note, and accepting its suggested rewrite."""
from fastapi import APIRouter, Depends, HTTPException

from core.config import get_settings

from database.tables import app
from database.warehouse import get_warehouse
from helpers import prep
from helpers.audit import audit_ctx
from helpers.compliance import service
from helpers.dependency import RequestContext, require_permission
from helpers.targets import universe
from registry.features import COMPLIANCE_CHECK
from registry.permissions_seed import CALL_ASSESS
from schema.compliance import ComplianceCheckRequest
from schema.response_schema import ok

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])
Guard = Depends(require_permission(CALL_ASSESS, COMPLIANCE_CHECK))


@router.post("/check")
def check(body: ComplianceCheckRequest, ctx: RequestContext = Guard) -> dict:
    wh = get_warehouse()
    u = universe(ctx.brand_code, ctx.territory_id)
    who, role, ctx_text = "the HCP", "HCP", body.point_text or ""
    if len(body.note) > service.note_limit(body.category):
        raise HTTPException(status_code=422, detail=f"Note is longer than {service.note_limit(body.category)} characters")
    if body.call_id:
        from api.calls import load_call  # local import: api modules stay independent at import time
        call = load_call(ctx, body.call_id)
        if body.participant_id not in call["PARTICIPANTS"]:
            raise HTTPException(status_code=404, detail="Participant not found on this call")
        if body.category == "additional":
            rows = wh.query(f"SELECT POINT_TEXT FROM {app('APP_CALL_POINT_ASSESSMENT')} "
                            f"WHERE BRAND_CODE = :brand AND CALL_ID = :cid", {"brand": ctx.brand_code, "cid": body.call_id})
            ctx_text = " ".join(r.get("POINT_TEXT") or "" for r in rows) or ctx_text
    p = prep.person_or_none(u, body.participant_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    who, role = p["display_name"], p["role_type"]
    result = service.evaluate(body.note, body.category, body.point_text or "", who, ctx_text, role, ctx.request_id,
                              brand_code=ctx.brand_code)
    prev = None
    if body.call_id and result["engine"] == "rules" and get_settings().ai_active:
        # The AI pass failed this time. Its earlier verdict on this exact text still stands
        # (Submit would apply it), so show that instead of a weaker rules-only "passed".
        prev = service.latest_ai_check(body.call_id, body.participant_id, body.category, body.point_id,
                                       body.note.strip(), ctx.brand_code)
    if prev is not None:
        check_id = prev.pop("check_id")
        result = prev
    else:
        check_id = service.persist(result, body.call_id, body.participant_id, body.category, body.point_id,
                                   body.note.strip(), ctx.effective["EMPLOYEE_ID"], ctx.real["EMPLOYEE_ID"],
                                   ctx.brand_code)
    if body.call_id:
        # Only the row whose stored note IS the checked note takes the result.
        wh.execute(f"UPDATE {app('APP_CALL_POINT_ASSESSMENT')} SET COMPLIANCE_STATUS = :st, COMPLIANCE_CHECK_ID = :chk "
                   f"WHERE BRAND_CODE = :brand AND CALL_ID = :cid AND PARTICIPANT_ID = :pid AND CATEGORY = :cat "
                   f"AND POINT_ID = :point AND TRIM(COALESCE(NOTE, '')) = :note",
                   {"st": result["status"], "chk": check_id, "brand": ctx.brand_code, "cid": body.call_id, "pid": body.participant_id,
                    "cat": body.category, "point": body.point_id, "note": body.note.strip()})
    audit_ctx(ctx, "COMPLIANCE_CHECK", "compliance", check_id,
              {"status": result["status"], "score": result["score"], "engine": result["engine"],
               "rule_ids": [i["rule_id"] for i in result["issues"]], "call_id": body.call_id})
    return ok({"check_id": check_id, **result})


@router.post("/{check_id}/accept")
def accept(check_id: str, ctx: RequestContext = Guard) -> dict:
    wh = get_warehouse()
    rows = wh.query(f"SELECT CHECK_ID, SUGGESTED_TEXT FROM {app('APP_COMPLIANCE_CHECK')} "
                    f"WHERE BRAND_CODE = :brand AND CHECK_ID = :id AND REP_EMPLOYEE_ID = :rep",
                    {"brand": ctx.brand_code, "id": check_id, "rep": ctx.effective["EMPLOYEE_ID"]})
    if not rows:
        raise HTTPException(status_code=404, detail="Compliance check not found")
    wh.execute(f"UPDATE {app('APP_COMPLIANCE_CHECK')} SET SUGGESTION_ACCEPTED = TRUE "
               f"WHERE BRAND_CODE = :brand AND CHECK_ID = :id", {"brand": ctx.brand_code, "id": check_id})
    audit_ctx(ctx, "SUGGESTION_ACCEPT", "compliance", check_id, {})
    return ok({"check_id": check_id, "suggestion_accepted": True, "suggested_text": rows[0]["SUGGESTED_TEXT"]})
