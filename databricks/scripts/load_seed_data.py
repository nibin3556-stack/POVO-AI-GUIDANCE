"""Load the generated seed CSVs into the bronze tables.

For each bronze table with a CSV in seed/output: TRUNCATE the table, then insert
every row with batched, parameterised INSERTs, casting each value to the DDL
column type. The result is INSERT OVERWRITE semantics: the table holds exactly
the CSV afterwards. Row counts are verified at the end.

Only bronze tables (parsed from ddl/01_bronze_tables.sql) can be loaded; app
tables are never touched, so re-seeding cannot wipe calls or assessments.

Why parameters and not string-built SQL: the summaries and content text carry
quotes and regexes. Databricks caps a statement at 256 native parameters, so a
batch holds at most --max-params values.

Usage
    python databricks/scripts/load_seed_data.py --dry-run
    python databricks/scripts/load_seed_data.py
    python databricks/scripts/load_seed_data.py --tables DIM_HCP,FCT_INTERACTION --dir databricks/seed/output
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _common as c  # noqa: E402

MAX_PARAMS = 250


def cast(value: str, sql_type: str) -> Any:
    """CSV text -> Python value for the connector; empty field is NULL."""
    if value == "":
        return None
    if sql_type in ("INT", "BIGINT"):
        return int(value)
    if sql_type == "DOUBLE":
        return float(value)
    if sql_type == "BOOLEAN":
        if value.lower() not in ("true", "false"):
            raise ValueError(f"not a boolean: {value!r}")
        return value.lower() == "true"
    if sql_type == "DATE":
        return dt.date.fromisoformat(value)
    if sql_type == "TIMESTAMP":
        return dt.datetime.fromisoformat(value)
    return value


def read_csv(path: Path, columns: list[tuple[str, str]]) -> list[list[Any]]:
    with path.open(encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        expected = [name for name, _ in columns]
        if header != expected:
            raise SystemExit(f"{path.name}: header does not match the DDL\n  csv: {header}\n  ddl: {expected}")
        return [[cast(v, t) for v, (_, t) in zip(row, columns)] for row in reader]


def insert_batches(table_fqn: str, columns: list[tuple[str, str]], rows: list[list[Any]],
                   max_params: int = MAX_PARAMS) -> list[tuple[str, dict[str, Any]]]:
    """[(sql, params)] with at most max_params parameters each.

    Every placeholder is wrapped in CAST(... AS type) so NULLs and dates land
    with the column type regardless of how the connector infers the parameter.
    """
    per_batch = max(1, max_params // len(columns))
    col_list = ", ".join(name for name, _ in columns)
    out = []
    for start in range(0, len(rows), per_batch):
        chunk = rows[start:start + per_batch]
        params: dict[str, Any] = {}
        tuples = []
        for r, row in enumerate(chunk):
            cells = []
            for k, ((_, sql_type), value) in enumerate(zip(columns, row)):
                key = f"p{r}_{k}"
                params[key] = value
                cells.append(f":{key}" if sql_type == "STRING" and value is not None
                             else f"CAST(:{key} AS {sql_type})")
            tuples.append("(" + ", ".join(cells) + ")")
        out.append((f"INSERT INTO {table_fqn} ({col_list}) VALUES " + ", ".join(tuples), params))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Load seed CSVs into the POVO bronze tables.")
    p.add_argument("--dir", type=Path, default=c.SEED_OUTPUT_DIR, help="folder with <TABLE>.csv files")
    p.add_argument("--tables", default="", help="comma-separated table names (default: every CSV present)")
    p.add_argument("--dry-run", action="store_true", help="read and validate the CSVs, print the plan, no connection")
    p.add_argument("--max-params", type=int, default=MAX_PARAMS, help="parameters per INSERT (Databricks cap 256)")
    p.add_argument("--env-file", type=Path, default=None, help="explicit .env file instead of backend/.env")
    args = p.parse_args(argv)

    c.load_env(args.env_file)
    s = c.Settings.from_env()
    c.validate_identifiers(s)
    ddl = c.bronze_tables()

    wanted = [t.strip().upper() for t in args.tables.split(",") if t.strip()] or list(ddl)
    unknown = [t for t in wanted if t not in ddl]
    if unknown:
        raise SystemExit(f"not bronze tables (refusing to load): {', '.join(unknown)}")

    plan = []
    for table in wanted:
        path = args.dir / f"{table}.csv"
        if not path.exists():
            c.warn(f"{path.name} not found, {table} skipped")
            continue
        rows = read_csv(path, ddl[table])
        batches = insert_batches(s.bronze(table), ddl[table], rows, args.max_params)
        plan.append((table, rows, batches))
        print(f"  {table:<24} {len(rows):>7,} rows  {len(batches):>4} batches  -> {s.bronze(table)}")

    if args.dry_run:
        if plan and plan[0][2]:
            sql_text, params = plan[0][2][0]
            print(f"\nfirst statement ({len(params)} parameters):\n  {sql_text[:400]}...")
        print("\ndry run: nothing written")
        return 0

    failures = 0
    with c.connect(s) as conn, conn.cursor() as cur:
        for table, rows, batches in plan:
            fqn = s.bronze(table)
            try:
                c.run(cur, f"TRUNCATE TABLE {fqn}")
                for i, (sql_text, params) in enumerate(batches, 1):
                    c.run(cur, sql_text, params)
                    if i % 50 == 0:
                        print(f"        {table}: {i}/{len(batches)} batches")
                n = int(c.run(cur, f"SELECT COUNT(*) FROM {fqn}")[0][0])
            except Exception as exc:
                failures += 1
                c.bad(f"{table}: {str(exc)[:300]}", "run deploy_schema.py first; check MODIFY on the bronze schema")
                continue
            if n == len(rows):
                c.ok(f"{table}: {n:,} rows")
            else:
                failures += 1
                c.bad(f"{table}: expected {len(rows):,} rows, table has {n:,}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
