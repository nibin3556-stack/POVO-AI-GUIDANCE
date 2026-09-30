"""Preflight: can this machine reach the warehouse, and is the POVO schema in place?

Answers, in order, the questions a failed deployment makes you answer anyway:

  1. Is the configuration complete?
  2. Does the warehouse accept the token?
  3. Do the catalog and both schemas exist?
  4. Does every table exist, and how many rows does it hold
     (compared with seed/output/_manifest.json when present)?
  5. Optional (--write-test): can we write to the app schema? Inserts one
     APP_JOB_RUN row and deletes it again, which proves MODIFY without CREATE.

Usage
    python databricks/scripts/check_databricks.py
    python databricks/scripts/check_databricks.py --write-test

Apart from --write-test nothing here writes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _common as c  # noqa: E402


def check_config(s: c.Settings) -> bool:
    print("\n=== 1. configuration ===")
    print(f"        host        {s.host or '(unset)'}")
    print(f"        warehouse   {s.warehouse_id or '(unset)'}")
    print(f"        catalog     {s.catalog}   bronze {s.bronze_schema}   app {s.app_schema}")
    if not s.configured:
        c.bad("DATABRICKS_HOST / DATABRICKS_TOKEN / DATABRICKS_WAREHOUSE_ID incomplete",
              "set them in the environment or backend/.env")
        return False
    c.ok("configuration complete")
    return True


def check_connection(cur) -> bool:
    print("\n=== 2. connection ===")
    try:
        c.run(cur, "SELECT 1")
        c.ok("the warehouse accepted the token")
        return True
    except Exception as exc:
        text = str(exc)
        c.bad(f"cannot run a query: {text[:200]}")
        if "Invalid access token" in text or "401" in text:
            print(f"        {c.DIM}the PAT is wrong or expired; issue a new one{c.RESET}")
        return False


def check_containers(cur, s: c.Settings) -> int:
    print("\n=== 3. catalog and schemas ===")
    failures = 0
    catalogs = {r[0] for r in c.run(cur, "SHOW CATALOGS")}
    if s.catalog in catalogs:
        c.ok(f"catalog {s.catalog} exists")
    else:
        c.bad(f"catalog {s.catalog} not found or not visible",
              "run deploy_schema.py, or ask an admin to create it and grant USE CATALOG")
        return 1
    schemas = {r[0] for r in c.run(cur, f"SHOW SCHEMAS IN {s.catalog}")}
    for schema in (s.bronze_schema, s.app_schema):
        if schema in schemas:
            c.ok(f"schema {s.catalog}.{schema} exists")
        else:
            failures += 1
            c.bad(f"schema {s.catalog}.{schema} missing", "run deploy_schema.py --skip-catalog")
    return failures


def expected_counts() -> dict[str, int]:
    path = c.SEED_OUTPUT_DIR / "_manifest.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get("row_counts", {})


def check_tables(cur, s: c.Settings) -> int:
    print("\n=== 4. tables ===")
    failures = 0
    expected = expected_counts()
    for fqn_of, tables in ((s.bronze, c.bronze_tables()), (s.app, c.app_tables())):
        for table in tables:
            fqn = fqn_of(table)
            try:
                n = int(c.run(cur, f"SELECT COUNT(*) FROM {fqn}")[0][0])
            except Exception as exc:
                failures += 1
                c.bad(f"{fqn} unreadable: {str(exc)[:150]}")
                continue
            want = expected.get(table) if fqn_of == s.bronze else None
            if want is not None and want != n:
                c.warn(f"{fqn} -> {n:,} rows (manifest says {want:,}; re-run load_seed_data.py?)")
            elif fqn_of == s.bronze and n == 0:
                c.warn(f"{fqn} is empty")
            else:
                c.ok(f"{fqn} -> {n:,} rows")
    return failures


def check_write(cur, s: c.Settings) -> int:
    print("\n=== 5. write test on the app schema ===")
    run_id = f"preflight-{uuid.uuid4()}"
    fqn = s.app("APP_JOB_RUN")
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    try:
        c.run(cur, f"INSERT INTO {fqn} (RUN_ID, JOB_NAME, STARTED_AT, FINISHED_AT, STATUS, DETAIL) "
                   "VALUES (:rid, 'preflight_write_test', CAST(:ts AS TIMESTAMP), CAST(:ts AS TIMESTAMP), "
                   "'success', 'check_databricks.py write test')", {"rid": run_id, "ts": now})
        c.run(cur, f"DELETE FROM {fqn} WHERE RUN_ID = :rid", {"rid": run_id})
        c.ok(f"inserted and deleted a row in {fqn}")
        return 0
    except Exception as exc:
        c.bad(f"write failed: {str(exc)[:200]}", "grant MODIFY on the app schema (ddl/03_grants.sql)")
        return 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Preflight checks for the POVO Databricks schema.")
    p.add_argument("--write-test", action="store_true", help="insert and delete one APP_JOB_RUN row")
    p.add_argument("--env-file", type=Path, default=None, help="explicit .env file instead of backend/.env")
    args = p.parse_args(argv)

    c.load_env(args.env_file)
    s = c.Settings.from_env()
    c.validate_identifiers(s)
    if not check_config(s):
        return 1
    with c.connect(s) as conn, conn.cursor() as cur:
        if not check_connection(cur):
            return 1
        failures = check_containers(cur, s)
        if not failures:
            failures += check_tables(cur, s)
        if args.write_test and not failures:
            failures += check_write(cur, s)
    print()
    if failures:
        print(f"{c.RED}{failures} check(s) failed.{c.RESET}\n")
        return 1
    print(f"{c.GREEN}All checks passed.{c.RESET}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
