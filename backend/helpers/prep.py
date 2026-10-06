"""Call Prep and the participant profile: shared by the call-prep, calls and
next-call endpoints so they all see the same point lists.

The "current list" for (participant, category) is, in order of precedence:

  1. the latest APP_CALL_PREP_REVISION (the next-call list, already tagged), or
  2. the initial rules list (five approved points), reordered by the n8n
     call-prep workflow when AI is on. That AI answer is cached in
     APP_AI_CACHE for AI_CACHE_HOURS, keyed by territory + primary HCP +
     participant + category + revision + content version, so the list the rep
     prepared with is the list the next-call revision starts from.

The screen shows the top 3 (TP_SHOW) points still to deliver, then the points
"Delivered on earlier calls" (each with its date and reception, and a Reinforce
toggle on screen). The revision works on the full list, because points 4 and 5
can move up.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import timedelta
from typing import Optional

from fastapi import HTTPException

from core.config import get_settings
from database.tables import app
from database.warehouse import get_warehouse, to_date
from helpers import n8n_client
from helpers.content.library import get_library
from helpers.content.select import LABELS, initial_points, participant_context, person, possessive
from helpers.dates import fmt_long, fmt_mdy, now_utc, today
from helpers.targets import Universe

logger = logging.getLogger("povo.prep")
TP_SHOW = 3
#: Real data carries dozens of rep calls for a Super High target; the POC shows
#: six cards. The profile returns the most recent ones.
MAX_INTERACTIONS = 12


#: In-territory HCP (target or not), or None. Re-exported for the API layer.
person_or_none = person


# ---------------------------------------------------------------------------
def resolve_primary(u: Universe, hcp_id: str) -> dict:
    """The physician for a target (an NP/PA resolves to the parent). 404 outside the territory."""
    p = person(u, hcp_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Target not found")
    if p["role_type"] != "HCP" and p.get("parent_hcp_id"):
        parent = person(u, p["parent_hcp_id"])
        if parent is not None:
            return parent
    return p


def participants_of(u: Universe, primary: dict) -> list[dict]:
    kids = sorted((h for h in u.td.hcps.values() if h.get("PARENT_HCP_ID") == primary["hcp_id"]),
                  key=lambda h: h["HCP_ID"])
    return [primary] + [p for p in (person(u, h["HCP_ID"]) for h in kids) if p]


def resolve_participant(u: Universe, primary: dict, participant_id: str) -> dict:
    for p in participants_of(u, primary):
        if p["hcp_id"] == participant_id:
            return p
    raise HTTPException(status_code=404, detail="Participant not found for this target")


# ---------------------------------------------------------------------------
def latest_revision(brand: str, tid: str, primary_id: str, participant_id: str, category: str) -> Optional[dict]:
    rows = get_warehouse().query(
        f"SELECT * FROM {app('APP_CALL_PREP_REVISION')} WHERE BRAND_CODE = :brand AND TERRITORY_ID = :tid "
        f"AND HCP_ID = :hcp AND PARTICIPANT_ID = :pid AND CATEGORY = :cat "
        f"ORDER BY REVISION_NO DESC, CREATED_AT DESC LIMIT 1",
        {"brand": brand, "tid": tid, "hcp": primary_id, "pid": participant_id, "cat": category})
    if not rows:
        return None
    r = rows[0]
    r["CALL_DATE"] = to_date(r["CALL_DATE"])
    r["POINTS"] = json.loads(r.get("POINTS_JSON") or "[]")
    return r


def _cache_key(*parts) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def cache_get(brand: str, key: str) -> Optional[dict]:
    try:
        rows = get_warehouse().query(
            f"SELECT PAYLOAD_JSON FROM {app('APP_AI_CACHE')} WHERE BRAND_CODE = :brand AND CACHE_KEY = :k "
            f"AND EXPIRES_AT > :now", {"brand": brand, "k": key, "now": now_utc()})
        return json.loads(rows[0]["PAYLOAD_JSON"]) if rows else None
    except Exception:  # noqa: BLE001 - a cache miss is always safe
        logger.warning("AI cache read failed", exc_info=True)
        return None


def cache_put(brand: str, key: str, kind: str, payload: dict) -> None:
    try:
        now = now_utc()
        get_warehouse().merge("APP_AI_CACHE", ["CACHE_KEY"], [{
            "BRAND_CODE": brand, "CACHE_KEY": key, "KIND": kind, "PAYLOAD_JSON": json.dumps(payload), "CREATED_AT": now,
            "EXPIRES_AT": now + timedelta(hours=get_settings().ai_cache_hours)}])
    except Exception:  # noqa: BLE001
        logger.warning("AI cache write failed", exc_info=True)


def _valid_call_prep(out: dict, candidates: list[dict], category: str) -> Optional[dict]:
    """Re-check the Guard's promise: a subset of the candidates, at most 3, insights <= 220 chars."""
    ids = out.get("ordered_point_ids")
    allowed = {c["point_id"] for c in candidates}
    if not isinstance(ids, list) or not ids or len(ids) > TP_SHOW or len(set(ids)) != len(ids) \
            or not all(isinstance(i, str) and i in allowed for i in ids):
        return None
    insights = out.get("insights") or {}
    if not isinstance(insights, dict):
        return None
    clean = {}
    if category == "messaging":
        for k, v in insights.items():
            if k in ids and isinstance(v, str) and v.strip() and len(v) <= 220:
                clean[k] = v.strip()
    return {"ordered_point_ids": ids, "insights": clean}


