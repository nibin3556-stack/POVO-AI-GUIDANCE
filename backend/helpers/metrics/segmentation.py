"""Target segmentation donut and segment statistics (POC segStats / tipDonut).

Over ALL POVO Targets (deciles 1-10):

  * trial %       = targets who wrote POVO / targets in the segment
  * penetration % = POVO patients / HS patients
  * adoption %    = writers with 3+ POVO patients / writers
  * reach %       = in-plan targets called this year / in-plan targets
"""
from __future__ import annotations

from datetime import date

from helpers.dates import pct


def called_this_year(t: dict, today: date) -> bool:
    """Reach: at least one rep call between Jan 1 and today (POC `!t.nc`)."""
    start = date(today.year, 1, 1)
    return any(start <= d <= today for d in t["_rep_dates"])


def segment_stats(u, today: date) -> dict:
    total = len(u.list)
    writers_all = sum(1 for t in u.list if t["povo_patients"] > 0)
    segments = []
    for s in u.refs.segments:
        code = s["SEGMENT_CODE"]
        m = [t for t in u.list if t["segment_code"] == code]
        w = [t for t in m if t["povo_patients"] > 0]
        plan = [t for t in m if t["is_in_call_plan"]]
        segments.append({
            "segment_code": code, "short_name": s["SHORT_NAME"], "full_name": s["FULL_NAME"],
            "description": s["DESCRIPTION"], "color_hex": s["COLOR_HEX"], "hcp_count": len(m),
            "pct": pct(len(m), total), "trial_pct": pct(len(w), len(m)),
            "penetration_pct": pct(sum(t["povo_patients"] for t in m), sum(t["hs_patients"] for t in m)),
            "adoption_pct": pct(sum(1 for t in w if t["povo_patients"] >= 3), len(w)),
            "reach_pct": pct(sum(1 for t in plan if called_this_year(t, today)), len(plan)),
            "_writers": len(w),
        })
    return {"total_targets": total, "not_writing": total - writers_all, "segments": segments}


def public(stats: dict) -> dict:
    return {**stats, "segments": [{k: v for k, v in s.items() if not k.startswith("_")}
                                  for s in stats["segments"]]}
