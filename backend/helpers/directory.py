"""The employee directory: who may sign in, and the territories they cover.

IDENTITY_SOURCE picks one of two sources:

  * app      The app's own DIM_EMPLOYEE + DIM_SALES_ASSIGNMENT (seed data).
             The identity is matched on USERNAME, then EMAIL. For development.
  * trinity  Incyte's employee master on Databricks ({TRINITY_CATALOG}.
             {TRINITY_SCHEMA}, bis_prod.bronze_trinity). It runs the same gate as Mosaic:
               1. The Okta identity Posit sends (p250048@incyte.com) loses its
                  domain: p250048.
               2. That must be an EMP_USER_ID in DIM_EMPLOYEE with
                  EMP_STATUS = 'Active' and not terminated: TERM_DATE NULL,
                  the 1900-01-01 "not set" sentinel, or in the future.
               3. EMP_TYPE picks the DIM_SALES_FORCE_CURR column that holds
                  them: OHS territory rep (TERR_EMP_ID), OBD district manager
                  (DIST_EMP_ID), ASD / ABD area manager (AREA_EMP_ID). Any
                  other type is matched against all three.
               4. Those rows give the territories (TERR_ID, TERR_NAME,
                  DIST_NAME), and their TEAM_NAME / TEAM_ID the brand
                  (TRINITY_BRAND_TEAMS).
             An active employee with no sales-force row is refused, unless
             they are an admin user (ADMIN_USERS_FILE). A home-office admin
             gets every active brand with no territory of their own, so they
             can configure brands and "view as" a rep.
             With DATA_SOURCE local or sqlite the data is the seed, so a Trinity
             territory the seed lacks is swapped for a seed one
             (LOCAL_DATA_TERRITORY_ID): login is real, the data is not.

Both sources return the same "employee in a brand" dict the app has always
used (EMPLOYEE_ID, USERNAME, FULL_NAME, ROLE_CODE, BRAND_CODE,
HOME_TERRITORY_ID, ...), one per brand the person works on.

Trinity answers, refusals included, are cached for IDENTITY_CACHE_SECONDS. The
gate runs on every request and costs two warehouse reads; "not an employee"
stays true for the next minute just as a match does.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional

from core.config import get_settings
from database.warehouse import DatabricksWarehouse, Warehouse, get_warehouse
from helpers import brands
from helpers.dates import today
from helpers.territory_data import all_assignments, all_employees, get_refs, in_brand


def active(e: dict) -> bool:
    v = e.get("IS_ACTIVE")
    return v is None or v is True or str(v).lower() in ("true", "1", "t")


def user_id(identity: Optional[str]) -> str:
    """p250048@incyte.com -> p250048; a bare id passes through. Lower-cased and trimmed."""
    return (identity or "").strip().lower().split("@", 1)[0]


# ---------------------------------------------------------------------------
# app: the seed tables
# ---------------------------------------------------------------------------
class AppDirectory:
    name = "app"

    @staticmethod
    def _matches(value: str, rows: list[dict]) -> list[dict]:
        """Rows (any brand) whose USERNAME or EMAIL is the identity."""
        v = value.strip().lower()
        for key in ("USERNAME", "EMAIL"):
            hits = [e for e in rows if (e.get(key) or "").strip().lower() == v]
            if hits:
                return hits
        if "@" in v:  # an email whose local part is the username
            local = v.split("@", 1)[0]
            return [e for e in rows if (e.get("USERNAME") or "").strip().lower() == local]
        return []

    def lookup(self, identity: str) -> list[dict]:
        people = {p["EMPLOYEE_ID"]: p for p in self._matches(identity, all_employees())}
        return [in_brand(people[a["EMPLOYEE_ID"]], a) for a in all_assignments()
                if a.get("EMPLOYEE_ID") in people]

    def by_id(self, employee_id: str, brand_code: str) -> Optional[dict]:
        eid = (employee_id or "").strip().lower()
        return next((e for e in get_refs(brand_code).employees if (e.get("EMPLOYEE_ID") or "").lower() == eid), None)

    def search(self, q: str, brand_code: str, limit: int) -> list[dict]:
        """Employee ID, network ID or username exactly; name or territory by substring."""
        v = q.strip().lower()
        refs = get_refs(brand_code)
        hits = []
        for e in refs.employees:
            if not active(e):
                continue
            terr = (refs.territories.get(e.get("HOME_TERRITORY_ID") or "", {}).get("TERRITORY_NAME") or "").lower()
            exact = v in ((e.get("EMPLOYEE_ID") or "").lower(), str(e.get("NETWORK_ID") or "").lower(),
                          (e.get("USERNAME") or "").lower())
            if exact or v in (e.get("FULL_NAME") or "").lower() or v in terr:
                hits.append((0 if exact else 1, e.get("FULL_NAME") or "", e))
        hits.sort(key=lambda h: (h[0], h[1]))
        return [e for _, _, e in hits[:limit]]

    def territory(self, brand_code: str, territory_id: str) -> Optional[dict]:
        return get_refs(brand_code).territories.get(territory_id)

    def clear(self) -> None:
        pass  # the seed rows are cached by territory_data


# ---------------------------------------------------------------------------
# trinity: Incyte's employee master and sales-force alignment
# ---------------------------------------------------------------------------
#: EMP_TYPE -> the DIM_SALES_FORCE_CURR column that holds the employee at their level.
LEVEL_COLUMN = {"OHS": "TERR_EMP_ID", "OBD": "DIST_EMP_ID", "ASD": "AREA_EMP_ID", "ABD": "AREA_EMP_ID"}
#: Highest level first: someone who is both a district manager and covers a territory is a manager.
_LEVELS = ("AREA_EMP_ID", "DIST_EMP_ID", "TERR_EMP_ID")
_MANAGER_LEVELS = {"AREA_EMP_ID": ("Area", "AREA_NAME"), "DIST_EMP_ID": ("District", "DIST_NAME")}
#: TERM_DATE "not set" sentinel: on or before it means not terminated.
TERM_SENTINEL = "1900-01-01"
_EMP_COLS = ("EMP_ID", "EMP_USER_ID", "EMP_FIRST_NAME", "EMP_LAST_NAME", "EMP_WORK_EMAIL", "EMP_TYPE",
             "JOB_TITLE", "DEPT_NAME")
_SF_COLS = ("TEAM_ID", "TEAM_NAME", "TERR_ID", "TERR_NAME", "DIST_ID", "DIST_NAME", "AREA_ID", "AREA_NAME",
            "TERR_EMP_ID", "DIST_EMP_ID", "AREA_EMP_ID")
_MAX_CACHED = 20_000


def _id(value: Any) -> str:
    """An id column as text: 123, 123.0 and "123 " all become "123"."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return "" if value is None else str(value).strip()


