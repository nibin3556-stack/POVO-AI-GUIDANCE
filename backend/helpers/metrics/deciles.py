"""POVO Targets by decile, D10 to D2, grouped into the call-plan tiers.

The POC shows execution, reach and productivity per TIER in the decile tooltip
(tierStats). The contract puts them on each decile row, and the real data
supports that granularity, so they are computed per decile here with the POC's
formulas:

  * planned calls to date = round(round(targets x calls/yr x reach goal %) x
                            share of the year's working days elapsed)
  * execution %           = rep calls this year / planned calls to date
  * reach %               = targets called this year / targets
  * early_reach_count     = targets whose first call this year came before
                            March 1 (the POC's "first 60 days")
  * productivity          = NRx this year per 10 calls, 1 decimal
"""
from __future__ import annotations

from datetime import date

from helpers.dates import js_round, pct
from helpers.metrics.segmentation import called_this_year


def decile_stats(u, today: date, cal) -> dict:
    year_start = date(today.year, 1, 1)
    early = date(today.year, 3, 1)
    elapsed = cal.work_in(year_start, today) / max(1, cal.work_in(year_start, date(today.year, 12, 31)))
    nrx_by_hcp: dict[str, int] = {}
    for a in u.td.activity:
        if a["EVENT_TYPE"] == "NRX" and a["EVENT_DATE"] and year_start <= a["EVENT_DATE"] <= today:
            nrx_by_hcp[a["HCP_ID"]] = nrx_by_hcp.get(a["HCP_ID"], 0) + 1
    rows = []
    for dec in range(10, 1, -1):
        m = [t for t in u.list if t["decile"] == dec]
        tier = u.refs.tier_for_decile(dec)
        writers = sum(1 for t in m if t["povo_patients"] > 0)
        calls = sum(sum(1 for d in t["_rep_dates"] if year_start <= d <= today) for t in m)
        plan_yr = js_round(len(m) * (tier["CALLS_PER_YEAR"] if tier else 0)
                           * (tier["REACH_GOAL_PCT"] if tier else 0) / 100)
        plan_td = js_round(plan_yr * elapsed)
        reached = [t for t in m if called_this_year(t, today)]
        nrx = sum(nrx_by_hcp.get(t["hcp_id"], 0) for t in m)
        rows.append({
            "decile": dec, "tier_code": tier["TIER_CODE"] if tier else None, "targets": len(m),
            "writers": writers, "yet_to_write": len(m) - writers,
            "hs_patients": sum(t["hs_patients"] for t in m),
            "execution_pct": pct(calls, plan_td), "reach_pct": pct(len(reached), len(m)),
            "early_reach_count": sum(1 for t in reached
                                     if min(d for d in t["_rep_dates"] if d >= year_start) < early),
            "productivity": round(js_round(nrx / calls * 100) / 10, 1) if calls else 0.0,
        })
    tiers = []
    for t in u.refs.tiers:
        m = [x for x in u.list if t["DECILE_MIN"] <= x["decile"] <= t["DECILE_MAX"]]
        tiers.append({"tier_code": t["TIER_CODE"], "tier_name": t["TIER_NAME"], "decile_min": t["DECILE_MIN"],
                      "decile_max": t["DECILE_MAX"], "calls_per_year": t["CALLS_PER_YEAR"],
                      "reach_goal_pct": t["REACH_GOAL_PCT"], "targets": len(m),
                      "writers": sum(1 for x in m if x["povo_patients"] > 0)})
    sh = [x for x in u.list if x["tier_code"] == "SH"]
    return {"rows": rows, "tiers": tiers, "super_high_total": len(sh),
            "super_high_not_writing": sum(1 for x in sh if x["povo_patients"] <= 0)}
