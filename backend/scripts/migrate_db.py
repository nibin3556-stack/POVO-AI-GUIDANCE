"""Bring a multi-brand SQLite database to the current schema, in place, keeping every row.

From the previous layout (BRAND_CODE in every key, DIM_TERRITORY, separate
REF_TIER / REF_SEGMENT / REF_KPI_METRIC / REF_KPI_PARAMETER tables):

  * Every table gets ONE primary key (database/tables.py PRIMARY_KEYS) and
    BRAND_CODE becomes a FOREIGN KEY to CFG_BRAND (enforced by SQLite).
    Natural keys that span several columns become one "|"-joined ID
    (GOAL_ID = POVO|NE-POR|2026-10|PEF, ASSESSMENT_ID = call|participant|category|point, ...).
  * DIM_TERRITORY is replaced by DIM_SALES_ASSIGNMENT: one row per employee and
    brand with the territory they cover (from DIM_EMPLOYEE.HOME_TERRITORY_ID and
    the territory's name, city, state, region and time zone). DIM_EMPLOYEE
    keeps one row per person; DIM_HCP gains TERRITORY_NAME and REGION.
  * REF_TIER, REF_SEGMENT, REF_KPI_METRIC and REF_KPI_PARAMETER are merged into
    REF_INTERACTION_CHANNEL, the master reference list (REF_TYPE says which).
  * Audit and job rows marked _ALL get BRAND_CODE NULL (all brands).

A copy of the file is written next to it first (<name>.pre-keys.bak). A
database already on this schema (it has DIM_SALES_ASSIGNMENT) is left alone.
Stop the backend first.

    .venv\\Scripts\\python scripts\\migrate_db.py
    .venv\\Scripts\\python scripts\\migrate_db.py --sqlite path\\to\\povo.sqlite
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import get_settings  # noqa: E402
from database import tables  # noqa: E402
from database.warehouse import sqlite_create_sql  # noqa: E402


def _k(*cols: str) -> str:
    """SQL for the '|'-joined key of these columns (NULL as '')."""
    return " || '|' || ".join(f"COALESCE(o.{c}, '')" for c in cols)


#: New table -> (old table, {column: SQL expression over the old row "o"}). Columns not listed are copied by name.
PLAN: dict[str, tuple[str, dict[str, str]]] = {
    "CFG_BRAND": ("CFG_BRAND", {}),
    "CFG_BRAND_FEATURE": ("CFG_BRAND_FEATURE", {"BRAND_FEATURE_ID": _k("BRAND_CODE", "FEATURE_CODE")}),
    "DIM_EMPLOYEE": ("DIM_EMPLOYEE", {}),
    "DIM_SALES_ASSIGNMENT": ("DIM_EMPLOYEE", {
        "ASSIGNMENT_ID": _k("BRAND_CODE", "EMPLOYEE_ID"), "TERRITORY_ID": "o.HOME_TERRITORY_ID",
        **{c: f"(SELECT t.{c} FROM DIM_TERRITORY__old t WHERE t.BRAND_CODE = o.BRAND_CODE "
              f"AND t.TERRITORY_ID = o.HOME_TERRITORY_ID)"
           for c in ("TERRITORY_NAME", "CITY", "STATE", "REGION", "TIME_ZONE")}}),
    "DIM_ACCOUNT": ("DIM_ACCOUNT", {}),
    "DIM_HCP": ("DIM_HCP", {
        c: f"(SELECT t.{c} FROM DIM_TERRITORY__old t WHERE t.BRAND_CODE = o.BRAND_CODE "
           f"AND t.TERRITORY_ID = o.TERRITORY_ID)" for c in ("TERRITORY_NAME", "REGION")}),
    "FCT_HCP_METRICS": ("FCT_HCP_METRICS", {"HCP_METRIC_ID": _k("BRAND_CODE", "HCP_ID", "AS_OF_DATE")}),
    "DIM_CALL_PLAN_TARGET": ("DIM_CALL_PLAN_TARGET", {
        "PLAN_TARGET_ID": _k("BRAND_CODE", "PLAN_YEAR", "TERRITORY_ID", "HCP_ID")}),
    "REF_COMPETITIVE_FOCUS": ("REF_COMPETITIVE_FOCUS", {"FOCUS_ID": _k("BRAND_CODE", "FOCUS_CODE")}),
    "FCT_INTERACTION": ("FCT_INTERACTION", {}),
    "FCT_BRAND_ACTIVITY": ("FCT_BRAND_ACTIVITY", {}),
    "FCT_TERRITORY_GOAL": ("FCT_TERRITORY_GOAL", {
        "GOAL_ID": "o.BRAND_CODE || '|' || o.TERRITORY_ID || '|' || printf('%04d-%02d', o.GOAL_YEAR, o.GOAL_MONTH) "
                   "|| '|' || o.METRIC_CODE"}),
    "REF_HOLIDAY": ("REF_HOLIDAY", {"HOLIDAY_ID": _k("BRAND_CODE", "HOLIDAY_DATE")}),
    "REF_TALKING_POINT": ("REF_TALKING_POINT", {}),
    "REF_OBJECTION_RULE": ("REF_OBJECTION_RULE", {}),
    "REF_COMPLIANCE_RULE": ("REF_COMPLIANCE_RULE", {"COMPLIANCE_RULE_ID": _k("BRAND_CODE", "RULE_ID")}),
    "REF_COMPLIANCE_TEXT": ("REF_COMPLIANCE_TEXT", {}),
    "APP_CALL": ("APP_CALL", {}),
    "APP_CALL_POINT_ASSESSMENT": ("APP_CALL_POINT_ASSESSMENT", {
        "ASSESSMENT_ID": _k("CALL_ID", "PARTICIPANT_ID", "CATEGORY", "POINT_ID")}),
    "APP_COMPLIANCE_CHECK": ("APP_COMPLIANCE_CHECK", {}),
    "APP_CALL_PREP_REVISION": ("APP_CALL_PREP_REVISION", {}),
    "APP_TERRITORY_GUIDANCE_SNAPSHOT": ("APP_TERRITORY_GUIDANCE_SNAPSHOT", {
        "SNAPSHOT_ID": _k("BRAND_CODE", "TERRITORY_ID", "SNAPSHOT_DATE")}),
    "APP_AI_CACHE": ("APP_AI_CACHE", {}),
    "APP_AUDIT_LOG": ("APP_AUDIT_LOG", {"BRAND_CODE": "NULLIF(o.BRAND_CODE, '_ALL')"}),
    "APP_JOB_RUN": ("APP_JOB_RUN", {"BRAND_CODE": "NULLIF(o.BRAND_CODE, '_ALL')"}),
}

#: REF_INTERACTION_CHANNEL (the master list) from the five old reference tables.
MASTER = [
    ("REF_INTERACTION_CHANNEL", "CHANNEL", "CHANNEL_CODE",
     {"NAME": "TYPE_LABEL", "TEAM_LABEL": "TEAM_LABEL", "SORT_ORDER": "SORT_ORDER"}),
    ("REF_TIER", "TIER", "TIER_CODE",
     {"NAME": "TIER_NAME", "DECILE_MIN": "DECILE_MIN", "DECILE_MAX": "DECILE_MAX", "CALLS_PER_YEAR": "CALLS_PER_YEAR",
      "REACH_GOAL_PCT": "REACH_GOAL_PCT", "SORT_ORDER": "SORT_ORDER"}),
    ("REF_SEGMENT", "SEGMENT", "SEGMENT_CODE",
     {"NAME": "FULL_NAME", "SHORT_NAME": "SHORT_NAME", "DESCRIPTION": "DESCRIPTION", "COLOR_HEX": "COLOR_HEX",
      "ARCHETYPE_NAME": "ARCHETYPE_NAME", "ARCHETYPE_DESC": "ARCHETYPE_DESC", "SORT_ORDER": "SORT_ORDER"}),
    ("REF_KPI_METRIC", "KPI_METRIC", "METRIC_CODE",
     {"NAME": "TITLE", "EVENT_TYPE": "EVENT_TYPE", "UNIT": "UNIT", "SORT_ORDER": "SORT_ORDER"}),
    ("REF_KPI_PARAMETER", "KPI_PARAMETER", "PARAM_CODE",
     {"PARAM_VALUE": "PARAM_VALUE", "DESCRIPTION": "DESCRIPTION", "SORT_ORDER": "SORT_ORDER"}),
]
OLD_ONLY = ("DIM_TERRITORY", "REF_TIER", "REF_SEGMENT", "REF_KPI_METRIC", "REF_KPI_PARAMETER")


def _tables(con: sqlite3.Connection) -> set[str]:
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def _columns(con: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}


def migrate(path: str) -> dict[str, str]:
    con = sqlite3.connect(path, isolation_level=None)
    result: dict[str, str] = {}
    try:
        have = _tables(con)
        if "DIM_SALES_ASSIGNMENT" in have:
            return {"(database)": "already on the current schema"}
        if "DIM_TERRITORY" not in have or "BRAND_CODE" not in _columns(con, "DIM_EMPLOYEE"):
            raise SystemExit("Not a multi-brand database (no BRAND_CODE / DIM_TERRITORY); nothing to do here.")
        con.execute("PRAGMA foreign_keys=OFF")  # rows move table by table; checked once at the end
        con.execute("BEGIN")
        old = sorted(have & (set(PLAN) | set(OLD_ONLY) | {"REF_INTERACTION_CHANNEL"}))
        for t in old:
            con.execute(f"ALTER TABLE {t} RENAME TO {t}__old")
        for t in ["CFG_BRAND", *[t for t in tables.ALL_COLUMNS if t != "CFG_BRAND"]]:
            con.execute(sqlite_create_sql(t))
        for new, (src, exprs) in PLAN.items():
            if f"{src}" not in have:
                result[new] = "created (empty)"
                continue
            src_cols = _columns(con, f"{src}__old")
            cols = [c for c, _ in tables.ALL_COLUMNS[new] if c in exprs or c in src_cols]
            values = [exprs.get(c, f"o.{c}") for c in cols]
            con.execute(f"INSERT OR IGNORE INTO {new} ({', '.join(cols)}) SELECT {', '.join(values)} FROM {src}__old o")
            result[new] = f"{con.execute(f'SELECT COUNT(*) FROM {new}').fetchone()[0]} rows"
        for src, ref_type, code, fields in MASTER:
            if src not in have:
                continue
            cols = ["REF_ID", "BRAND_CODE", "REF_TYPE", "CODE", *fields]
            values = [f"o.BRAND_CODE || '|{ref_type}|' || o.{code}", "o.BRAND_CODE", f"'{ref_type}'", f"o.{code}",
                      *[f"o.{c}" for c in fields.values()]]
            con.execute(f"INSERT INTO REF_INTERACTION_CHANNEL ({', '.join(cols)}) "
                        f"SELECT {', '.join(values)} FROM {src}__old o")
        result["REF_INTERACTION_CHANNEL"] = (
            f"{con.execute('SELECT COUNT(*) FROM REF_INTERACTION_CHANNEL').fetchone()[0]} rows "
            f"(channels, tiers, segments, KPI metrics and parameters)")
        # Every brand a row names must exist in the brand master.
        for t in tables.ALL_COLUMNS:
            con.execute(f"INSERT OR IGNORE INTO CFG_BRAND (BRAND_CODE, BRAND_NAME, IS_ACTIVE, SORT_ORDER, UPDATED_BY) "
                        f"SELECT DISTINCT BRAND_CODE, BRAND_CODE, 1, 99, 'system' FROM {t} WHERE BRAND_CODE IS NOT NULL")
        for t in old:
            con.execute(f"DROP TABLE {t}__old")
        bad = con.execute("PRAGMA foreign_key_check").fetchall()
        if bad:
            raise SystemExit(f"Foreign key check failed: {bad[:5]}")
        con.execute("COMMIT")
        for t in OLD_ONLY:
            result[t] = "removed (merged)"
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()
    con = sqlite3.connect(path)
    con.execute("VACUUM")
    con.close()
    return result


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", default=settings.sqlite_path, help="SQLite database file")
    parser.add_argument("--no-backup", action="store_true", help="skip the .pre-keys.bak copy")
    args = parser.parse_args()
    path = Path(args.sqlite)
    if not path.is_file():
        raise SystemExit(f"No database at {path}")
    if not args.no_backup:
        backup = path.with_name(path.name + ".pre-keys.bak")
        shutil.copy2(path, backup)
        print(f"Backup: {backup}")
    for table, what in migrate(str(path)).items():
        print(f"  {table:34} {what}")


if __name__ == "__main__":
    main()
