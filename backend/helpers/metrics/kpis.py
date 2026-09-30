"""KPI cards: goal, achieved, on-track status (POC kpiCards / metric / period).

The math, from the POC's final `metric()`:

  * goal     = sum of the monthly goals in the period (a quarter or YTD goal is
               the sum of its months; YTD uses the FULL-year goal, ends 12/31)
  * achieved = actuals of months up to and including the current month
  * due      = goals of fully elapsed months in the period
               + current month's goal x (working days elapsed / working days
               in the month), elapsed counting today
  * On Track = achieved >= round(due)   (JavaScript rounding: halves go up)
  * pct      = round(achieved / goal x 100)
  * remaining working days = working days strictly after today up to the
               period end

Pure functions over monthly arrays so the tests can check them against
hand-computed values without a warehouse.
"""
from __future__ import annotations

from datetime import date

from helpers.dates import MONS, MONTHS, WorkCalendar, js_round, month_end, pct

PERIODS = ("month", "quarter", "ytd")


def period_window(period: str, today: date) -> dict:
    mi = today.month - 1
    if period == "month":
        months = [mi]
        start, end = date(today.year, today.month, 1), month_end(today.year, today.month)
        label = MONTHS[mi]
    elif period == "quarter":
        qs = mi - mi % 3
        months = [qs, qs + 1, qs + 2]
        start, end = date(today.year, qs + 1, 1), month_end(today.year, qs + 3)
        label = f"{MONS[qs]} – {MONS[qs + 2]}"
    else:
        months = list(range(12))
        start, end = date(today.year, 1, 1), date(today.year, 12, 31)
        label = f"{MONS[0]} – {MONS[11]}"
    return {"months": months, "start": start, "end": end, "label": label}


def metric(goals: list[int], actuals: list[int], months: list[int], today: date, cal: WorkCalendar) -> dict:
    mi = today.month - 1
    m_start = date(today.year, today.month, 1)
    m_all = cal.work_in(m_start, month_end(today.year, today.month))
    fr = cal.work_in(m_start, today) / m_all if m_all else 1.0
    goal = act = 0
    due = 0.0
    for m in months:
        goal += goals[m]
        if m < mi:
            act += actuals[m]
            due += goals[m]
        elif m == mi:
            act += actuals[m]
            due += goals[m] * fr
    return {"goal": goal, "achieved": act, "yet_to_achieve": max(0, goal - act),
            "pct_achieved": pct(act, goal), "due_to_date": js_round(due),
            "status": "on_track" if act >= js_round(due) else "at_risk"}


def monthly_series(td, today: date, metrics: list[dict]) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    """(goals, actuals) per metric code, 12 months of the current year.

    `metrics` are REF_KPI_METRIC rows: METRIC_CODE keys the goals, EVENT_TYPE says
    which FCT_POVO_ACTIVITY events count as the actual. Activity after today is
    never counted.
    """
    goals = {m["METRIC_CODE"]: [0] * 12 for m in metrics}
    for g in td.goals:
        if int(g["GOAL_YEAR"]) == today.year and g["METRIC_CODE"] in goals and 1 <= int(g["GOAL_MONTH"]) <= 12:
            goals[g["METRIC_CODE"]][int(g["GOAL_MONTH"]) - 1] += int(g["GOAL_VALUE"] or 0)
    actuals = {m["METRIC_CODE"]: [0] * 12 for m in metrics}
    by_event = {m["EVENT_TYPE"]: m["METRIC_CODE"] for m in metrics}
    for a in td.activity:
        d, code = a["EVENT_DATE"], by_event.get(a["EVENT_TYPE"])
        if code and d and d.year == today.year and d <= today:
            actuals[code][d.month - 1] += 1
    return goals, actuals


def kpis(td, period: str, today: date, cal: WorkCalendar, metrics: list[dict]) -> dict:
    """KPI cards in REF_KPI_METRIC order; titles and units come from that table."""
    win = period_window(period, today)
    goals, actuals = monthly_series(td, today, metrics)
    cards = []
    for ref in metrics:
        code = ref["METRIC_CODE"]
        m = metric(goals[code], actuals[code], win["months"], today, cal)
        cards.append({"metric_code": code, "title": ref["TITLE"], "unit": ref["UNIT"], **m})
    return {"period": period, "period_label": win["label"], "period_start": win["start"],
            "period_end": win["end"], "remaining_working_days": cal.work_after(today, win["end"]),
            "cards": cards}
