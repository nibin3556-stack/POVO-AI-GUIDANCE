"""Next-call revision of the talking points (POC applyRevision, final version).

Input: the participant's current full lists (five points per category, in the
order shown), the answered assessments of the call, and optional objection
states from the LLM. Output: the revised lists with tags, the banner text per
category, the next best action and the post-call history line.

Messaging (only points that were raised and rated count):
  * Well received      -> Retained ("Retained · well received")
  * Moderately         -> Changed: the next-call variant; the note becomes the
                          insight "From the {date} call: ..."
  * Not well received  -> the FIRST one is Removed and replaced by the peer
                          message ("New · replaces a removed message"); later
                          ones are Changed
  Reordered: removed/new first, then changed, retained, untouched. Every point
  that moved gets "▲/▼ was #n"; a moved retained or untouched point is
  "Reordered".
Objections: a note reads "open" (not resolved / still concerned / push back /
  concerns) or "resolved" (resolved / agreed / addressed / comfortable ...);
  open first, untouched next, resolved last.
Closings: a rated closing becomes its well-received or other next-call
  variant ("New"); then up to 2 untouched closings in the top 3 are replaced by
  the extra AI closings ("New AI suggestion").

Two guards the single-revision POC never needed: the peer message and an extra
closing are never inserted twice into the same list (a second revision could
otherwise duplicate a POINT_ID, which is part of the assessment key).
"""
from __future__ import annotations

import re
from typing import Optional

from helpers.content.library import Library
from helpers.content.render import render
from helpers.content.select import item, next_call_text, variant_rows

TP_SHOW = 3
UP, DOWN, DOT = "▲", "▼", "·"

RE_OPEN = re.compile(r"\b(not|isn't|wasn't|no longer)\s+(resolved|convinced|comfortable|satisfied|sure|agreed)|"
                     r"\bstill\s+(open|concerned|worried|unsure|hesitant)|\bunresolved\b|\bpush(ed)? back\b|"
                     r"\bconcerns?\b", re.I)
RE_RES = re.compile(r"\b(resolved|agreed|addressed|comfortable|satisfied|clear now|answered|accepted|ok with|"
                    r"fine with|convinced|no (more )?concerns?)\b", re.I)


def objection_state(note: Optional[str]) -> str:
    """'' (no note), 'open' or 'res' (POC objState)."""
    t = (note or "").strip()
    if not t:
        return ""
    if RE_OPEN.search(t):
        return "open"
    return "res" if RE_RES.search(t) else "open"


