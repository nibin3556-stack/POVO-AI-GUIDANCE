"""Target – HS Treatment Segmentation donut and its funnel tooltip (POC segStats / tipDonut).

Over all POVO Targets (D10 to D2), per segment:

  * hcp_count / pct  = targets in the segment; the three shares are rounded with
                       largest remainder so they always add up to 100%
  * funnel           = Targets > Reached (called at least once in the data
                       window) > Writing (Trial) > 3+ POVO patients (Adoption);
                       each step is also shown as a % of the segment's targets
  * trial %          = writers / targets
  * adoption %       = writers with 3+ POVO patients / writers (kept for the API)
  * penetration %    = POVO patients / HS patients, with both counts
  * reach %          = in-plan targets reached / in-plan targets
"""
from __future__ import annotations

from datetime import date

from helpers.dates import data_start, pct, spread_lr


def called_in_window(t: dict, today: date) -> bool:
    """Reach: at least one rep call between the data start and today (POC `!t.nc`)."""
    start = data_start(today)
    return any(start <= d <= today for d in t["_rep_dates"])


def segment_stats(u, today: date) -> dict:
    total = len(u.list)
    writers_all = sum(1 for t in u.list if t["povo_patients"] > 0)
    members = {s["SEGMENT_CODE"]: [t for t in u.list if t["segment_code"] == s["SEGMENT_CODE"]]
               for s in u.refs.segments}
    shares = dict(zip(members, spread_lr(100, [len(m) for m in members.values()])))
    segments = []
    for s in u.refs.segments:
        code = s["SEGMENT_CODE"]
        m = members[code]
        w = [t for t in m if t["povo_patients"] > 0]
        plan = [t for t in m if t["is_in_call_plan"]]
        reached = [t for t in m if called_in_window(t, today)]
        adopters = [t for t in w if t["povo_patients"] >= 3]
        povo, hs = sum(t["povo_patients"] for t in m), sum(t["hs_patients"] for t in m)
        segments.append({
            "segment_code": code, "short_name": s["SHORT_NAME"], "full_name": s["FULL_NAME"],
            "description": s["DESCRIPTION"], "color_hex": s["COLOR_HEX"], "hcp_count": len(m),
            "pct": shares[code] if total else 0, "trial_pct": pct(len(w), len(m)),
            "penetration_pct": pct(povo, hs), "adoption_pct": pct(len(adopters), len(w)),
            "reach_pct": pct(sum(1 for t in plan if called_in_window(t, today)), len(plan)),
            "funnel": {"reached": len(reached), "reached_pct": pct(len(reached), len(m)),
                       "writers": len(w), "writers_pct": pct(len(w), len(m)),
                       "adopters": len(adopters), "adopters_pct": pct(len(adopters), len(m)),
                       "povo_patients": povo, "hs_patients": hs},
            "_writers": len(w),
        })
    return {"total_targets": total, "not_writing": total - writers_all, "segments": segments}


def public(stats: dict) -> dict:
    return {**stats, "segments": [{k: v for k, v in s.items() if not k.startswith("_")}
                                  for s in stats["segments"]]}
