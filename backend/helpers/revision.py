"""Next-call revision of the talking points (POC applyRevision + rankNext, Step 3_63).

Input: the participant's current lists per category (the points still to
deliver, in order, then the points delivered on earlier calls), the answered
assessments of the call, and optional objection states from the LLM. Output:
the revised lists, the banner line per category, the next best action and the
post-call history line.

Each list is "fresh points first, then delivered points":

  * Delivered: every point of the shown top 3 that was raised on the call
    moves to the "Delivered on earlier calls" history with the call date and
    its reception (Not Well / Moderately / Well Received; objections: Still
    Open / Resolved / Discussed). A delivered point the rep marked Reinforce
    and raised again gets the new date and "Reinforced · <reception>".
    Delivered order: well received first, then moderately received, then not
    well received or still open (stable).
  * Next call, messaging and closings (client call 10/01/2026), ranked:
      1. follow-ups of well-received points ("Builds on well received")
      2. one unused point in a well-received theme
      3. follow-ups of moderately received points ("Builds on moderate")
      4. other unused points, then new points from the pool ("New")
    A theme with a not-well-received message (and no well-received one) is
    never suggested again. The top 3 are kept.
  * Next call, objections: the objections not raised move up, in order.

A follow-up's text is the point's NEXT_CALL_TEMPLATE (closings: the
well-received or the other variant); its POINT_ID is the original id plus
"~F" (closings "~F2" / "~F1"), so it never collides with an assessed point.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from helpers.content.library import Library
from helpers.content.select import initial_points, item, next_call_text, pool_points

TP_SHOW = 3
DOT = "·"
RATE = ("Not Well Received", "Moderately Received", "Well Received")
STILL_OPEN, RESOLVED, DISCUSSED, REINFORCED = "Still Open", "Resolved", "Discussed", "Reinforced"
TAG_WELL, TAG_MOD, TAG_NEW = "Builds on well received", "Builds on moderate", "New"
#: Messaging themes: a not-well-received point closes its whole theme for the next call.
THEME = {"Efficacy": "eff", "Lesions and pain": "eff", "Disease progression": "eff", "Safety": "saf",
         "Dosing": "saf", "Mechanism": "mech", "Access": "acc"}

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


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _theme(x: dict) -> Optional[str]:
    p = x.get("pillar")
    return THEME.get(p, "seg") if p else None


def _fresh(x: dict) -> dict:
    return {**x, "tags": [], "previous_text": None, "previous_rank": None, "delivered": False,
            "delivered_date": None, "reception": None, "label": None, "is_open": False}


def _reception(category: str, answer: dict, llm_state: Optional[str]) -> tuple[str, Optional[int], bool]:
    """(label, reception 0-2 or None, still open) for one answered point."""
    if category == "objection":
        st = {"open": "open", "resolved": "res"}.get(llm_state or "", objection_state(answer.get("note")))
        label = STILL_OPEN if st == "open" else (RESOLVED if st == "res" else DISCUSSED)
        return label, None, st == "open"
    v = answer.get("reception")
    return (RATE[v] if v in (0, 1, 2) else ""), (v if v in (0, 1, 2) else None), False


def _delivered(x: dict, category: str, day: date, label: str, rc: Optional[int], is_open: bool) -> dict:
    return {**_fresh(x), "detail": x.get("detail") if category == "objection" else None, "delivered": True,
            "delivered_date": day.isoformat(), "reception": rc, "label": label, "is_open": is_open}


def _group(x: dict) -> int:
    """Delivered order: well received (and resolved) first, then moderate, then not well or still open."""
    return 2 if x.get("reception") == 0 or x.get("is_open") else (1 if x.get("reception") == 1 else 0)


def rank_next(lib: Library, ctx: dict, category: str, delivered: list[dict], fresh: list[dict],
              current: list[dict], day_mdy: str) -> list[dict]:
    """The top 3 points for the next call (POC rankNext)."""
    msg = category == "messaging"
    seen_text = {x["text"] for x in current}
    seen_ids = {x["point_id"] for x in current}
    bad, good = set(), set()
    for x in delivered:
        th = _theme(x) if msg else None
        if th and x.get("reception") == 0:
            bad.add(th)
        elif th and x.get("reception") == 2:
            good.add(th)
    cands: list[tuple[float, int, dict, str]] = []

    def add(x: Optional[dict], score: float, tag: str) -> None:
        if not x or not x.get("text") or x["text"] in seen_text or x["point_id"] in seen_ids:
            return
        th = _theme(x) if msg else None
        if th and th in bad and th not in good:
            return
        seen_text.add(x["text"])
        seen_ids.add(x["point_id"])
        cands.append((score, len(cands), x, tag))

    for x in delivered:
        rc = x.get("reception")
        if rc not in (1, 2):
            continue
        well = rc == 2
        text = next_call_text(lib, x["point_id"], ctx, well_received=well and not msg)
        if not text:
            continue
        if msg:
            follow = item(f"{x['point_id']}~F", x.get("pillar"), text,
                          f"Builds on the {x.get('pillar') or 'earlier'} message, "
                          f"{'well' if well else 'moderately'} received on {day_mdy}")
        else:
            follow = item(f"{x['point_id']}~F{rc}", None, text, None)
        add(follow, 0 if well else 2, TAG_WELL if well else TAG_MOD)

    picked_good = 0

    def theme_score(x: dict) -> float:
        nonlocal picked_good
        th = _theme(x) if msg else None
        if th and th in good:
            picked_good += 1
            return 1 if picked_good == 1 else 2.5
        return 3

    for x in fresh:
        seen_text.discard(x["text"])
        seen_ids.discard(x["point_id"])
        add(x, theme_score(x), "")
    if msg:
        pool = pool_points(lib, ctx)
    else:
        pool = [item(f"{c['point_id']}~F2", None, t, None)
                for c in initial_points(lib, category, ctx)
                if (t := next_call_text(lib, c["point_id"], ctx, well_received=True))]
    for x in pool:
        add(x, theme_score(x), TAG_NEW)
    cands.sort(key=lambda c: (c[0], c[1]))
    return [{**_fresh(x), "tags": [tag] if tag else []} for _s, _n, x, tag in cands[:TP_SHOW]]


def revise(lib: Library, ctx: dict, lists: dict[str, list[dict]], answers: dict[str, dict[str, dict]],
           call_date: date, call_date_mdy: str, llm_states: Optional[dict[str, str]] = None) -> dict:
    """answers[category][point_id] = {"reception": 0|1|2|None, "note": str} for RAISED points only."""
    llm_states = llm_states or {}
    stats = {c: {"dl": 0, "well": 0, "open": 0, "res": 0} for c in lists}
    agreed = ""
    out: dict[str, list[dict]] = {}
    fresh_count: dict[str, int] = {}
    for cat, current in lists.items():
        cur = [x for x in current if not x.get("delivered")]
        old = [x for x in current if x.get("delivered")]
        n = min(TP_SHOW, len(cur))
        delivered, fresh = [], []
        for j, x in enumerate(cur):
            a = answers.get(cat, {}).get(x["point_id"]) if j < n else None
            if a is None:
                fresh.append(_fresh(x))
                continue
            label, rc, is_open = _reception(cat, a, llm_states.get(x["point_id"]))
            st = stats[cat]
            st["dl"] += 1
            st["well"] += rc == 2
            st["open"] += is_open
            st["res"] += label == RESOLVED
            if cat == "closing" and rc == 2 and not agreed:
                agreed = (a.get("note") or "").strip()
            delivered.append(_delivered(x, cat, call_date, label, rc, is_open))
        if cat != "objection":
            fresh = rank_next(lib, ctx, cat, delivered, fresh, current, call_date_mdy)
        again = []
        for x in old:
            a = answers.get(cat, {}).get(x["point_id"])
            if a is None:
                again.append(x)
                continue
            label, rc, is_open = _reception(cat, a, llm_states.get(x["point_id"]))
            again.append({**x, "delivered_date": call_date.isoformat(), "is_open": is_open,
                          "reception": rc if cat != "objection" else x.get("reception"),
                          "label": f"{REINFORCED} {DOT} {label}" if label else REINFORCED})
        ordered = sorted(enumerate(delivered + again), key=lambda e: (_group(e[1]), e[0]))
        out[cat] = fresh + [x for _i, x in ordered]
        fresh_count[cat] = min(TP_SHOW, len(fresh))

    # ---- banner, next best action, history line -------------------------------
    m_first = next((x for x in out.get("messaging", []) if not x.get("delivered")), None)
    p0 = (m_first or {}).get("pillar")
    seg_name = ctx["values"].get("segment_short_name")
    lead = "the first message" if not p0 else (f"the {p0} message" if p0 == seg_name else p0.lower())
    parts = [f"lead with {lead}"]
    if any(x.get("delivered") and x.get("is_open") and x.get("delivered_date") == call_date.isoformat()
           for x in out.get("objection", [])):
        parts.append("answer the open objection")
    if agreed:
        parts.append("confirm the agreed next step")
    nba = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
    nba = nba[0].upper() + nba[1:]
    sep = f" {DOT} "
    nouns = {"messaging": "messages", "objection": "objections", "closing": "closings"}

    def banner(cat: str) -> str:
        st = stats.get(cat) or {"dl": 0, "well": 0, "open": 0}
        bits = [f"{st['dl']} delivered"]
        if cat == "objection":
            if st["open"]:
                bits.append(f"{st['open']} still open")
        elif st["well"]:
            bits.append(f"{st['well']} well received")
        bits.append(f"{fresh_count.get(cat, 0)} new {nouns[cat]} for the next call")
        return sep.join(bits)

    m, o, c = (stats.get(k, {"dl": 0, "well": 0, "open": 0}) for k in ("messaging", "objection", "closing"))
    hist = (f"{m['well']} of {m['dl']} messages well received, {o['open']} "
            f"{_plural(o['open'], 'objection', 'objections')} still open, {c['well']} "
            f"{_plural(c['well'], 'closing', 'closings')} well received")
    return {"lists": out, "summaries": {cat: banner(cat) for cat in lists}, "next_best_action": nba,
            "history_line": hist,
            "counts": {"m_well": m["well"], "o_open": o["open"], "o_res": o.get("res", 0), "c_well": c["well"]}}