def _trim_note(nt: str) -> str:
    if len(nt) > 60:
        return re.sub(r"\s+\S*$", "", nt[:58]) + "…"
    return nt


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def revise(lib: Library, ctx: dict, lists: dict[str, list[dict]], answers: dict[str, dict[str, dict]],
           call_date_mdy: str, llm_states: Optional[dict[str, str]] = None) -> dict:
    """answers[category][point_id] = {"reception": 0|1|2|None, "note": str} for RAISED points only."""
    role = ctx["person"]["role_type"]
    llm_states = llm_states or {}
    fresh = lambda x: {**x, "tags": [], "previous_text": None, "previous_rank": None}  # noqa: E731

    # ---- messaging -----------------------------------------------------------
    peer_row = next(iter(variant_rows(lib, "messaging", "peer", role)), None)
    has_peer = any(x["point_id"] == (peer_row or {}).get("POINT_ID") for x in lists["messaging"])
    used, m_well, ms = False, 0, []
    for j, x in enumerate(lists["messaging"]):
        a = answers["messaging"].get(x["point_id"]) if j < TP_SHOW else None
        v = a.get("reception") if a else None
        nt = ((a or {}).get("note") or "").strip()
        base = fresh(x)
        if v == 2:
            m_well += 1
            ms.append((2, j, "Retained", {**base, "tags": [f"Retained {DOT} well received"]}))
        elif v == 1:
            ms.append((1, j, "Changed", {**base, "text": next_call_text(lib, x["point_id"], ctx) or x["text"],
                                          "previous_text": x["text"],
                                          "detail": f"From the {call_date_mdy} call: {_trim_note(nt)}" if nt
                                          else x["detail"], "tags": ["Changed"]}))
        elif v == 0 and not used and peer_row is not None and not has_peer:
            used = True
            vals = {**ctx["values"], "call_date": call_date_mdy}
            ms.append((0, j, "Removed", item(peer_row["POINT_ID"], peer_row.get("PILLAR"),
                                             render(peer_row["TEXT_TEMPLATE"], vals, ctx["flags"]),
                                             render(peer_row.get("DETAIL_TEMPLATE"), vals, ctx["flags"]),
                                             previous_text=x["text"],
                                             tags=[f"New {DOT} replaces a removed message"], removed=True)))
        elif v == 0:
            ms.append((1, j, "Changed", {**base, "text": next_call_text(lib, x["point_id"], ctx) or x["text"],
                                          "previous_text": x["text"], "tags": ["Changed"]}))
        else:
            ms.append((3, j, "", base))
    ms.sort(key=lambda e: (e[0], e[1]))
    cnt: dict[str, int] = {}
    m_out = []
    for n, (g, j, st, x) in enumerate(ms):
        x["previous_rank"] = j + 1
        if n != j and st != "Removed":
            x["tags"] = [t for t in x["tags"]] or []
            if st in ("Retained", ""):
                st = "Reordered"
                if not x["tags"]:
                    x["tags"] = ["Reordered"]
            x["tags"].append(f"{UP if n < j else DOWN} was #{j + 1}")
        if st and n < TP_SHOW:
            cnt[st] = cnt.get(st, 0) + 1
        x["_st"] = st
        m_out.append(x)

    # ---- objections ----------------------------------------------------------
    o_open = o_res = moved = 0
    os_ = []
    for j, x in enumerate(lists["objection"]):
        a = answers["objection"].get(x["point_id"]) if j < TP_SHOW else None
        s = ""
        if a is not None:
            llm = llm_states.get(x["point_id"])
            s = {"open": "open", "resolved": "res"}.get(llm or "", objection_state(a.get("note")))
        o_open += s == "open"
        o_res += s == "res"
        tag = [f"Still open {DOT} address first"] if s == "open" else (["Resolved last call"] if s == "res" else [])
        os_.append(({"open": 0, "res": 2}.get(s, 1), j, {**fresh(x), "tags": tag, "_state": s}))
    os_.sort(key=lambda e: (e[0], e[1]))
    o_out = []
    for n, (g, j, x) in enumerate(os_):
        x["previous_rank"] = j + 1
        if n != j:
            x["tags"] = x["tags"] + [f"{UP if n < j else DOWN} was #{j + 1}"]
        if n < j and n < TP_SHOW:
            moved += 1
        o_out.append(x)

    # ---- closings ------------------------------------------------------------
    c_new = c_well = 0
    agreed = ""
    c_out = []
    for j, x in enumerate(lists["closing"]):
        a = answers["closing"].get(x["point_id"]) if j < TP_SHOW else None
        v = a.get("reception") if a else None
        if v is None or x.get("ai"):
            c_out.append({**fresh(x), "previous_rank": j + 1})
            continue
        c_new += 1
        nt = (a.get("note") or "").strip()
        if v == 2:
            c_well += 1
            agreed = agreed or nt
        c_out.append({**fresh(x), "text": next_call_text(lib, x["point_id"], ctx, well_received=v == 2) or x["text"],
                      "previous_text": x["text"], "previous_rank": j + 1, "tags": ["New"]})
    flags = set(ctx["flags"])
    if o_open:
        flags.add("open_objections")
    if used:
        flags.add("low_reception")
    vals = {**ctx["values"], "call_date": call_date_mdy}
    present = {x["point_id"] for x in c_out}
    ext = [item(r["POINT_ID"], None, render(r["TEXT_TEMPLATE"], vals, flags), None)
           for r in variant_rows(lib, "closing", "extra", role)][:2]
    ai_n = 0
    for j in range(min(len(c_out), TP_SHOW) - 1, -1, -1):
        if ai_n >= 2:
            break
        x = c_out[j]
        if x["tags"] or x.get("ai"):
            continue
        pick = next((e for e in ([ext[1 - ai_n]] if 1 - ai_n < len(ext) else []) + ext
                     if e["point_id"] not in present), None)
        if pick is None:
            break
        present.add(pick["point_id"])
        c_out[j] = {**pick, "previous_text": x["text"], "previous_rank": j + 1, "ai": True,
                    "tags": ["New AI suggestion"]}
        ai_n += 1

    # ---- banner, next best action, history line -------------------------------
    saf_chg = any(x.get("pillar") == "Safety" and x["_st"] == "Changed" for x in m_out)
    parts = ["open with safety" if saf_chg else f"lead with {(m_out[0].get('pillar') or 'messaging').lower()}"]
    if o_out and o_out[0].get("_state") == "open":
        parts.append("clear the open objection first")
    if agreed:
        parts.append("confirm the agreed next step")
    nba = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
    nba = nba[0].upper() + nba[1:]
    bm = [f"{cnt[s]} {s.lower()}" for s in ("Retained", "Changed", "Reordered", "Removed") if cnt.get(s)]
    bo = ([f"{moved} {_plural(moved, 'objection', 'objections')} moved up"] if moved else []) + \
         ([f"{o_res} resolved"] if o_res else [])
    bc = ([f"{c_new} new {_plural(c_new, 'closing', 'closings')}"] if c_new else []) + \
         ([f"{ai_n} replaced with AI {_plural(ai_n, 'suggestion', 'suggestions')}"] if ai_n else [])
    sep = f" {DOT} "
    shown_m = min(TP_SHOW, len(lists["messaging"]))
    hist = (f"{m_well} of {shown_m} messages well received, {o_open} {_plural(o_open, 'objection', 'objections')} "
            f"still open, {c_well} {_plural(c_well, 'closing', 'closings')} well received")
    for lst in (m_out, o_out):
        for x in lst:
            x.pop("_st", None)
            x.pop("_state", None)
    for x in m_out:
        x.pop("removed", None)
    return {"lists": {"messaging": m_out, "objection": o_out, "closing": c_out},
            "summaries": {"messaging": sep.join(bm), "objection": sep.join(bo), "closing": sep.join(bc)},
            "next_best_action": nba, "history_line": hist,
            "counts": {"m_well": m_well, "o_open": o_open, "o_res": o_res, "c_well": c_well}}
