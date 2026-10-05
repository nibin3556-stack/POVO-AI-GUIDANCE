"""New POVO writers by month or week, split by HS treatment segment (POC chartStack, Step 3_63).

A new writer is a POVO Target whose FIRST `NEW_PATIENT` event (first paid
script) falls in the data window and in the bucket. Each writer is counted in
their Target Segmentation group, so the stacks add up to the donut's writers.

  * month: the current month plus the three before it (the data window); the
           current month is partial.
  * week:  the current week plus the five before it, each ending on a Friday
           (Saturday to Friday, so no day falls between buckets). The last week
           ends on the Friday on or after today and is partial when that Friday
           is still ahead.
"""
from __future__ import annotations

from datetime import date, timedelta

from helpers.dates import MONS, data_start, month_end, month_list

WEEKS_SHOWN = 6


def first_writes(u, today: date) -> list[tuple[date, str]]:
    start = data_start(today)
    first: dict[str, date] = {}
    for a in u.td.activity:
        d = a["EVENT_DATE"]
        if a["EVENT_TYPE"] == "NEW_PATIENT" and d and d <= today and a["HCP_ID"] in u.targets:
            if a["HCP_ID"] not in first or d < first[a["HCP_ID"]]:
                first[a["HCP_ID"]] = d
    return [(d, u.targets[h]["segment_code"]) for h, d in first.items() if d >= start]


def _md(d: date) -> str:
    return f"{MONS[d.month - 1]} {d.day}"


def new_writers(u, grain: str, today: date) -> dict:
    events = first_writes(u, today)
    codes = [s["SEGMENT_CODE"] for s in u.refs.segments]
    buckets = []
    if grain == "week":
        friday = today + timedelta(days=(4 - today.weekday()) % 7)
        for i in range(WEEKS_SHOWN - 1, -1, -1):
            end = friday - timedelta(weeks=i)
            start = end - timedelta(days=6)
            shown_end = min(end, today)
            buckets.append({"label": f"{shown_end.month}/{shown_end.day}", "start_date": start,
                            "end_date": shown_end, "is_partial": end > today})
        range_label = f"last {WEEKS_SHOWN} weeks, {_md(buckets[0]['start_date'])} – {_md(today)}"
        axis = f"Week ending Friday, {today.year}"
    else:
        start = data_start(today)
        for y, m in month_list(start, today):
            end = month_end(y, m)
            buckets.append({"label": MONS[m - 1], "start_date": date(y, m, 1), "end_date": min(end, today),
                            "is_partial": end > today})
        range_label = f"{_md(start)} – {_md(today)}, {today.year}"
        axis = f"Month, {today.year}"
    for b in buckets:
        inside = [seg for d, seg in events if b["start_date"] <= d <= b["end_date"]]
        b["segments"] = {c: sum(1 for s in inside if s == c) for c in codes}
        b["total"] = len(inside)
    total = sum(b["total"] for b in buckets)
    return {"grain": grain, "total": total, "range_label": range_label, "x_axis_label": axis,
            "segment_codes": codes, "buckets": buckets}