def participant_payload(u: Universe, p: dict) -> dict:
    return {"role_type": p["role_type"], "display_name": p["display_name"], "decile": p["decile"],
            "tier_name": (u.refs.tier(p["tier_code"]) or {}).get("TIER_NAME") or "Not in call plan",
            "segment_short_name": u.refs.segment(p.get("segment_code"))["SHORT_NAME"],
            "competitive_focus_label": u.refs.focus_label(p.get("competitive_focus")),
            "hs_patients": p["hs_patients"], "povo_patients": p["povo_patients"],
            "jak_patients": p["jak_patients"], "povo_discussions": p["_discussions"],
            "last_call_date": p["last_call_date"].isoformat() if p["last_call_date"] else None}


def current_list(u: Universe, primary: dict, p: dict, category: str, request_id: str,
                 use_ai: bool = True) -> dict:
    """{points (full list), revision (row|None), source}."""
    rev = latest_revision(u.brand, u.td.territory_id, primary["hcp_id"], p["hcp_id"], category)
    if rev is not None:
        return {"points": rev["POINTS"], "revision": rev, "source": "ai" if rev.get("ENGINE") == "ai" else "rules"}
    lib = get_library(u.brand)
    ctx = participant_context(u, p, primary, today())
    points = initial_points(lib, category, ctx)
    source = "rules"
    if use_ai and get_settings().ai_active and points:
        key = _cache_key("call_prep", u.brand, u.td.territory_id, primary["hcp_id"], p["hcp_id"], category, 0,
                         lib.content_version)
        ai = cache_get(u.brand, key)
        if ai is None:
            ints = sorted((i for i in u.td.interactions if i["HCP_ID"] == p["hcp_id"]),
                          key=lambda i: i["INTERACTION_DATE"] or today(), reverse=True)[:MAX_INTERACTIONS]
            body = {"request_id": request_id, "category": category, "participant": participant_payload(u, p),
                    "interactions": [{"date": i["INTERACTION_DATE"].isoformat() if i["INTERACTION_DATE"] else None,
                                      "type_label": i.get("INTERACTION_TYPE") or u.refs.channel(i["CHANNEL_CODE"])["TYPE_LABEL"],
                                      "summary": i.get("SUMMARY") or "POVO discussed"} for i in ints],
                    "candidates": [{"point_id": c["point_id"], "pillar": c["pillar"], "text": c["text"],
                                    "detail": c["detail"]} for c in points],
                    "max_points": TP_SHOW}
            out = n8n_client.post(get_settings().n8n_call_prep_path, body)
            ai = _valid_call_prep(out, points, category) if out else None
            if ai:
                cache_put(u.brand, key, "call_prep", ai)
        if ai:
            by_id = {c["point_id"]: c for c in points}
            ordered = [by_id[i] for i in ai["ordered_point_ids"]]
            points = ordered + [c for c in points if c["point_id"] not in ai["ordered_point_ids"]]
            for c in points:
                if c["point_id"] in ai["insights"]:
                    c["detail"] = ai["insights"][c["point_id"]]
            source = "ai"
    return {"points": points, "revision": None, "source": source}


