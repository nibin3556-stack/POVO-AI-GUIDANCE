"""Bronze data, loaded once per territory and kept in memory for a while.

The data per territory is small (about 140 targets, a few thousand activity
and interaction rows), and every screen needs most of it, so each territory is
read in a handful of territory-filtered SELECTs and cached in-process for
BRONZE_CACHE_SECONDS. All metric math then runs in Python (helpers/metrics).

Reference tables shared by every territory (employees, tiers, segments, focus
labels, holidays) are cached once per brand under the same TTL.

Multi-brand: every read filters on BRAND_CODE, and both caches are keyed by
brand, so two brands never share a row. Each table is filtered on its own
columns (brand, territory); none needs a join to another table.

People and territories: DIM_EMPLOYEE holds the person; DIM_SALES_ASSIGNMENT
says which territory they cover for a brand (one row per employee and brand,
with the territory's name, city, state, region and time zone). The rest of
the app sees one "employee in a brand" dict: the person's columns plus
BRAND_CODE and HOME_TERRITORY_ID from their assignment, as before.

Reference lists: REF_INTERACTION_CHANNEL is the master list. Its REF_TYPE
rows are mapped back to the shapes the code always used (TIER_CODE /
TIER_NAME, SEGMENT_CODE / FULL_NAME, METRIC_CODE / TITLE, CHANNEL_CODE /
TYPE_LABEL, PARAM_CODE -> PARAM_VALUE).

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
from database.tables import (REF_CHANNEL, REF_KPI_METRIC, REF_KPI_PARAMETER, REF_SEGMENT, REF_TIER,
                             bronze)
from database.warehouse import get_warehouse, to_date
from helpers.dates import WorkCalendar, today


@dataclass
class Refs:
    brand_code: str
    employees: list[dict]
    territories: dict[str, dict]
    tiers: list[dict]
    segments: list[dict]
    focus: list[dict]
    holidays: set[date]
    kpi_metrics: list[dict]
    channels: list[dict]
    #: KPI_PARAMETER rows: PARAM_CODE -> PARAM_VALUE (the patient split rates).
    kpi_parameters: dict[str, float] = field(default_factory=dict)

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
    brand_code: str
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
_refs: dict[str, tuple[float, Refs]] = {}
_territories: dict[tuple[str, str], TerritoryData] = {}
_people: tuple[float, list[dict]] = (0.0, [])
_assignments: tuple[float, list[dict]] = (0.0, [])


def _ttl() -> int:
    return get_settings().bronze_cache_seconds


def clear_cache() -> None:
    global _people, _assignments
    with _lock:
        _refs.clear()
        _territories.clear()
        _people = (0.0, [])
        _assignments = (0.0, [])


def all_employees() -> list[dict]:
    """DIM_EMPLOYEE rows (one per person), for sign-in."""
    global _people
    loaded, rows = _people
    if rows and time.time() - loaded < _ttl():
        return rows
    rows = get_warehouse().query(f"SELECT * FROM {bronze('DIM_EMPLOYEE')}")
    with _lock:
        _people = (time.time(), rows)
    return rows


def all_assignments() -> list[dict]:
    """DIM_SALES_ASSIGNMENT rows of every brand: who covers which territory for which brand."""
    global _assignments
    loaded, rows = _assignments
    if rows and time.time() - loaded < _ttl():
        return rows
    rows = get_warehouse().query(f"SELECT * FROM {bronze('DIM_SALES_ASSIGNMENT')}")
    with _lock:
        _assignments = (time.time(), rows)
    return rows


def in_brand(person: dict, assignment: dict) -> dict:
    """The "employee in a brand" the app works with: person + brand + home territory.

    Active only when both the person and the assignment are active.
    """
    active = all(v is None or v is True or str(v).lower() in ("true", "1", "t")
                 for v in (person.get("IS_ACTIVE"), assignment.get("IS_ACTIVE")))
    return {**person, "BRAND_CODE": assignment["BRAND_CODE"], "HOME_TERRITORY_ID": assignment.get("TERRITORY_ID"),
            "IS_ACTIVE": active}


def _territory(a: dict) -> dict:
    return {k: a.get(k) for k in ("TERRITORY_ID", "TERRITORY_NAME", "CITY", "STATE", "REGION", "TIME_ZONE")}


def _master(rows: list[dict], ref_type: str, fields: dict[str, str]) -> list[dict]:
    """REF_INTERACTION_CHANNEL rows of one REF_TYPE, renamed to the shape the code uses."""
    return [{new: r.get(old) for new, old in fields.items()}
            for r in sorted((r for r in rows if r.get("REF_TYPE") == ref_type), key=lambda r: r.get("SORT_ORDER") or 0)]


TIER_FIELDS = {"TIER_CODE": "CODE", "TIER_NAME": "NAME", "DECILE_MIN": "DECILE_MIN", "DECILE_MAX": "DECILE_MAX",
               "CALLS_PER_YEAR": "CALLS_PER_YEAR", "REACH_GOAL_PCT": "REACH_GOAL_PCT", "SORT_ORDER": "SORT_ORDER"}
SEGMENT_FIELDS = {"SEGMENT_CODE": "CODE", "SHORT_NAME": "SHORT_NAME", "FULL_NAME": "NAME",
                  "DESCRIPTION": "DESCRIPTION", "COLOR_HEX": "COLOR_HEX", "ARCHETYPE_NAME": "ARCHETYPE_NAME",
                  "ARCHETYPE_DESC": "ARCHETYPE_DESC", "SORT_ORDER": "SORT_ORDER"}
KPI_FIELDS = {"METRIC_CODE": "CODE", "EVENT_TYPE": "EVENT_TYPE", "TITLE": "NAME", "UNIT": "UNIT",
              "SORT_ORDER": "SORT_ORDER"}
CHANNEL_FIELDS = {"CHANNEL_CODE": "CODE", "TYPE_LABEL": "NAME", "TEAM_LABEL": "TEAM_LABEL", "SORT_ORDER": "SORT_ORDER"}
PARAM_FIELDS = {"PARAM_CODE": "CODE", "PARAM_VALUE": "PARAM_VALUE", "DESCRIPTION": "DESCRIPTION",
                "SORT_ORDER": "SORT_ORDER"}


def get_refs(brand_code: str) -> Refs:
    cached = _refs.get(brand_code)
    if cached is not None and time.time() - cached[0] < _ttl():
        return cached[1]
    wh = get_warehouse()
    b = {"brand": brand_code}
    people = {p["EMPLOYEE_ID"]: p for p in all_employees()}
    mine = [a for a in all_assignments() if a.get("BRAND_CODE") == brand_code]
    emps = [in_brand(people[a["EMPLOYEE_ID"]], a) for a in mine if a.get("EMPLOYEE_ID") in people]
    terrs: dict[str, dict] = {}
    for a in mine:
        if a.get("TERRITORY_ID"):
            terrs.setdefault(a["TERRITORY_ID"], _territory(a))
    hol = {to_date(r["HOLIDAY_DATE"]) for r in
           wh.query(f"SELECT HOLIDAY_DATE FROM {bronze('REF_HOLIDAY')} WHERE BRAND_CODE = :brand", b)}
    master = wh.query(f"SELECT * FROM {bronze('REF_INTERACTION_CHANNEL')} WHERE BRAND_CODE = :brand", b)
    params = {p["PARAM_CODE"]: float(p["PARAM_VALUE"]) for p in _master(master, REF_KPI_PARAMETER, PARAM_FIELDS)
              if p.get("PARAM_VALUE") is not None}
    focus = sorted(wh.query(f"SELECT * FROM {bronze('REF_COMPETITIVE_FOCUS')} WHERE BRAND_CODE = :brand", b),
                   key=lambda r: r.get("SORT_ORDER") or 0)
    value = Refs(brand_code, emps, terrs, _master(master, REF_TIER, TIER_FIELDS),
                 _master(master, REF_SEGMENT, SEGMENT_FIELDS), focus, {h for h in hol if h},
                 _master(master, REF_KPI_METRIC, KPI_FIELDS), _master(master, REF_CHANNEL, CHANNEL_FIELDS), params)
    with _lock:
        _refs[brand_code] = (time.time(), value)
    return value


def get_territory(brand_code: str, territory_id: str) -> TerritoryData:
    key = (brand_code, territory_id)
    cached = _territories.get(key)
    if cached and time.time() - cached.loaded_at < _ttl():
        return cached
    data = _load(brand_code, territory_id)
    with _lock:
        _territories[key] = data
    return data


def _load(brand: str, tid: str) -> TerritoryData:
    wh = get_warehouse()
    p = {"brand": brand, "tid": tid}
    where = "WHERE BRAND_CODE = :brand AND TERRITORY_ID = :tid"
    refs = get_refs(brand)
    hcps = {h["HCP_ID"]: h for h in wh.query(f"SELECT * FROM {bronze('DIM_HCP')} {where}", p)}
    accounts = {a["ACCOUNT_ID"]: a for a in wh.query(f"SELECT * FROM {bronze('DIM_ACCOUNT')} {where}", p)}
    # Latest snapshot per HCP, picked in Python (portable, and the rows are few).
    metrics: dict[str, dict] = {}
    for m in wh.query(f"SELECT * FROM {bronze('FCT_HCP_METRICS')} {where}", p):
        m["AS_OF_DATE"] = to_date(m["AS_OF_DATE"])
        cur = metrics.get(m["HCP_ID"])
        if cur is None or (m["AS_OF_DATE"] or date.min) > (cur["AS_OF_DATE"] or date.min):
            metrics[m["HCP_ID"]] = m
    plan_rows = wh.query(f"SELECT * FROM {bronze('DIM_CALL_PLAN_TARGET')} {where}", p)
    years = sorted({r["PLAN_YEAR"] for r in plan_rows})
    this_year = today().year
    plan_year = max([y for y in years if y <= this_year] or years or [this_year])
    plan = {r["HCP_ID"]: r for r in plan_rows if r["PLAN_YEAR"] == plan_year}
    interactions = wh.query(f"SELECT * FROM {bronze('FCT_INTERACTION')} {where}", p)
    for i in interactions:
        i["INTERACTION_DATE"] = to_date(i["INTERACTION_DATE"])
    activity = wh.query(f"SELECT HCP_ID, EVENT_DATE, EVENT_TYPE FROM {bronze('FCT_BRAND_ACTIVITY')} {where}", p)
    for a in activity:
        a["EVENT_DATE"] = to_date(a["EVENT_DATE"])
    goals = wh.query(f"SELECT * FROM {bronze('FCT_TERRITORY_GOAL')} {where}", p)
    from helpers.directory import get_directory  # lazy: the directory builds on this module
    territory = (refs.territories.get(tid) or get_directory().territory(brand, tid)
                 or {"TERRITORY_ID": tid, "TERRITORY_NAME": tid, "CITY": None, "STATE": None, "REGION": None})
    return TerritoryData(brand, tid, territory, plan_year, hcps, accounts, metrics, plan,
                         interactions, activity, goals)


def as_int(value: Any) -> int:
    return int(value or 0)
