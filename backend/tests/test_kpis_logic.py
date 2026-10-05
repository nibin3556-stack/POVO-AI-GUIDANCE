"""KPI math against hand-computed values (the POC's Portland numbers, today 10/13/2026).

Data window: Jul 1 to today. October 2026: 22 working days (no holiday), 9
elapsed through Tue 10/13 (Oct 1-2, 5-9, 12-13). Remaining after 10/13:
October 13, November 20 (Thanksgiving 11/26 off), December 22 (Christmas 12/25 off).
"""
from datetime import date, timedelta
from types import SimpleNamespace

from helpers.dates import WorkCalendar, data_start, default_holidays, js_round, month_list, pct, spread_lr
from helpers.metrics.kpis import metric, patient_split, period_window

TODAY = date(2026, 10, 13)
CAL = WorkCalendar(default_holidays(2026))
# POC Step 3_63 Portland: goals Jul-Dec, new patients Jul-Oct (October to date).
GOAL = dict(zip(month_list(date(2026, 7, 1), date(2026, 12, 1)), [8, 12, 15, 17, 18, 19]))
PTS = dict(zip(month_list(date(2026, 7, 1), date(2026, 10, 1)), [6, 10, 13, 6]))


def test_js_round_pct_and_spread():
    assert js_round(2.5) == 3 and js_round(6.954) == 7 and js_round(-0.5) == 0
    assert pct(5, 17) == 29 and pct(1, 0) == 0
    assert spread_lr(100, [31, 5, 4]) == [78, 12, 10] and sum(spread_lr(100, [1, 1, 1])) == 100


def test_data_window():
    assert data_start(TODAY) == date(2026, 7, 1)
    assert data_start(date(2027, 2, 10)) == date(2026, 11, 1)
    assert month_list(date(2026, 11, 1), date(2027, 2, 10)) == [(2026, 11), (2026, 12), (2027, 1), (2027, 2)]


def test_poc_holidays_2026():
    assert date(2026, 7, 3) in CAL.holidays and date(2026, 11, 26) in CAL.holidays
    assert len(default_holidays(2026)) == 8


def test_working_days():
    assert CAL.work_in(date(2026, 10, 1), date(2026, 10, 31)) == 22
    assert CAL.work_in(date(2026, 10, 1), TODAY) == 9
    assert CAL.work_after(TODAY, date(2026, 10, 31)) == 13
    assert CAL.work_after(TODAY, date(2026, 12, 31)) == 55


def test_month_card():
    m = metric(GOAL, PTS, period_window("month", TODAY)["months"], TODAY, CAL)
    # due = 17 x 9/22 = 6.95 -> 7; 6 < 7
    assert m == {"goal": 17, "achieved": 6, "yet_to_achieve": 11, "pct_achieved": 35, "due_to_date": 7,
                 "status": "at_risk"}


def test_quarter_card():
    w = period_window("quarter", TODAY)
    assert w["label"] == "Oct – Dec" and w["end"] == date(2026, 12, 31)
    m = metric(GOAL, PTS, w["months"], TODAY, CAL)
    assert (m["goal"], m["achieved"], m["due_to_date"], m["pct_achieved"], m["status"]) == (54, 6, 7, 11, "at_risk")


def test_ytd_card_runs_from_the_data_start():
    w = period_window("ytd", TODAY)
    assert w["label"] == "Jul – Dec" and w["start"] == date(2026, 7, 1)
    m = metric(GOAL, PTS, w["months"], TODAY, CAL)
    # goal = 89 (Jul-Dec); due = 35 (Jul-Sep goals) + 6.95 = 41.95 -> 42
    assert (m["goal"], m["achieved"], m["due_to_date"], m["pct_achieved"], m["status"]) == (89, 35, 42, 39, "at_risk")
    assert period_window("ytd", date(2027, 2, 10))["label"] == "Nov 2026 – Dec 2027"


def test_on_track_at_the_rounded_boundary_and_no_goal():
    oct_ = (2026, 10)
    assert metric(GOAL, {**PTS, oct_: 7}, [oct_], TODAY, CAL)["status"] == "on_track"
    assert metric(GOAL, {**PTS, oct_: 6}, [oct_], TODAY, CAL)["status"] == "at_risk"
    assert metric({}, PTS, [oct_], TODAY, CAL)["status"] == "no_goal"


def _activity():
    """35 new patients (6 / 10 / 13 / 6 by month) and 48 PEFs, all inside the window."""
    rows, firsts = [], {7: 6, 8: 10, 9: 13, 10: 6}
    for month, n in firsts.items():
        for i in range(n):
            rows.append({"EVENT_TYPE": "NEW_PATIENT", "EVENT_DATE": date(2026, month, 1) + timedelta(days=i % 9)})
    rows += [{"EVENT_TYPE": "PEF", "EVENT_DATE": date(2026, 7, 1) + timedelta(days=i * 2)} for i in range(48)]
    return SimpleNamespace(activity=rows)


def test_patient_split_month_and_ytd():
    td = _activity()
    month = patient_split(td, period_window("month", TODAY), TODAY)
    # paid = 6 new + round(29 x 0.85) = 6 + 25; pending = round(13 x 0.7) = 9 -> bridge 5, free trial 4
    assert (month["new_patients"], month["continuing_patients"], month["paid"]) == (6, 25, 31)
    assert (month["bridge"], month["free_trial"], month["total"]) == (5, 4, 40)
    assert (month["paid_pct"], month["bridge_pct"], month["free_trial_pct"]) == (78, 12, 10)
    ytd = patient_split(td, period_window("ytd", TODAY), TODAY)
    assert (ytd["paid"], ytd["continuing_patients"], ytd["total"]) == (35, 0, 44)
