"""Calls, assessment autosave and Submit (the next-call revision).

A call belongs to its effective rep: another rep (or another territory) gets
404, while a manager impersonating that rep sees it. Writes record both the
effective rep (REP_EMPLOYEE_ID) and the real actor (ACTED_BY_EMPLOYEE_ID /
UPDATED_BY).

Submit (POST /{call_id}/next-call):
  1. re-check every non-empty note with the rules      -> 409 + data.flags
  2. nothing answered                                  -> 422
  3. per participant with an answer: revise the three lists (helpers/revision),
     asking n8n only for objection states, summary and next best action. A
     delivered point the rep marked Reinforce is assessed under its own
     POINT_ID and is updated in the delivered history.
  4. persist the revisions, mark the call assessed, audit
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from core.config import get_settings
from core.exception_handler import ApiError
from database.tables import app
from database.warehouse import get_warehouse, to_date
from helpers import n8n_client, prep
from helpers.audit import audit_ctx
from helpers.compliance import service as compliance
from helpers.content.library import get_library
from helpers.content.select import CATEGORIES, participant_context
from helpers.dates import fmt_mdy, now_utc, today
from helpers.dependency import RequestContext, require_permission
from helpers.reference import next_call_steps
from helpers.revision import revise
from helpers.targets import universe
from registry.permissions_seed import CALL_ASSESS
from schema.calls import AssessmentBatch, CallCreate
from schema.response_schema import ok

logger = logging.getLogger("povo.calls")
router = APIRouter(prefix="/api/v1/calls", tags=["calls"])
Guard = Depends(require_permission(CALL_ASSESS))


# ---------------------------------------------------------------------------
def _call_row(r: dict) -> dict:
    r["CALL_DATE"] = to_date(r["CALL_DATE"])
    r["PARTICIPANTS"] = json.loads(r.get("PARTICIPANT_IDS") or "[]")
    return r


def load_call(ctx: RequestContext, call_id: str) -> dict:
    rows = get_warehouse().query(
        f"SELECT * FROM {app('APP_CALL')} WHERE CALL_ID = :cid AND TERRITORY_ID = :tid AND REP_EMPLOYEE_ID = :rep",
        {"cid": call_id, "tid": ctx.territory_id, "rep": ctx.effective["EMPLOYEE_ID"]})
    if not rows:
        raise HTTPException(status_code=404, detail="Call not found")
    return _call_row(rows[0])


def assessments(call_id: str) -> list[dict]:
    return get_warehouse().query(
        f"SELECT * FROM {app('APP_CALL_POINT_ASSESSMENT')} WHERE CALL_ID = :cid "
        f"ORDER BY PARTICIPANT_ID, CATEGORY, POINT_RANK", {"cid": call_id})


def call_out(call: dict) -> dict:
    return {"call_id": call["CALL_ID"], "hcp_id": call["HCP_ID"], "call_date": call["CALL_DATE"],
            "participant_ids": call["PARTICIPANTS"], "status": call["STATUS"],
            "revision_no": int(call.get("REVISION_NO") or 0),
            "assessments": [{"participant_id": a["PARTICIPANT_ID"], "category": a["CATEGORY"],
                             "point_id": a["POINT_ID"], "point_rank": a.get("POINT_RANK"),
                             "point_text": a.get("POINT_TEXT"), "was_raised": bool(a.get("WAS_RAISED")),
                             "reception": a.get("RECEPTION"), "note": a.get("NOTE") or "",
                             "compliance_status": a.get("COMPLIANCE_STATUS") or "unchecked",
                             "compliance_check_id": a.get("COMPLIANCE_CHECK_ID")}
                            for a in assessments(call["CALL_ID"])]}


def open_call(ctx: RequestContext, primary_id: str) -> Optional[dict]:
    rows = get_warehouse().query(
        f"SELECT * FROM {app('APP_CALL')} WHERE TERRITORY_ID = :tid AND REP_EMPLOYEE_ID = :rep AND HCP_ID = :hcp "
        f"AND STATUS = 'planned' ORDER BY CREATED_AT DESC LIMIT 1",
        {"tid": ctx.territory_id, "rep": ctx.effective["EMPLOYEE_ID"], "hcp": primary_id})
    return _call_row(rows[0]) if rows else None


def _save_call(call: dict) -> None:
    get_warehouse().merge("APP_CALL", ["CALL_ID"], [{
        "CALL_ID": call["CALL_ID"], "TERRITORY_ID": call["TERRITORY_ID"], "REP_EMPLOYEE_ID": call["REP_EMPLOYEE_ID"],
        "ACTED_BY_EMPLOYEE_ID": call["ACTED_BY_EMPLOYEE_ID"], "HCP_ID": call["HCP_ID"],
        "CALL_DATE": call["CALL_DATE"], "PARTICIPANT_IDS": json.dumps(call["PARTICIPANTS"]),
        "STATUS": call["STATUS"], "REVISION_NO": int(call.get("REVISION_NO") or 0),
        "CREATED_AT": call.get("CREATED_AT") or now_utc(), "UPDATED_AT": now_utc()}])


# ---------------------------------------------------------------------------
@router.post("")
def create_call(body: CallCreate, ctx: RequestContext = Guard) -> dict:
    u = universe(ctx.territory_id)
    primary = prep.resolve_primary(u, body.hcp_id)
    allowed = [p["hcp_id"] for p in prep.participants_of(u, primary)]
    wanted = [primary["hcp_id"]] + [p for p in body.participant_ids if p != primary["hcp_id"]]
    if body.hcp_id != primary["hcp_id"] and body.hcp_id not in wanted:
        wanted.append(body.hcp_id)
    bad = [p for p in wanted if p not in allowed]
    if bad:
        raise HTTPException(status_code=422, detail="Participants must be the physician and their affiliated NP/PA")
    participants = [p for p in allowed if p in wanted]  # physician first, stable order
    call = open_call(ctx, primary["hcp_id"])
    created = call is None
    if created:
        call = {"CALL_ID": str(uuid.uuid4()), "TERRITORY_ID": ctx.territory_id,
                "REP_EMPLOYEE_ID": ctx.effective["EMPLOYEE_ID"], "ACTED_BY_EMPLOYEE_ID": ctx.real["EMPLOYEE_ID"],
                "HCP_ID": primary["hcp_id"], "CALL_DATE": today(), "STATUS": "planned", "REVISION_NO": 0,
                "CREATED_AT": now_utc()}
    call["PARTICIPANTS"] = participants
    call["ACTED_BY_EMPLOYEE_ID"] = ctx.real["EMPLOYEE_ID"]
    _save_call(call)
    if created:
        audit_ctx(ctx, "CALL_CREATE", "calls", call["CALL_ID"],
                  {"hcp_id": primary["hcp_id"], "participants": len(participants)})
    return ok(call_out(call))


@router.get("/active")
def active_call(hcp_id: str = Query(min_length=1), ctx: RequestContext = Guard) -> dict:
    primary = prep.resolve_primary(universe(ctx.territory_id), hcp_id)
    call = open_call(ctx, primary["hcp_id"])
    return ok(call_out(call) if call else None)


@router.get("/{call_id}")
def get_call(call_id: str, ctx: RequestContext = Guard) -> dict:
    return ok(call_out(load_call(ctx, call_id)))


@router.put("/{call_id}/assessments")
def save_assessments(call_id: str, body: AssessmentBatch, ctx: RequestContext = Guard) -> dict:
    call = load_call(ctx, call_id)
    if call["STATUS"] != "planned":
        raise HTTPException(status_code=409, detail="This call has already been assessed")
    existing = {(a["PARTICIPANT_ID"], a["CATEGORY"], a["POINT_ID"]): a for a in assessments(call_id)}
    rows = []
    for it in body.items:
        if it.participant_id not in call["PARTICIPANTS"]:
            raise HTTPException(status_code=422, detail="Participant is not on this call")
        if it.category == "additional" and it.point_id != "additional":
            raise HTTPException(status_code=422, detail="The additional note uses point_id 'additional'")
        note = (it.note or "")
        if len(note) > compliance.note_limit(it.category):
            raise HTTPException(status_code=422,
                                detail=f"Note is longer than {compliance.note_limit(it.category)} characters")
        prev = existing.get((it.participant_id, it.category, it.point_id))
        unchanged = prev is not None and (prev.get("NOTE") or "").strip() == note.strip()
        rows.append({"CALL_ID": call_id, "PARTICIPANT_ID": it.participant_id, "CATEGORY": it.category,
                     "POINT_ID": it.point_id, "POINT_RANK": it.point_rank, "POINT_TEXT": it.point_text,
                     "WAS_RAISED": it.was_raised, "RECEPTION": it.reception if it.category != "additional" else None,
                     "NOTE": note,
                     # A changed note must be checked again before it can count as compliant.
                     "COMPLIANCE_STATUS": (prev.get("COMPLIANCE_STATUS") or "unchecked") if unchanged else "unchecked",
                     "COMPLIANCE_CHECK_ID": prev.get("COMPLIANCE_CHECK_ID") if unchanged else None,
                     "UPDATED_AT": now_utc(), "UPDATED_BY": ctx.real["EMPLOYEE_ID"]})
    get_warehouse().merge("APP_CALL_POINT_ASSESSMENT", ["CALL_ID", "PARTICIPANT_ID", "CATEGORY", "POINT_ID"], rows)
    audit_ctx(ctx, "ASSESSMENT_SAVE", "calls", call_id,
              {"items": len(rows), "raised": sum(1 for r in rows if r["WAS_RAISED"])})
    return ok(call_out(call))


# ---------------------------------------------------------------------------
def _ai_next_call(u, p: dict, call_date, answered: list[dict], request_id: str) -> Optional[dict]:
    if not get_settings().ai_active:
        return None
    out = n8n_client.post(get_settings().n8n_next_call_path, {
        "request_id": request_id, "participant": prep.participant_payload(u, p), "call_date": call_date.isoformat(),
        "assessments": [{"category": a["CATEGORY"], "point_id": a["POINT_ID"], "text": a.get("POINT_TEXT") or "",
                         "reception": a.get("RECEPTION"), "note": a.get("NOTE") or ""} for a in answered]})
    if not out:
        return None
    states, summary, nba = out.get("objection_states"), out.get("summary"), out.get("next_best_action")
    if not isinstance(states, dict) or not all(v in ("open", "resolved") for v in states.values()):
        return None
    if not isinstance(summary, str) or not summary.strip() or len(summary) > 240:
        return None
    if not isinstance(nba, str) or not nba.strip() or len(nba) > 200:
        return None
    return {"states": {str(k): v for k, v in states.items()}, "summary": summary.strip(), "nba": nba.strip()}


@router.post("/{call_id}/next-call")
def next_call(call_id: str, ctx: RequestContext = Guard) -> dict:
    call = load_call(ctx, call_id)
    if call["STATUS"] != "planned":
        raise ApiError(409, "This call has already been assessed", {"flags": []})
    u = universe(ctx.territory_id)
    primary = prep.resolve_primary(u, call["HCP_ID"])
    people = {p["hcp_id"]: p for p in prep.participants_of(u, primary)}
    rows = assessments(call_id)
    wh = get_warehouse()

    # 1. Server-side re-check of every non-empty note. A note the AI already
    #    checked (same text, same slot) keeps that verdict; any other note gets
    #    the full check now, rules plus the n8n AI pass when AI is on.
    all_points = " ".join(a.get("POINT_TEXT") or "" for a in rows)
    flags = []
    for a in rows:
        note = (a.get("NOTE") or "").strip()
        if not note:
            continue
        res = compliance.latest_ai_check(call_id, a["PARTICIPANT_ID"], a["CATEGORY"], a["POINT_ID"], note)
        if res is not None:
            check_id = res.pop("check_id")
        else:
            person = people.get(a["PARTICIPANT_ID"], primary)
            res = compliance.evaluate(note, a["CATEGORY"], a.get("POINT_TEXT") or "", person["display_name"],
                                      all_points, person["role_type"], ctx.request_id)
            check_id = compliance.persist(res, call_id, a["PARTICIPANT_ID"], a["CATEGORY"], a["POINT_ID"], note,
                                          ctx.effective["EMPLOYEE_ID"], ctx.real["EMPLOYEE_ID"])
        wh.execute(f"UPDATE {app('APP_CALL_POINT_ASSESSMENT')} SET COMPLIANCE_STATUS = :st, "
                   f"COMPLIANCE_CHECK_ID = :chk WHERE CALL_ID = :cid AND PARTICIPANT_ID = :pid "
                   f"AND CATEGORY = :cat AND POINT_ID = :point",
                   {"st": res["status"], "chk": check_id, "cid": call_id, "pid": a["PARTICIPANT_ID"],
                    "cat": a["CATEGORY"], "point": a["POINT_ID"]})
        if res["status"] == "flagged":
            # The full report travels with the flag, so the rep can open it at once.
            flags.append({"participant_id": a["PARTICIPANT_ID"], "category": a["CATEGORY"],
                          "point_id": a["POINT_ID"], "chip": res["issues"][0]["chip"], "note": note,
                          "result": {"check_id": check_id, **res}})
    if flags:
        raise ApiError(409, f"Clear {len(flags)} compliance {'flag' if len(flags) == 1 else 'flags'} "
                            f"to submit the assessment", {"flags": flags})

    # 2. Something must be answered.
    answered = [a for a in rows if a.get("WAS_RAISED") and a["CATEGORY"] in CATEGORIES]
    if not answered:
        raise HTTPException(status_code=422, detail="Select at least one point that was raised on the call")

    # 3. Revise per participant.
    lib = get_library()
    call_date = today()
    prev = wh.query(f"SELECT MAX(REVISION_NO) AS N FROM {app('APP_CALL_PREP_REVISION')} "
                    f"WHERE TERRITORY_ID = :tid AND HCP_ID = :hcp", {"tid": ctx.territory_id, "hcp": primary["hcp_id"]})
    revision_no = int((prev[0]["N"] if prev else None) or 0) + 1
    out_people, sources, new_rows = [], set(), []
    for pid in call["PARTICIPANTS"]:
        p = people.get(pid)
        mine = [a for a in answered if a["PARTICIPANT_ID"] == pid]
        if p is None or not mine:
            continue  # POC: a participant with nothing answered keeps their points unchanged
        pctx = participant_context(u, p, primary, call_date)
        lists = {c: prep.current_list(u, primary, p, c, ctx.request_id)["points"] for c in CATEGORIES}
        answers = {c: {a["POINT_ID"]: {"reception": a.get("RECEPTION"), "note": a.get("NOTE")}
                       for a in mine if a["CATEGORY"] == c} for c in CATEGORIES}
        ai = _ai_next_call(u, p, call_date, mine, ctx.request_id)
        res = revise(lib, pctx, lists, answers, call_date, fmt_mdy(call_date), ai["states"] if ai else None)
        engine = "ai" if ai else "rules"
        sources.add(engine)
        nba = ai["nba"] if ai else res["next_best_action"]
        for cat in CATEGORIES:
            new_rows.append({"REVISION_ID": str(uuid.uuid4()), "CALL_ID": call_id, "TERRITORY_ID": ctx.territory_id,
                             "HCP_ID": primary["hcp_id"], "PARTICIPANT_ID": pid, "REVISION_NO": revision_no,
                             "CALL_DATE": call_date, "CATEGORY": cat,
                             "POINTS_JSON": json.dumps(res["lists"][cat]), "SUMMARY_TEXT": res["summaries"][cat],
                             "NEXT_BEST_ACTION": nba, "HISTORY_LINE": res["history_line"], "ENGINE": engine,
                             "CREATED_AT": now_utc()})
        out_people.append({"participant_id": pid, "summary": ai["summary"] if ai else res["history_line"],
                           "next_best_action": nba})
    wh.insert("APP_CALL_PREP_REVISION", new_rows)
    call.update({"STATUS": "assessed", "REVISION_NO": revision_no, "CALL_DATE": call_date,
                 "ACTED_BY_EMPLOYEE_ID": ctx.real["EMPLOYEE_ID"]})
    _save_call(call)
    audit_ctx(ctx, "NEXT_CALL_GENERATE", "calls", call_id,
              {"revision_no": revision_no, "participants": len(out_people), "engine": sorted(sources)})
    return ok({"call_id": call_id, "revision_no": revision_no, "call_date": call_date,
               "steps": next_call_steps(sum(1 for a in rows if (a.get("NOTE") or "").strip())),
               "participants": out_people, "source": "ai" if "ai" in sources else "rules"})