def _territory(r: dict) -> dict:
    return {"TERRITORY_ID": _id(r.get("TERR_ID")), "TERRITORY_NAME": r.get("TERR_NAME"), "CITY": None,
            "STATE": None, "REGION": r.get("DIST_NAME"), "TIME_ZONE": None}


class TrinityDirectory:
    name = "trinity"

    def __init__(self, warehouse: Optional[Warehouse] = None) -> None:
        self._wh = warehouse
        self._cache: dict[str, tuple[float, Any]] = {}
        self._territories: dict[tuple[str, str], dict] = {}
        self._lock = threading.Lock()

    # --- plumbing -------------------------------------------------------------
    @property
    def wh(self) -> Warehouse:
        """The Databricks warehouse: the app's own when DATA_SOURCE=databricks, else a separate one."""
        if self._wh is None:
            s = get_settings()
            self._wh = get_warehouse() if s.data_source == "databricks" else DatabricksWarehouse(s)
        return self._wh

    def _t(self, table: str) -> str:
        if self.wh.name != "databricks":  # a local stand-in (the tests) uses bare names
            return table
        s = get_settings()
        return f"{s.trinity_catalog}.{s.trinity_schema}.{table}"

    def _text(self, col: str) -> str:
        """An id column compared as text: the id columns are BIGINT in some tables and STRING in others."""
        return f"CAST({col} AS {'STRING' if self.wh.name == 'databricks' else 'TEXT'})"

    def _active_sql(self, alias: str = "") -> str:
        a = f"{alias}." if alias else ""
        return (f"LOWER(TRIM(COALESCE({a}EMP_STATUS, ''))) = 'active' "
                f"AND ({a}TERM_DATE IS NULL OR {a}TERM_DATE <= :sentinel OR {a}TERM_DATE > :today)")

    def _params(self, **extra: Any) -> dict:
        return {"sentinel": TERM_SENTINEL, "today": today().isoformat(), **extra}

    def _cached(self, key: str, load: Callable[[], Any]) -> Any:
        hit = self._cache.get(key)
        if hit is not None and time.time() - hit[0] < get_settings().identity_cache_seconds:
            return hit[1]
        value = load()
        with self._lock:
            if len(self._cache) >= _MAX_CACHED:
                self._cache.clear()
            self._cache[key] = (time.time(), value)
        return value

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._territories.clear()

    # --- reads ------------------------------------------------------------------
    def _employee(self, match: str, value: str) -> Optional[dict]:
        rows = self.wh.query(f"SELECT {', '.join(_EMP_COLS)} FROM {self._t('DIM_EMPLOYEE')} "
                             f"WHERE {match} AND {self._active_sql()}", self._params(v=value))
        return rows[0] if rows else None

    def _sales_rows(self, emp: dict) -> list[dict]:
        cols = [LEVEL_COLUMN[t]] if (t := (emp.get("EMP_TYPE") or "").strip().upper()) in LEVEL_COLUMN \
            else list(_LEVELS)
        match = " OR ".join(f"{self._text(c)} = :eid" for c in cols)
        # No IS_ACTIVE filter: the _CURR table holds current assignments only.
        return self.wh.query(f"SELECT {', '.join(_SF_COLS)} FROM {self._t('DIM_SALES_FORCE_CURR')} "
                             f"WHERE ({match}) AND TERR_ID IS NOT NULL", {"eid": _id(emp["EMP_ID"])})

    def _load(self, match: str, value: str) -> tuple[dict, ...]:
        emp = self._employee(match, value)
        return tuple(self._people(emp, self._sales_rows(emp))) if emp else ()

    # --- shaping ------------------------------------------------------------------
    @staticmethod
    def _brands_of(row: dict) -> list[str]:
        s = get_settings()
        mapping = s.brand_teams
        if not mapping:
            return [s.default_brand_code]
        team = {(row.get("TEAM_NAME") or "").strip().upper(), _id(row.get("TEAM_ID")).upper()} - {""}
        return [b for b, teams in mapping.items() if team & teams]

    def _people(self, emp: dict, rows: list[dict], admin_fallback: bool = True) -> list[dict]:
        by_brand: dict[str, list[dict]] = {}
        for r in rows:
            for b in self._brands_of(r):
                by_brand.setdefault(b, []).append(r)
        people = [self._person(emp, b, rs) for b, rs in by_brand.items()]
        if not people and admin_fallback and brands.is_admin(emp.get("EMP_USER_ID")):
            people = [self._person(emp, b["BRAND_CODE"], []) for b in brands.brands()]
        return people

    def _person(self, emp: dict, brand_code: str, rows: list[dict]) -> dict:
        eid = _id(emp["EMP_ID"])
        level = next((c for c in _LEVELS if any(_id(r.get(c)) == eid for r in rows)), None)
        terrs = sorted({_id(r["TERR_ID"]): r for r in rows}.items())
        with self._lock:
            for tid, r in terrs:
                self._territories[(brand_code, tid)] = _territory(r)
        n = len(terrs)
        if level == "TERR_EMP_ID":
            access = f"Rep level, {n} territor{'y' if n == 1 else 'ies'}"
            regions = ", ".join(sorted({r.get("DIST_NAME") or "" for _, r in terrs} - {""}))
        elif level:
            label, col = _MANAGER_LEVELS[level]
            access = f"{label} level, {n} territor{'y' if n == 1 else 'ies'}"
            regions = ", ".join(sorted({r.get(col) or "" for _, r in terrs} - {""}))
        else:
            access, regions = "Home office", None
        first, last = emp.get("EMP_FIRST_NAME"), emp.get("EMP_LAST_NAME")
        uid = (emp.get("EMP_USER_ID") or "").strip()
        return {"EMPLOYEE_ID": eid, "NETWORK_ID": uid, "USERNAME": uid.lower(), "EMAIL": emp.get("EMP_WORK_EMAIL"),
                "FIRST_NAME": first, "LAST_NAME": last,
                "FULL_NAME": " ".join(p for p in (first, last) if p) or uid,
                "INITIALS": "".join(p[0] for p in (first, last) if p).upper(),
                "BUSINESS_UNIT": ", ".join(sorted({r.get("TEAM_NAME") or "" for _, r in terrs} - {""}))
                                 or emp.get("DEPT_NAME"),
                "ROLE_CODE": "REP" if level == "TERR_EMP_ID" else "MANAGER", "ROLE_TITLE": emp.get("JOB_TITLE"),
                "EMP_TYPE": (emp.get("EMP_TYPE") or "").strip().upper(),
                "ACCESS_LEVEL": access, "ACCESS_REGIONS": regions, "IS_ACTIVE": True, "BRAND_CODE": brand_code,
                "HOME_TERRITORY_ID": self._data_territory(uid, brand_code, terrs[0][0]) if terrs else None}

    @staticmethod
    def _data_territory(uid: str, brand_code: str, tid: str) -> str:
        """The territory whose data the person sees. With DATA_SOURCE=databricks, their own.

        Off Databricks the data is the seed, keyed by seed territory ids: a Trinity
        territory the seed has is kept; else the seed employee with the same
        username's territory; else LOCAL_DATA_TERRITORY_ID (see core/config.py).
        """
        s = get_settings()
        if s.data_source == "databricks":
            return tid
        seed = get_refs(brand_code).territories
        if tid in seed:
            return tid
        same = next((p for p in AppDirectory().lookup(uid) if p["BRAND_CODE"] == brand_code), None)
        if same and same.get("HOME_TERRITORY_ID") in seed:
            return same["HOME_TERRITORY_ID"]
        fallback = s.local_data_territory_id.strip()
        return fallback if fallback in seed else tid

    # --- the directory interface ------------------------------------------------
    def lookup(self, identity: str) -> list[dict]:
        uid = user_id(identity)
        if not uid:
            return []
        rows = self._cached(f"user:{uid}", lambda: self._load("LOWER(TRIM(COALESCE(EMP_USER_ID, ''))) = :v", uid))
        return [dict(r) for r in rows]

    def by_id(self, employee_id: str, brand_code: str) -> Optional[dict]:
        """By EMP_ID; a network id or email is accepted too (the "view as" box takes either)."""
        v = (employee_id or "").strip()
        if not v:
            return None
        rows = self._cached(f"id:{v}", lambda: self._load(f"{self._text('EMP_ID')} = :v", v))
        if not rows and not v.isdigit():
            rows = tuple(self.lookup(v))
        return next((dict(r) for r in rows if r["BRAND_CODE"] == brand_code), None)

    def search(self, q: str, brand_code: str, limit: int) -> list[dict]:
        """Territory reps of the brand: EMP_ID, network id or territory id exactly; name or territory by substring."""
        v = q.strip().lower()
        teams = sorted(get_settings().brand_teams.get(brand_code, set()))
        team_sql = f" AND (UPPER(S.TEAM_NAME) IN (:teams) OR {self._text('S.TEAM_ID')} IN (:teams))" if teams else ""
        rows = self.wh.query(
            f"SELECT {', '.join('E.' + c for c in _EMP_COLS)}, {', '.join('S.' + c for c in _SF_COLS)} "
            f"FROM {self._t('DIM_SALES_FORCE_CURR')} S "
            f"JOIN {self._t('DIM_EMPLOYEE')} E ON {self._text('E.EMP_ID')} = {self._text('S.TERR_EMP_ID')} "
            f"WHERE {self._active_sql('E')} AND S.TERR_ID IS NOT NULL{team_sql} AND ("
            f"{self._text('E.EMP_ID')} = :q OR LOWER(TRIM(E.EMP_USER_ID)) = :q OR LOWER(TRIM(S.TERR_ID)) = :q "
            f"OR LOWER(COALESCE(E.EMP_FIRST_NAME, '') || ' ' || COALESCE(E.EMP_LAST_NAME, '')) LIKE :like "
            f"OR LOWER(S.TERR_NAME) LIKE :like)",
            self._params(q=v, like=f"%{v}%", teams=teams))
        grouped: dict[str, tuple[dict, list[dict]]] = {}
        for r in rows:
            grouped.setdefault(_id(r["EMP_ID"]), (r, []))[1].append(r)
        hits = []
        for eid, (emp, sf) in grouped.items():
            person = next((p for p in self._people(emp, sf, admin_fallback=False)
                           if p["BRAND_CODE"] == brand_code), None)
            if person:
                exact = v in (eid.lower(), person["USERNAME"], (person["HOME_TERRITORY_ID"] or "").lower())
                hits.append((0 if exact else 1, person["FULL_NAME"], person))
        hits.sort(key=lambda h: (h[0], h[1]))
        return [p for _, _, p in hits[:limit]]

    def territory(self, brand_code: str, territory_id: str) -> Optional[dict]:
        if not territory_id:
            return None
        if get_settings().data_source != "databricks" and territory_id in get_refs(brand_code).territories:
            return get_refs(brand_code).territories[territory_id]  # a seed territory (_data_territory)
        hit = self._territories.get((brand_code, territory_id))
        if hit is not None:
            return hit

        def load() -> Optional[dict]:
            rows = self.wh.query(f"SELECT {', '.join(_SF_COLS)} FROM {self._t('DIM_SALES_FORCE_CURR')} "
                                 f"WHERE {self._text('TERR_ID')} = :tid", {"tid": territory_id})
            return _territory(rows[0]) if rows else None
        return self._cached(f"terr:{territory_id}", load)


# ---------------------------------------------------------------------------
_directory: Optional[Any] = None


def get_directory() -> "AppDirectory | TrinityDirectory":
    global _directory
    if _directory is None:
        _directory = TrinityDirectory() if get_settings().identity_source == "trinity" else AppDirectory()
    return _directory


def set_directory(directory: Optional[Any]) -> None:
    """Swap the directory (tests); None goes back to the one IDENTITY_SOURCE picks."""
    global _directory
    _directory = directory
