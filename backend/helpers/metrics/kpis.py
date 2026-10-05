"""KPI cards: goal, achieved, on-track status and the patient split (POC kpiCards / metric / period).

Two cards, in REF_KPI_METRIC order: Patient Enrollment Forms and Total Patients
Receiving POVO. The math, from the POC's final `metric()`:

  * goal     = sum of the monthly goals in the period. Month and quarter are the
               calendar month / quarter; Year to Date runs from the data-start
               month (the current month minus three) to 12/31, so its goal is
               never below the quarter's
  * achieved = actuals from the data start up to today, inside the period
  * due      = goals of fully elapsed months in the period
               + current month's goal x (working days elapsed / working days
               in the month), elapsed counting today
  * status   = no_goal when the period has no goal, else On Track when
               achieved >= round(due) (JavaScript rounding: halves go up)
  * pct      = round(achieved / goal x 100)
  * remaining working days = working days strictly after today up to the
               period end

The patients card also carries the "Total on POVO" split:

  * Paid NRx   = patients with a paid fill in the period: new patients in the
                 period + continuing patients (new patients from the data start
                 to the period start x PAID_PERSISTENCE)
  * Bridge NRx / Free Trial NRx = patients on POVO while coverage is pending,
                 point in time (today): PENDING_ON_THERAPY of the PEFs that have
                 not turned into a paid patient yet, split BRIDGE_SHARE to the
                 bridge program; the rest of those PEFs dropped off, so PEFs
                 always stay above patients (every patient has a PEF)
  * Total on POVO = Paid + Bridge + Free Trial; the three shares are rounded
                 with largest remainder so they add up to 100%

The three rates come from REF_KPI_PARAMETER. If any is missing the card has no
split (the View more panel is hidden) rather than showing made-up numbers.

Pure functions over monthly series so the tests can check them against
hand-computed values without a warehouse.
"""
from __future__ import annotations

from datetime import date, timedelta

from helpers.dates import (MONS, MONTHS, WorkCalendar, data_start, js_round, month_end, month_list, pct,
                           spread_lr)

PERIODS = ("month", "quarter", "ytd")
YM = tuple[int, int]

#: REF_KPI_PARAMETER codes the patient split needs.
SPLIT_PARAMETERS = ("PAID_PERSISTENCE", "PENDING_ON_THERAPY", "BRIDGE_SHARE")
PATIENTS_CODE = "NEW_PATIENTS"


def _range_label(first: YM, last: YM) -> str:
    if first[0] == last[0]:
        return f"{MONS[first[1] - 1]} – {MONS[last[1] - 1]}"
    return f"{MONS[first[1] - 1]} {first[0]} – {MONS[last[1] - 1]} {last[0]}"


def period_window(period: str, today: date) -> dict:
    if period == "month":
        months: list[YM] = [(today.year, today.month)]
        start, end = date(today.year, today.month, 1), month_end(today.year, today.month)
        label = MONTHS[today.month - 1]
    elif period == "quarter":
        qs = today.month - (today.month - 1) % 3
        months = [(today.year, qs), (today.year, qs + 1), (today.year, qs + 2)]
        start, end = date(today.year, qs, 1), month_end(today.year, qs + 2)
        label = _range_label(months[0], months[-1])
    else:
        start, end = data_start(today), date(today.year, 12, 31)
        months = month_list(start, end)
        label = _range_label(months[0], months[-1])
    return {"months": months, "start": start, "end": end, "label": label}


def metric(goals: dict[YM, int], actuals: dict[YM, int], months: list[YM], today: date,
           cal: WorkCalendar) -> dict:
    cur = (today.year, today.month)
    m_start = date(today.year, today.month, 1)
    m_all = cal.work_in(m_start, month_end(today.year, today.month))
    fr = cal.work_in(m_start, today) / m_all if m_all else 1.0
    goal = act = 0
    due = 0.0
    for ym in months:
        goal += goals.get(ym, 0)
        if ym < cur:
            act += actuals.get(ym, 0)
            due += goals.get(ym, 0)
        elif ym == cur:
            act += actuals.get(ym, 0)
            due += goals.get(ym, 0) * fr
    status = "no_goal" if goal <= 0 else ("on_track" if act >= js_round(due) else "at_risk")
    return {"goal": goal, "achieved": act, "yet_to_achieve": max(0, goal - act),
            "pct_achieved": pct(act, goal), "due_to_date": js_round(due), "status": status}


