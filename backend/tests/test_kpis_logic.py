"""KPI math against hand-computed values (the POC's Portland numbers, today 10/13/2026).

October 2026: 22 working days (no holiday), 9 elapsed through Tue 10/13
(Oct 1-2, 5-9, 12-13). Remaining after 10/13: October 13, November 20
(Thanksgiving 11/26 off), December 22 (Christmas 12/25 off).
"""
from datetime import date

from helpers.dates import WorkCalendar, default_holidays, js_round, pct
from helpers.metrics.kpis import metric, period_window

GOAL = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
PTS = [6, 8, 9, 11, 10, 12, 13, 14, 13, 5, 0, 0]
TODAY = date(2026, 10, 13)
CAL = WorkCalendar(default_holidays(2026))


def test_js_round_and_pct():
    assert js_round(2.5) == 3 and js_round(6.954) == 7 and js_round(-0.5) == 0
    assert pct(5, 17) == 29 and pct(1, 0) == 0


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
    # due = 17 x 9/22 = 6.95 -> 7; 5 < 7
    assert m == {"goal": 17, "achieved": 5, "yet_to_achieve": 12, "pct_achieved": 29, "due_to_date": 7,
                 "status": "at_risk"}


def test_quarter_card():
    w = period_window("quarter", TODAY)
    assert w["label"] == "Oct – Dec" and w["end"] == date(2026, 12, 31)
    m = metric(GOAL, PTS, w["months"], TODAY, CAL)
    assert (m["goal"], m["achieved"], m["due_to_date"], m["pct_achieved"], m["status"]) == (54, 5, 7, 9, "at_risk")


def test_ytd_card():
    w = period_window("ytd", TODAY)
    assert w["label"] == "Jan – Dec"
    m = metric(GOAL, PTS, w["months"], TODAY, CAL)
    # due = 108 (Jan-Sep goals) + 6.95 = 114.95 -> 115
    assert (m["goal"], m["achieved"], m["due_to_date"], m["pct_achieved"], m["status"]) == (162, 101, 115, 62, "at_risk")


def test_on_track_at_the_rounded_boundary():
    pts = PTS[:9] + [7, 0, 0]  # exactly round(due) this month
    assert metric(GOAL, pts, [9], TODAY, CAL)["status"] == "on_track"
    pts = PTS[:9] + [6, 0, 0]
    assert metric(GOAL, pts, [9], TODAY, CAL)["status"] == "at_risk"
