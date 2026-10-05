"""AI Guidance panel: missed opportunities, strong performance, recommended focus.

Ported from the POC's final aiGuide() / focusTargets():

  * missed: Super High or Medium targets called before but not for more than
    21 days, longest gap first (then HS volume), top 2
  * super_high_not_writing: Super High targets with no POVO patient
  * best_segment: highest trial % (ties keep the segment order)
  * top_writer: the physician with the most POVO patients (HS volume breaks
    the tie for who is named first); `ties` names every physician tied for it
  * super_high_reach_pct: Super High targets called in the data window
  * focus: Super High / Medium PHYSICIANS scored
        hs x (povo > 0 ? 1 : 1.6) x (1 + days since last call / 30)
    where a target never called counts as 60 days; top 3
"""
from __future__ import annotations

from datetime import date

from helpers.dates import pct
from helpers.metrics.segmentation import called_in_window, segment_stats


def _days(t: dict, today: date):
    return (today - t["last_call_date"]).days if t["last_call_date"] else None


def _brief(t: dict) -> dict:
    return {"hcp_id": t["hcp_id"], "name": t["name"], "display_name": t["display_name"],
            "role_type": t["role_type"], "tier_code": t["tier_code"]}


def focus_targets(u, today: date) -> list[dict]:
    out = []
    for t in u.list:
        if t["tier_code"] in ("SH", "MED") and t["role_type"] == "HCP":
            ds = _days(t, today)
            ds = 60 if ds is None else ds
            score = t["hs_patients"] * (1 if t["povo_patients"] else 1.6) * (1 + ds / 30)
            out.append((score, ds, t))
    out.sort(key=lambda x: -x[0])  # stable: equal scores keep the HS order
    return [{"t": t, "ds": ds, "score": s} for s, ds, t in out]


def guidance(u, today: date) -> dict:
    tier_names = {t["TIER_CODE"]: t["TIER_NAME"] for t in u.refs.tiers}
    gap = [t for t in u.list if t["tier_code"] in ("SH", "MED") and t["last_call_date"]
           and _days(t, today) > 21]
    gap.sort(key=lambda t: (-_days(t, today), -t["hs_patients"]))
    sh = [t for t in u.list if t["tier_code"] == "SH"]
    stats = segment_stats(u, today)["segments"]
    best = max(stats, key=lambda s: s["trial_pct"]) if stats else None  # max keeps the first on ties
    hcps = sorted((t for t in u.list if t["role_type"] == "HCP"),
                  key=lambda t: (-t["povo_patients"], -t["hs_patients"]))
    top = hcps[0] if hcps else None
    ties = [t["display_name"] for t in hcps if top and t["povo_patients"] == top["povo_patients"]]
    focus = []
    for f in focus_targets(u, today)[:3]:
        t = f["t"]
        povo = f"{t['povo_patients']} POVO patients" if t["povo_patients"] else "not writing POVO"
        focus.append({**_brief(t), "score": round(f["score"], 1),
                      "reason": f"{tier_names.get(t['tier_code'], '')} · {t['hs_patients']} HS patients "
                                f"· {povo} · {f['ds']} days since the last call"})
    return {
        "missed": [{**_brief(t), "days_since_call": _days(t, today)} for t in gap[:2]],
        "super_high_not_writing": sum(1 for t in sh if t["povo_patients"] <= 0),
        "strong": {
            "best_segment": {"segment_code": best["segment_code"], "short_name": best["short_name"],
                             "trial_pct": best["trial_pct"]} if best else None,
            "top_writer": {"hcp_id": top["hcp_id"], "display_name": top["display_name"],
                           "povo_patients": top["povo_patients"], "ties": ties}
            if top and top["povo_patients"] > 0 else None,
            "super_high_reach_pct": pct(sum(1 for t in sh if called_in_window(t, today)), len(sh)),
        },
        "focus": focus,
    }