def monthly_series(td, today: date, metrics: list[dict]) -> tuple[dict[str, dict[YM, int]], dict[str, dict[YM, int]]]:
    """(goals, actuals) per metric code, keyed by (year, month).

    `metrics` are REF_KPI_METRIC rows: METRIC_CODE keys the goals, EVENT_TYPE says
    which FCT_POVO_ACTIVITY events count as the actual. Only activity from the
    data start to today is counted.
    """
    start = data_start(today)
    goals: dict[str, dict[YM, int]] = {m["METRIC_CODE"]: {} for m in metrics}
    for g in td.goals:
        code, ym = g["METRIC_CODE"], (int(g["GOAL_YEAR"]), int(g["GOAL_MONTH"]))
        if code in goals and 1 <= ym[1] <= 12 and ym >= (start.year, start.month):
            goals[code][ym] = goals[code].get(ym, 0) + int(g["GOAL_VALUE"] or 0)
    actuals: dict[str, dict[YM, int]] = {m["METRIC_CODE"]: {} for m in metrics}
    by_event = {m["EVENT_TYPE"]: m["METRIC_CODE"] for m in metrics}
    for a in td.activity:
        d, code = a["EVENT_DATE"], by_event.get(a["EVENT_TYPE"])
        if code and d and start <= d <= today:
            ym = (d.year, d.month)
            actuals[code][ym] = actuals[code].get(ym, 0) + 1
    return goals, actuals


def event_count(td, event_type: str, start: date, end: date) -> int:
    return sum(1 for a in td.activity if a["EVENT_TYPE"] == event_type and a["EVENT_DATE"]
               and start <= a["EVENT_DATE"] <= end)


def patient_split(td, win: dict, today: date, params: dict[str, float]) -> dict:
    """Total on POVO = Paid NRx (new + continuing) + Bridge NRx + Free Trial NRx."""
    start = data_start(today)
    period_start = max(win["start"], start)
    new = event_count(td, "NEW_PATIENT", period_start, today)
    before = event_count(td, "NEW_PATIENT", start, period_start - timedelta(days=1))
    continuing = js_round(before * params["PAID_PERSISTENCE"])
    paid = new + continuing
    pefs = event_count(td, "PEF", start, today)
    patients = event_count(td, "NEW_PATIENT", start, today)
    pending = js_round(max(0, pefs - patients) * params["PENDING_ON_THERAPY"])
    bridge = js_round(pending * params["BRIDGE_SHARE"])
    free_trial = pending - bridge
    total = paid + bridge + free_trial
    shares = spread_lr(100, [paid, bridge, free_trial])
    return {"total": total, "paid": paid, "bridge": bridge, "free_trial": free_trial,
            "paid_pct": shares[0], "bridge_pct": shares[1], "free_trial_pct": shares[2],
            "new_patients": new, "continuing_patients": continuing, "as_of": today}


def kpis(td, period: str, today: date, cal: WorkCalendar, metrics: list[dict],
         params: dict[str, float]) -> dict:
    """KPI cards in REF_KPI_METRIC order; titles and units come from that table."""
    win = period_window(period, today)
    goals, actuals = monthly_series(td, today, metrics)
    cards = []
    for ref in metrics:
        code = ref["METRIC_CODE"]
        card = {"metric_code": code, "title": ref["TITLE"], "unit": ref["UNIT"],
                **metric(goals[code], actuals[code], win["months"], today, cal)}
        if code == PATIENTS_CODE and all(k in params for k in SPLIT_PARAMETERS):
            card["split"] = patient_split(td, win, today, params)
        cards.append(card)
    return {"period": period, "period_label": win["label"], "period_start": win["start"],
            "period_end": win["end"], "remaining_working_days": cal.work_after(today, win["end"]),
            "data_start": data_start(today), "cards": cards}