#: The AI activity steps per category ({possessive} = "Dr. Winters'" / "Kristen Casey's").
#: Also served by GET /reference, so the screen can play them while the request runs.
PREP_STEPS = {
    "messaging": ["Analyzing {possessive} profile, decile and HS volume",
                  "Applying the Core Claims order for POVO data", "Generating suggested messaging"],
    "objection": ["Analyzing {possessive} profile, decile and HS volume",
                  "Selecting objections from the POVO objection handler", "Generating potential objections"],
    "closing": ["Analyzing {possessive} profile and call history", "Matching suggested closes to the call goals",
                "Generating suggested closing statements"],
}


def steps(category: str, name: str, revised_from=None) -> list[str]:
    if revised_from:
        return [f"Reading the {fmt_mdy(revised_from)} post-call assessment for {name}",
                "Reordering objections by what is still open" if category == "objection"
                else "Checking which points stayed open", f"Generating next-call {LABELS[category].lower()}"]
    return [s.format(possessive=possessive(name)) for s in PREP_STEPS.get(category, PREP_STEPS["messaging"])]


def point_out(x: dict, rank: int, category: str) -> dict:
    return {"point_id": x["point_id"], "rank": rank, "pillar": x.get("pillar"), "text": x["text"],
            "detail": x.get("detail"),
            "detail_label": {"messaging": "Insight", "objection": "Response"}.get(category) if x.get("detail") else None,
            "tags": list(x.get("tags") or []), "previous_text": x.get("previous_text"),
            "previous_rank": x.get("previous_rank")}


def delivered_out(x: dict, category: str) -> dict:
    """A point delivered on an earlier call: date, reception and its label ("Well Received", "Still Open")."""
    return {**point_out(x, 0, category), "delivered_date": x.get("delivered_date"),
            "reception": x.get("reception"), "label": x.get("label") or "", "is_open": bool(x.get("is_open"))}


def split_points(points: list[dict]) -> tuple[list[dict], list[dict]]:
    """(points still to deliver, points delivered on earlier calls)."""
    return [x for x in points if not x.get("delivered")], [x for x in points if x.get("delivered")]


def call_prep(u: Universe, hcp_id: str, participant_id: str, category: str, request_id: str,
              use_ai: bool = True) -> dict:
    primary = resolve_primary(u, hcp_id)
    p = resolve_participant(u, primary, participant_id)
    cur = current_list(u, primary, p, category, request_id, use_ai)
    rev = cur["revision"]
    revised_from = rev["CALL_DATE"] if rev else None
    banner = None
    if rev and (rev.get("SUMMARY_TEXT") or ""):
        banner = {"summary": rev["SUMMARY_TEXT"], "next_best_action": rev.get("NEXT_BEST_ACTION")}
    fresh, delivered = split_points(cur["points"])
    return {"participant_id": p["hcp_id"], "category": category, "revision_no": int(rev["REVISION_NO"]) if rev else 0,
            "is_revised": rev is not None, "revised_from_date": revised_from, "banner": banner,
            "steps": steps(category, p["display_name"], revised_from),
            "heading": f"{'Next-call ' if rev else ''}{LABELS[category]} for {p['display_name']} ({p['role_type']})",
            "points": [point_out(x, i + 1, category) for i, x in enumerate(fresh[:TP_SHOW])],
            "delivered": [delivered_out(x, category) for x in delivered],
            "source": cur["source"]}


