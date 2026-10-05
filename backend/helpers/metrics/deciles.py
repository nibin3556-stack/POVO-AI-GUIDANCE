"""POVO Targets by decile, D10 to D2, grouped into the call-plan tiers.

Engagement-tool definitions (POC decStats, Step 3_63), over the data window
(data start to today):

  * reach %            = targets called at least once / targets in the decile;
                         goal = the tier's reach goal
  * avg frequency      = rep calls / targets reached (1 decimal, null when none
                         was reached); goal to date = the tier's calls a year x
                         the share of the working year the window covers
  * new POVO writers   = targets with a POVO patient
  * avg HS patients    = HS patients (last 12 months) per HCP in the decile

The chart view keeps writers vs yet to write; the table view (the default on
screen) shows HCPs, new POVO writers, reach and average frequency against goal.
"""
from __future__ import annotations

from datetime import date

from helpers.dates import data_start, js_round, pct
from helpers.metrics.segmentation import called_in_window

DECILES = range(10, 1, -1)


def _one_decimal(x: float) -> float:
    return js_round(x * 10) / 10


def elapsed_share(today: date, cal) -> float:
    """Working days from the data start to today / working days in the year."""
    year = cal.work_in(date(today.year, 1, 1), date(today.year, 12, 31))
    return cal.work_in(data_start(today), today) / year if year else 0.0


def decile_stats(u, today: date, cal) -> dict:
    start = data_start(today)
    el = elapsed_share(today, cal)
    rows = []
    for dec in DECILES:
        m = [t for t in u.list if t["decile"] == dec]
        tier = u.refs.tier_for_decile(dec)
        writers = sum(1 for t in m if t["povo_patients"] > 0)
        calls = sum(sum(1 for d in t["_rep_dates"] if start <= d <= today) for t in m)
        reached = sum(1 for t in m if called_in_window(t, today))
        hs = sum(t["hs_patients"] for t in m)
        per_year = tier["CALLS_PER_YEAR"] if tier else 0
        rows.append({
            "decile": dec, "tier_code": tier["TIER_CODE"] if tier else None, "targets": len(m),
            "writers": writers, "yet_to_write": len(m) - writers, "hs_patients": hs,
            "avg_hs_patients": js_round(hs / len(m)) if m else 0,
            "reached": reached, "reach_pct": pct(reached, len(m)),
            "reach_goal_pct": tier["REACH_GOAL_PCT"] if tier else 0,
            "calls": calls, "avg_frequency": _one_decimal(calls / reached) if reached else None,
            "frequency_goal": _one_decimal(per_year * el),
        })
    tiers = []
    for t in u.refs.tiers:
        m = [x for x in u.list if t["DECILE_MIN"] <= x["decile"] <= t["DECILE_MAX"]]
        tiers.append({"tier_code": t["TIER_CODE"], "tier_name": t["TIER_NAME"], "decile_min": t["DECILE_MIN"],
                      "decile_max": t["DECILE_MAX"], "calls_per_year": t["CALLS_PER_YEAR"],
                      "reach_goal_pct": t["REACH_GOAL_PCT"], "targets": len(m),
                      "writers": sum(1 for x in m if x["povo_patients"] > 0),
                      "frequency_goal": _one_decimal(t["CALLS_PER_YEAR"] * el)})
    sh = [x for x in u.list if x["tier_code"] == "SH"]
    return {"rows": rows, "tiers": tiers, "elapsed_pct": js_round(el * 100), "data_start": start,
            "super_high_total": len(sh), "super_high_not_writing": sum(1 for x in sh if x["povo_patients"] <= 0)}
