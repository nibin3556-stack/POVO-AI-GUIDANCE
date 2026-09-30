"""Point selection: which approved points a participant gets, in which order.

The POC hard-coded five points per category per audience (tpFor, objKeys,
extraClosings, peerMsg). Here the same choices come from the content tables:

  * messaging / closing: active `initial` rows whose AUDIENCE is the role (or
    ALL) and SEGMENT_CODE the target's segment (or ALL). Rows sharing a
    SORT_ORDER are alternatives for one slot; the most specific row wins
    (segment-specific over ALL, audience-specific over ALL).
  * objections: the REF_OBJECTION_RULE row that matches audience, segment,
    decile range and writer state with the LOWEST priority lists the ordered
    POINT_IDs; each text opens with the POC's rotating opener.
  * extra closings and the peer message: `extra` / `peer` variant rows.

Everything the templates need about the person is built once in
`participant_context()`: display values plus the boolean flags the template
conditions test.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from helpers.content.library import Library
from helpers.content.render import render
from helpers.dates import fmt_long, fmt_mdy, fmt_short
from helpers.targets import Universe, display_name

CATEGORIES = ("messaging", "objection", "closing")
LABELS = {"messaging": "Suggested Messaging", "objection": "Potential Objections",
          "closing": "Suggested Closing Statements"}
#: POC OPEN[]: the objection opener rotates with the position in the list.
OPENERS = ["Expect {n} to", "Be ready for {n} to", "Be advised that {n} may", "Prepare for {n} to",
           "Watch for {n} to"]


def person(u: Universe, hcp_id: str) -> Optional[dict]:
    """The target row, or a minimal one for an in-territory HCP outside the plan."""
    t = u.get(hcp_id)
    if t is not None:
        return t
    h = u.td.hcps.get(hcp_id)
    if h is None:
        return None
    m = u.td.metrics.get(hcp_id, {})
    acc = u.td.accounts.get(h.get("ACCOUNT_ID") or "", {})
    dates = u.rep_dates.get(hcp_id, [])
    return {"hcp_id": hcp_id, "name": f"{h.get('LAST_NAME')}, {h.get('FIRST_NAME')}",
            "display_name": display_name(h), "role_type": h.get("ROLE_TYPE") or "HCP",
            "degree": h.get("DEGREE"), "specialty": h.get("SPECIALTY"), "account_id": h.get("ACCOUNT_ID"),
            "account_name": acc.get("ACCOUNT_NAME"), "city": h.get("CITY"), "state": h.get("STATE"),
            "zip": h.get("ZIP"), "competitive_focus": None, "segment_code": "conv", "decile": 1,
            "tier_code": None, "is_in_call_plan": False, "hs_patients": int(m.get("HS_PATIENTS_12M") or 0),
            "jak_patients": int(m.get("JAK_PATIENTS") or 0), "povo_patients": int(m.get("POVO_PATIENTS") or 0),
            "last_call_date": dates[-1] if dates else None, "parent_hcp_id": h.get("PARENT_HCP_ID"),
            "is_must_win": False, "_hs_rank": 0, "_visits": m.get("HS_VISITS_PER_MONTH"),
            "_incyte": int(m.get("INCYTECARES_ENROLLED_PATIENTS") or 0), "_rep_dates": dates,
            "_discussions": u.discussions.get(hcp_id, 0)}


def latest_interaction(u: Universe, hcp_id: str, channel: str) -> Optional[date]:
    ds = [i["INTERACTION_DATE"] for i in u.td.interactions
          if i["HCP_ID"] == hcp_id and i.get("CHANNEL_CODE") == channel and i.get("INTERACTION_DATE")]
    return max(ds) if ds else None


def participant_context(u: Universe, p: dict, primary: dict, call_date: date) -> dict:
    """Template values and flags for one participant (physician data for NP/PA office context)."""
    msl = latest_interaction(u, primary["hcp_id"], "msl")
    spkr = latest_interaction(u, primary["hcp_id"], "spkr")
    adfa = latest_interaction(u, primary["hcp_id"], "adfa")
    focus = p.get("competitive_focus")
    values = {
        "display_name": p["display_name"], "physician_display_name": primary["display_name"],
        "account_name": p.get("account_name") or "", "hs_patients": p["hs_patients"],
        "hs_not_on_povo": max(0, p["hs_patients"] - p["povo_patients"]), "povo_patients": p["povo_patients"],
        "jak_patients": p["jak_patients"], "decile": p["decile"], "rank": p["_hs_rank"],
        "rank_of": len(u.list), "focus_label": u.refs.focus_label(focus),
        "segment_short_name": u.refs.segment(p.get("segment_code"))["SHORT_NAME"],
        "msl_date_short": fmt_short(msl) if msl else "", "speaker_date_short": fmt_short(spkr) if spkr else "",
        "adfa_date_short": fmt_short(adfa) if adfa else "",
        "call_date": fmt_mdy(call_date), "call_date_long": fmt_long(call_date),
    }
    flags = set()
    if p["povo_patients"] > 0:
        flags.add("is_writer")
    if p["povo_patients"] == 1:
        flags.add("povo_one")
    if focus == "jak":
        flags.add("is_jak_focus")
        if p["jak_patients"] == 1:
            flags.add("jak_one")
    if msl:
        flags.add("has_msl_visit")
    if spkr:
        flags.add("has_speaker_program")
    if adfa:
        flags.add("has_adfa_visit")
    if not p["last_call_date"]:
        flags.add("never_called")
    return {"values": values, "flags": flags, "person": p, "primary": primary}


def item(point_id: str, pillar, text, detail, **extra) -> dict:
    return {"point_id": point_id, "pillar": pillar, "text": text, "detail": detail, "tags": [],
            "previous_text": None, "previous_rank": None, "ai": False, **extra}


def _slots(lib: Library, category: str, role: str, segment: Optional[str]) -> list[dict]:
    best: dict[int, tuple[int, dict]] = {}
    for r in lib.points.values():
        if r["CATEGORY"] != category or r["VARIANT"] != "initial":
            continue
        aud, seg = r.get("AUDIENCE") or "ALL", r.get("SEGMENT_CODE") or "ALL"
        if aud not in (role, "ALL") or seg not in (segment, "ALL"):
            continue
        score = (2 if seg != "ALL" else 0) + (1 if aud != "ALL" else 0)
        slot = int(r.get("SORT_ORDER") or 0)
        if slot not in best or score > best[slot][0]:
            best[slot] = (score, r)
    return [best[k][1] for k in sorted(best)]


def objection_ids(lib: Library, role: str, segment: Optional[str], decile: int, writer: bool) -> list[str]:
    state = "writer" if writer else "non_writer"
    for r in lib.objection_rules:
        if (r.get("AUDIENCE") in (role, "ALL") and r.get("SEGMENT_CODE") in (segment, "ALL")
                and int(r.get("MIN_DECILE") or 1) <= decile <= int(r.get("MAX_DECILE") or 10)
                and r.get("WRITER_STATE") in (state, "ALL")):
            return [x.strip() for x in str(r["OBJECTION_POINT_IDS"]).split(",") if x.strip()]
    return []


def initial_points(lib: Library, category: str, ctx: dict) -> list[dict]:
    """The full ordered list (five points) before any AI ordering or revision."""
    p = ctx["person"]
    role, seg, vals, flags = p["role_type"], p.get("segment_code"), ctx["values"], ctx["flags"]
    if category == "objection":
        out = []
        for i, pid in enumerate(objection_ids(lib, role, seg, p["decile"], p["povo_patients"] > 0)):
            r = lib.point(pid)
            if r is None:
                continue
            v = {**vals, "opener": OPENERS[i % len(OPENERS)].format(n=vals["display_name"])}
            out.append(item(pid, None, render(r["TEXT_TEMPLATE"], v, flags),
                            render(r.get("DETAIL_TEMPLATE"), v, flags)))
        return out
    out = []
    for r in _slots(lib, category, role, seg):
        detail = render(r.get("DETAIL_TEMPLATE"), vals, flags) if category == "messaging" else None
        out.append(item(r["POINT_ID"], r.get("PILLAR") if category == "messaging" else None,
                        render(r["TEXT_TEMPLATE"], vals, flags), detail))
    return out


def next_call_text(lib: Library, point_id: str, ctx: dict, well_received: bool = False) -> Optional[str]:
    r = lib.point(point_id)
    if r is None or not r.get("NEXT_CALL_TEMPLATE"):
        return None
    flags = set(ctx["flags"]) | ({"well_received"} if well_received else set())
    return render(r["NEXT_CALL_TEMPLATE"], ctx["values"], flags)


def variant_rows(lib: Library, category: str, variant: str, role: str) -> list[dict]:
    rows = [r for r in lib.points.values() if r["CATEGORY"] == category and r["VARIANT"] == variant
            and (r.get("AUDIENCE") or "ALL") in (role, "ALL")]
    return sorted(rows, key=lambda r: int(r.get("SORT_ORDER") or 0))