# ---------------------------------------------------------------------------
def _bullets(u: Universe, p: dict, primary: dict, history: Optional[tuple],
             last_note: Optional[tuple] = None) -> list[str]:
    """POC histBullets (final): five lines per participant, plus the last call's Additional Notes."""
    dot = "·"
    seg = u.refs.segment(p.get("segment_code"))
    focus = p.get("competitive_focus")
    povo, hs = p["povo_patients"], p["hs_patients"]
    disc = p["_discussions"]
    last = p["last_call_date"]
    if p["role_type"] == "HCP":
        visits = p.get("_visits")
        visits = int(visits) if visits else max(1, round(hs / 12))
        lines = [
            f"Decile D{p['decile']} {dot} #{p['_hs_rank']} of {len(u.list)} POVO Targets {dot} about {visits} HS visits a month",
            f"{seg['FULL_NAME']} {dot} primary focus: {u.refs.focus_label(focus)}"
            f"{' (off label in HS)' if focus == 'jak' else ''} {dot} discuss patients like "
            f"{seg.get('ARCHETYPE_NAME') or ''}",
            f"{povo} POVO {'patient' if povo == 1 else 'patients'}; {hs - povo} HS patients not yet on POVO" if povo
            else f"No POVO scripts yet; {hs} HS patients still to reach",
            "No direct POVO Sales call yet" if not last else
            (f"{disc} POVO {'discussion' if disc == 1 else 'discussions'} (last: {fmt_long(last)})" if disc
             else "No POVO discussion on record"),
            "IncyteCARES enrollment already used for POVO" if p["_incyte"] > 0
            else "No IncyteCARES enrollment on record yet"]
    else:
        lines = [
            f"Works with {primary['display_name']} at {primary.get('account_name') or p.get('account_name') or ''}".strip(),
            f"Decile D{p['decile']} {dot} about {hs} HS patients in follow-up",
            "Handles prior authorizations for new HS starts" if p["role_type"] == "PA"
            else "Leads patient education and refill calls",
            f"{povo} POVO {'patient' if povo == 1 else 'patients'} started" if povo
            else ("No direct POVO Sales call yet" if not last else f"POVO introduced on the {fmt_mdy(last)} call"),
            f"{disc} POVO {'discussion' if disc == 1 else 'discussions'} on record" if disc
            else "No POVO conversation on record"]
    if history:
        lines[4] = f"Post-call {fmt_mdy(history[0])}: {history[1]}"
    if last_note:
        lines.append(f"Last call note ({fmt_long(last_note[0])}): {last_note[1]}")
    return lines


def last_call_notes(brand: str, rows: list[dict]) -> dict[str, tuple]:
    """Per participant, the Additional Notes of the call behind their latest revision (passed notes only).

    The note is carried into the next pre-call plan (POC REV.note).
    """
    latest: dict[str, dict] = {}
    for r in sorted(rows, key=lambda r: (r["REVISION_NO"], str(r["CREATED_AT"]))):
        latest[r["PARTICIPANT_ID"]] = r
    call_ids = sorted({r["CALL_ID"] for r in latest.values() if r.get("CALL_ID")})
    notes: dict[str, str] = {}
    for cid in call_ids:
        found = get_warehouse().query(
            f"SELECT NOTE FROM {app('APP_CALL_POINT_ASSESSMENT')} WHERE BRAND_CODE = :brand AND CALL_ID = :cid "
            f"AND CATEGORY = 'additional' AND COMPLIANCE_STATUS = 'passed'", {"brand": brand, "cid": cid})
        text = next((f["NOTE"].strip() for f in found if (f.get("NOTE") or "").strip()), "")
        if text:
            notes[cid] = text
    return {pid: (to_date(r["CALL_DATE"]), notes[r["CALL_ID"]])
            for pid, r in latest.items() if r.get("CALL_ID") in notes}


