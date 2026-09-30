"""Dates, working days and the small numeric helpers the POC math relies on.

"Today" is the real current date in APP_TIMEZONE (America/New_York by
default), not the server's clock zone: a Posit VM in UTC would otherwise flip
to tomorrow at 8 pm Eastern. POVO_TODAY_OVERRIDE pins it for tests and demos.

Working days are weekdays minus US holidays (REF_US_HOLIDAY). If that table is
empty, the POC's own holiday set is computed (the 8 federal holidays the POC
lists, with weekend observance), so KPI math never silently counts a holiday.
"""
from __future__ import annotations

import calendar
import math
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from core.config import get_settings

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
          "September", "October", "November", "December"]
MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def today() -> date:
    s = get_settings()
    if s.povo_today_override:
        return s.povo_today_override
    return datetime.now(ZoneInfo(s.app_timezone)).date()


def now_utc() -> datetime:
    """Naive UTC timestamp: Delta TIMESTAMP columns are stored as UTC."""
    return datetime.now(UTC).replace(microsecond=0, tzinfo=None)


def js_round(x: float) -> int:
    """JavaScript Math.round: halves go UP (Python's round() goes to even).

    Every rounded figure in the POC (due-to-date, percentages) uses Math.round;
    round(2.5) == 2 in Python would flip an On Track chip at the boundary.
    """
    return int(math.floor(x + 0.5))


def pct(a: float, b: float) -> int:
    """POC pct(): rounded percentage, 0 when the base is 0."""
    return js_round(a / b * 100) if b else 0


# --- holidays ---------------------------------------------------------------
def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def _last_weekday(year: int, month: int, weekday: int) -> date:
    d = date(year, month, calendar.monthrange(year, month)[1])
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _observed(d: date) -> date:
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


def default_holidays(year: int) -> set[date]:
    """The POC's holiday set (HOL): 8 federal holidays, observed dates."""
    return {
        _observed(date(year, 1, 1)),
        _nth_weekday(year, 1, 0, 3),      # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),      # Presidents' Day
        _last_weekday(year, 5, 0),        # Memorial Day
        _observed(date(year, 7, 4)),      # Independence Day (2026: Fri 07/03)
        _nth_weekday(year, 9, 0, 1),      # Labor Day
        _nth_weekday(year, 11, 3, 4),     # Thanksgiving
        _observed(date(year, 12, 25)),    # Christmas
    }


class WorkCalendar:
    """Working-day arithmetic over a fixed holiday set (POC isWork/workIn/workAfter)."""

    def __init__(self, holidays: set[date] | None, years: tuple[int, ...] = ()) -> None:
        hol = set(holidays or ())
        for y in years:
            if not any(h.year == y for h in hol):
                hol |= default_holidays(y)
        self.holidays = hol

    def is_work(self, d: date) -> bool:
        return d.weekday() < 5 and d not in self.holidays

    def work_in(self, a: date, b: date) -> int:
        """Working days from a to b, both inclusive (POC workIn)."""
        n, c = 0, a
        while c <= b:
            if self.is_work(c):
                n += 1
            c += timedelta(days=1)
        return n

    def work_after(self, a: date, b: date) -> int:
        """Working days strictly after a, up to b inclusive (POC workAfter)."""
        return self.work_in(a + timedelta(days=1), b)


def month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def fmt_mdy(d: date) -> str:
    """POC fmt(): 10/13/2026."""
    return f"{d.month:02d}/{d.day:02d}/{d.year}"


def fmt_long(d: date) -> str:
    """POC longD(): Oct 13, 2026."""
    return f"{MONS[d.month - 1]} {d.day}, {d.year}"


def fmt_short(d: date) -> str:
    """POC shortD(): Sep 12."""
    return f"{MONS[d.month - 1]} {d.day}"
