"""New POVO writers by month or week, split JAK vs non-JAK (POC chartStack).

A new writer is a POVO Target whose FIRST `NEW_PATIENT` event (first paid
script) falls in the bucket. JAK Inhibitor Utilizer = JAK_PATIENTS > 0.

  * month: January to the current month; the current month is partial.
  * week:  the last 12 weeks, each ending on a Friday (Saturday to Friday, so
           no day falls between buckets). The last week ends on the Friday on
           or after today and is partial when that Friday is still ahead.
"""
from __future__ import annotations

from datetime import date, timedelta

from helpers.dates import MONS, month_end


def first_writes(u, today: date) -> list[tuple[date, bool]]:
    first: dict[str, date] = {}
    for a in u.td.activity:
        d = a["EVENT_DATE"]
        if a["EVENT_TYPE"] == "NEW_PATIENT" and d and d <= today and a["HCP_ID"] in u.targets:
            if a["HCP_ID"] not in first or d < first[a["HCP_ID"]]:
                first[a["HCP_ID"]] = d
    return [(d, u.targets[h]["jak_patients"] > 0) for h, d in first.items()]


def new_writers(u, grain: str, today: date) -> dict:
    events = first_writes(u, today)
    buckets = []
    if grain == "week":
        friday = today + timedelta(days=(4 - today.weekday()) % 7)
        for i in range(11, -1, -1):
            end = friday - timedelta(weeks=i)
            start = end - timedelta(days=6)
            shown_end = min(end, today)
            buckets.append({"label": f"{shown_end.month}/{shown_end.day}", "start_date": start,
                            "end_date": shown_end, "is_partial": end > today})
        range_label, axis = "last 12 weeks", f"Week ending Friday, {today.year}"
    else:
        for m in range(1, today.month + 1):
            end = month_end(today.year, m)
            buckets.append({"label": MONS[m - 1], "start_date": date(today.year, m, 1),
                            "end_date": min(end, today), "is_partial": end > today})
        range_label, axis = f"{MONS[0]}–{MONS[today.month - 1]} {today.year}", f"Month, {today.year}"
    for b in buckets:
        inside = [jak for d, jak in events if b["start_date"] <= d <= b["end_date"]]
        b["jak_writers"] = sum(1 for j in inside if j)
        b["non_jak_writers"] = sum(1 for j in inside if not j)
    total = sum(b["jak_writers"] + b["non_jak_writers"] for b in buckets)
    return {"grain": grain, "total": total, "range_label": range_label, "x_axis_label": axis,
            "buckets": buckets}