def assessed_notes(brand: str, call_ids: list[str]) -> dict[tuple[str, str], list[str]]:
    """(call id, participant id) -> the compliance-passed notes of that participant on that call,
    in the order of the form (messaging, objections, closings, then Additional Notes)."""
    ids = sorted(set(call_ids))
    if not ids:
        return {}
    marks = ", ".join(f":c{i}" for i in range(len(ids)))
    rows = get_warehouse().query(
        f"SELECT CALL_ID, PARTICIPANT_ID, CATEGORY, POINT_RANK, NOTE FROM {app('APP_CALL_POINT_ASSESSMENT')} "
        f"WHERE BRAND_CODE = :brand AND CALL_ID IN ({marks}) AND COMPLIANCE_STATUS = 'passed'",
        {"brand": brand, **{f"c{i}": v for i, v in enumerate(ids)}})
    order = {"messaging": 0, "objection": 1, "closing": 2, "additional": 3}
    out: dict[tuple[str, str], list[str]] = {}
    for r in sorted(rows, key=lambda r: (order.get(r["CATEGORY"], 9), r.get("POINT_RANK") or 0)):
        note = (r.get("NOTE") or "").strip()
        if note:
            out.setdefault((r["CALL_ID"], r["PARTICIPANT_ID"]), []).append(note)
    return out


#: Earlier calls the next-call AI reads (newest first).
HISTORY_CALLS = 5


def call_history(u: Universe, primary_id: str, participant_id: str, exclude_call_id: str,
                 limit: int = HISTORY_CALLS) -> list[dict]:
    """The participant's earlier assessed calls, newest first, for the next-call AI.

    Each call lists the points raised with their reception and the rep's note.
    Only compliance-passed notes travel (an unchecked or flagged note may hold
    PHI or an adverse event); the point itself still counts without its note.
    """
    wh = get_warehouse()
    calls = wh.query(
        f"SELECT CALL_ID, CALL_DATE FROM {app('APP_CALL')} WHERE BRAND_CODE = :brand AND TERRITORY_ID = :tid "
        f"AND HCP_ID = :hcp AND STATUS = 'assessed' AND CALL_ID <> :cid ORDER BY CALL_DATE DESC, UPDATED_AT DESC",
        {"brand": u.brand, "tid": u.td.territory_id, "hcp": primary_id, "cid": exclude_call_id})[:limit]
    if not calls:
        return []
    rows = wh.query(
        f"SELECT CALL_ID, CATEGORY, POINT_RANK, POINT_TEXT, WAS_RAISED, RECEPTION, NOTE, COMPLIANCE_STATUS "
        f"FROM {app('APP_CALL_POINT_ASSESSMENT')} WHERE BRAND_CODE = :brand AND PARTICIPANT_ID = :pid "
        f"AND CALL_ID IN (:ids)", {"brand": u.brand, "pid": participant_id, "ids": [c["CALL_ID"] for c in calls]})
    order = {"messaging": 0, "objection": 1, "closing": 2, "additional": 3}
    out = []
    for c in calls:
        points = []
        for r in sorted((r for r in rows if r["CALL_ID"] == c["CALL_ID"]),
                        key=lambda r: (order.get(r["CATEGORY"], 9), r.get("POINT_RANK") or 0)):
            note = (r.get("NOTE") or "").strip() if r.get("COMPLIANCE_STATUS") == "passed" else ""
            if r["CATEGORY"] == "additional" and not note:
                continue
            if r["CATEGORY"] != "additional" and not r.get("WAS_RAISED"):
                continue
            points.append({"category": r["CATEGORY"], "text": r.get("POINT_TEXT") or "",
                           "reception": r.get("RECEPTION"), "note": note})
        if points:
            out.append({"call_date": to_date(c["CALL_DATE"]).isoformat(), "points": points})
    return out


def recent_interactions(u: Universe, hcp_id: str, limit: int = 8) -> list[dict]:
    """The participant's latest interactions across teams, for the AI prompts."""
    ints = sorted((i for i in u.td.interactions if i["HCP_ID"] == hcp_id),
                  key=lambda i: i["INTERACTION_DATE"] or today(), reverse=True)[:limit]
    return [{"date": i["INTERACTION_DATE"].isoformat() if i["INTERACTION_DATE"] else None,
             "type_label": i.get("INTERACTION_TYPE") or u.refs.channel(i["CHANNEL_CODE"])["TYPE_LABEL"],
             "summary": i.get("SUMMARY") or ""} for i in ints]


