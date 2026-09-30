"""Bronze data, loaded once per territory and kept in memory for a while.

The data per territory is small (about 140 targets, a few thousand activity
and interaction rows), and every screen needs most of it, so each territory is
read in a handful of territory-filtered SELECTs and cached in-process for
BRONZE_CACHE_SECONDS. All metric math then runs in Python (helpers/metrics).

Reference tables shared by every territory (employees, tiers, segments, focus
labels, holidays) are cached once under the same TTL.

App tables (calls, revisions) are NOT cached here: they change on every
assessment and are read fresh by the code that needs them.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from core.config import get_settings
from database.tables import bronze
from database.warehouse import get_warehouse, to_date
from helpers.dates import WorkCalendar, today


@dataclass
class Refs:
    employees: list[dict]
    territories: dict[str, dict]
    tiers: list[dict]
    segments: list[dict]
    focus: list[dict]
    holidays: set[date]
    kpi_metrics: list[dict]
    channels: list[dict]

    def tier(self, code: Optional[str]) -> Optional[dict]:
        return next((t for t in self.tiers if t["TIER_CODE"] == code), None)

    def tier_for_decile(self, decile: Optional[int]) -> Optional[dict]:
        if decile is None:
            return None
        return next((t for t in self.tiers if t["DECILE_MIN"] <= decile <= t["DECILE_MAX"]), None)

    def segment(self, code: Optional[str]) -> dict:
        return next((s for s in self.segments if s["SEGMENT_CODE"] == code),
                    {"SEGMENT_CODE": code, "SHORT_NAME": code or "", "FULL_NAME": code or "",
                     "DESCRIPTION": "", "COLOR_HEX": "#64748B", "ARCHETYPE_NAME": "", "ARCHETYPE_DESC": "",
                     "SORT_ORDER": 99})

    def channel(self, code: Optional[str]) -> dict:
        """REF_INTERACTION_CHANNEL row; an unknown code shows as itself rather than failing."""
        return next((c for c in self.channels if c["CHANNEL_CODE"] == code),
                    {"CHANNEL_CODE": code, "TYPE_LABEL": code or "", "TEAM_LABEL": code or ""})

    def focus_label(self, code: Optional[str]) -> str:
        f = next((f for f in self.focus if f["FOCUS_CODE"] == code), None)
        return f["LABEL"] if f else (code or "")

    def calendar(self, *years: int) -> WorkCalendar:
        return WorkCalendar(self.holidays, years)


@dataclass
class TerritoryData:
    territory_id: str
    territory: dict
    plan_year: int
    hcps: dict[str, dict]
    accounts: dict[str, dict]
    metrics: dict[str, dict]
    plan: dict[str, dict]
    interactions: list[dict]
    activity: list[dict]
    goals: list[dict]
    loaded_at: float = field(default_factory=time.time)


_lock = threading.Lock()
_refs: tuple[float, Optional[Refs]] = (0.0, None)
_territories: dict[str, TerritoryData] = {}


def _ttl() -> int:
    return get_settings().bronze_cache_seconds


def clear_cache() -> None:
    global _refs
    with _lock:
        _refs = (0.0, None)
        _territories.clear()


def get_refs() -> Refs:
    global _refs
    loaded, value = _refs
    if value is not None and time.time() - loaded < _ttl():
        return value
    wh = get_warehouse()
    emps = wh.query(f"SELECT * FROM {bronze('DIM_EMPLOYEE')}")
    terrs = {t["TERRITORY_ID"]: t for t in wh.query(f"SELECT * FROM {bronze('DIM_TERRITORY')}")}
    tiers = sorted(wh.query(f"SELECT * FROM {bronze('REF_TIER')}"), key=lambda r: r.get("SORT_ORDER") or 0)
    segs = sorted(wh.query(f"SELECT * FROM {bronze('REF_SEGMENT')}"), key=lambda r: r.get("SORT_ORDER") or 0)
    focus = sorted(wh.query(f"SELECT * FROM {bronze('REF_COMPETITIVE_FOCUS')}"),
                   key=lambda r: r.get("SORT_ORDER") or 0)
    hol = {to_date(r["HOLIDAY_DATE"]) for r in wh.query(f"SELECT HOLIDAY_DATE FROM {bronze('REF_US_HOLIDAY')}")}
    kpi = sorted(wh.query(f"SELECT * FROM {bronze('REF_KPI_METRIC')}"), key=lambda r: r.get("SORT_ORDER") or 0)
    chans = sorted(wh.query(f"SELECT * FROM {bronze('REF_INTERACTION_CHANNEL')}"),
                   key=lambda r: r.get("SORT_ORDER") or 0)
    value = Refs(emps, terrs, tiers, segs, focus, {h for h in hol if h}, kpi, chans)
    with _lock:
        _refs = (time.time(), value)
    return value


def get_territory(territory_id: str) -> TerritoryData:
    cached = _territories.get(territory_id)
    if cached and time.time() - cached.loaded_at < _ttl():
        return cached
    data = _load(territory_id)
    with _lock:
        _territories[territory_id] = data
    return data


def _load(tid: str) -> TerritoryData:
    wh = get_warehouse()
    p = {"tid": tid}
    refs = get_refs()
    hcps = {h["HCP_ID"]: h for h in wh.query(f"SELECT * FROM {bronze('DIM_HCP')} WHERE TERRITORY_ID = :tid", p)}
    accounts = {a["ACCOUNT_ID"]: a for a in
                wh.query(f"SELECT * FROM {bronze('DIM_ACCOUNT')} WHERE TERRITORY_ID = :tid", p)}
    # Latest snapshot per HCP, picked in Python (portable, and the rows are few).
    metrics: dict[str, dict] = {}
    for m in wh.query(
            f"SELECT m.* FROM {bronze('FCT_HCP_METRICS')} m JOIN {bronze('DIM_HCP')} h "
            f"ON h.HCP_ID = m.HCP_ID WHERE h.TERRITORY_ID = :tid", p):
        m["AS_OF_DATE"] = to_date(m["AS_OF_DATE"])
        cur = metrics.get(m["HCP_ID"])
        if cur is None or (m["AS_OF_DATE"] or date.min) > (cur["AS_OF_DATE"] or date.min):
            metrics[m["HCP_ID"]] = m
    plan_rows = wh.query(f"SELECT * FROM {bronze('DIM_CALL_PLAN_TARGET')} WHERE TERRITORY_ID = :tid", p)
    years = sorted({r["PLAN_YEAR"] for r in plan_rows})
    this_year = today().year
    plan_year = max([y for y in years if y <= this_year] or years or [this_year])
    plan = {r["HCP_ID"]: r for r in plan_rows if r["PLAN_YEAR"] == plan_year}
    interactions = wh.query(f"SELECT * FROM {bronze('FCT_INTERACTION')} WHERE TERRITORY_ID = :tid", p)
    for i in interactions:
        i["INTERACTION_DATE"] = to_date(i["INTERACTION_DATE"])
    activity = wh.query(
        f"SELECT HCP_ID, EVENT_DATE, EVENT_TYPE FROM {bronze('FCT_POVO_ACTIVITY')} WHERE TERRITORY_ID = :tid", p)
    for a in activity:
        a["EVENT_DATE"] = to_date(a["EVENT_DATE"])
    goals = wh.query(f"SELECT * FROM {bronze('FCT_TERRITORY_GOAL')} WHERE TERRITORY_ID = :tid", p)
    territory = refs.territories.get(tid) or {"TERRITORY_ID": tid, "TERRITORY_NAME": tid, "CITY": None,
                                              "STATE": None, "REGION": None}
    return TerritoryData(tid, territory, plan_year, hcps, accounts, metrics, plan,
                         interactions, activity, goals)


def as_int(value: Any) -> int:
    return int(value or 0)