def profile(u: Universe, hcp_id: str) -> dict:
    target = person(u, hcp_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target not found")
    primary = resolve_primary(u, hcp_id)
    pre = [primary["hcp_id"]] + ([hcp_id] if hcp_id != primary["hcp_id"] else [])
    # Latest post-call history line per participant (bullet 5).
    hist_rows = get_warehouse().query(
        f"SELECT PARTICIPANT_ID, CALL_ID, CALL_DATE, HISTORY_LINE, REVISION_NO, CREATED_AT "
        f"FROM {app('APP_CALL_PREP_REVISION')} WHERE BRAND_CODE = :brand AND TERRITORY_ID = :tid AND HCP_ID = :hcp",
        {"brand": u.brand, "tid": u.td.territory_id, "hcp": primary["hcp_id"]})
    notes = last_call_notes(u.brand, hist_rows)
    latest: dict[str, tuple] = {}
    for r in sorted(hist_rows, key=lambda r: (r["REVISION_NO"], str(r["CREATED_AT"]))):
        latest[r["PARTICIPANT_ID"]] = (to_date(r["CALL_DATE"]), r["HISTORY_LINE"])
    people = participants_of(u, primary)
    call_notes = assessed_notes(u.brand, [c["CALL_ID"] for p in people for c in u.app_calls_by_hcp.get(p["hcp_id"], [])])
    out = []
    for p in people:
        ints = [{"interaction_id": i["INTERACTION_ID"], "date": i["INTERACTION_DATE"],
                 "channel_code": i["CHANNEL_CODE"], "team_label": u.refs.channel(i["CHANNEL_CODE"])["TEAM_LABEL"],
                 "type_label": i.get("INTERACTION_TYPE") or u.refs.channel(i["CHANNEL_CODE"])["TYPE_LABEL"],
                 "summary": i.get("SUMMARY") or "POVO discussed", "is_new": False}
                for i in u.td.interactions if i["HCP_ID"] == p["hcp_id"]]
        for c in u.app_calls_by_hcp.get(p["hcp_id"], []):
            mine = call_notes.get((c["CALL_ID"], p["hcp_id"])) or []
            ints.append({"interaction_id": c["CALL_ID"], "date": c["CALL_DATE"], "channel_code": "rep",
                         "team_label": "POVO Sales", "type_label": "Direct call",
                         "summary": " · ".join(mine) if mine else "Call assessed", "is_new": True})
        ints.sort(key=lambda x: (x["date"] or today(), x["is_new"]), reverse=True)
        ints = ints[:MAX_INTERACTIONS]
        counts = {"all": len(ints), **{k: sum(1 for x in ints if x["channel_code"] == k) for k in (c["CHANNEL_CODE"] for c in u.refs.channels)}}
        tier = u.refs.tier(p["tier_code"])
        out.append({
            "hcp_id": p["hcp_id"], "role_type": p["role_type"], "degree": p.get("degree"), "name": p["name"],
            "display_name": p["display_name"], "account_name": p.get("account_name"), "city": p.get("city"),
            "zip": p.get("zip"), "is_primary": p["hcp_id"] == primary["hcp_id"], "segment_code": p.get("segment_code"),
            "stats": {"hs_patients": p["hs_patients"], "povo_patients": p["povo_patients"], "decile": p["decile"],
                      "tier_name": tier["TIER_NAME"] if tier else "Not in call plan", "rank": p["_hs_rank"],
                      "rank_of": len(u.list), "povo_discussions": p["_discussions"],
                      "last_call_date": p["last_call_date"]},
            "bullets": _bullets(u, p, primary, latest.get(p["hcp_id"]), notes.get(p["hcp_id"])),
            "interactions": ints, "interaction_counts": counts})
    return {"primary_hcp_id": primary["hcp_id"], "preselected_participant_ids": pre, "participants": out}
