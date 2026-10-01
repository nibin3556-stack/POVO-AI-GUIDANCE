"""Copy every POVO table from the local DuckDB file into the SQLite database.

Both the bronze tables and the app tables (calls, assessments, checks,
revisions, audit, cache) are copied with their rows and real types, under the
same table names the backend uses with DATA_SOURCE=sqlite.

Stop the backend first: DuckDB allows one process per file.

    .venv\\Scripts\\python scripts\\duckdb_to_sqlite.py            # refuses to overwrite a non-empty SQLite file
    .venv\\Scripts\\python scripts\\duckdb_to_sqlite.py --replace  # empty the SQLite tables first

Paths default to LOCAL_DUCKDB_PATH and SQLITE_PATH from backend/.env.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import get_settings  # noqa: E402
from database import tables  # noqa: E402
from database.warehouse import sqlite_connect  # noqa: E402


def _schema_of(table: str, settings) -> str:
    return settings.databricks_schema if table in tables.BRONZE_COLUMNS else settings.databricks_app_schema


def copy_all(duck_path: str, sqlite_path: str, replace: bool) -> dict[str, int]:
    import duckdb

    settings = get_settings()
    src = duckdb.connect(duck_path, read_only=True)
    dst = sqlite_connect(sqlite_path)
    try:
        filled = [t for t in tables.ALL_COLUMNS if dst.execute(f"SELECT 1 FROM {t} LIMIT 1").fetchone()]
        if filled and not replace:
            raise SystemExit(f"{sqlite_path} already has data in {len(filled)} tables "
                             f"(e.g. {filled[0]}). Run again with --replace to overwrite it.")
        existing = {(s, t) for s, t in src.execute(
            "SELECT table_schema, table_name FROM information_schema.tables").fetchall()}
        counts: dict[str, int] = {}
        dst.execute("BEGIN")
        try:
            for table, cols in tables.ALL_COLUMNS.items():
                schema = _schema_of(table, settings)
                dst.execute(f"DELETE FROM {table}")
                if (schema, table) not in existing:
                    counts[table] = 0
                    continue
                have = {r[0] for r in src.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
                    [schema, table]).fetchall()}
                names = [c for c, _ in cols]
                select = ", ".join(c if c in have else f"NULL AS {c}" for c in names)
                rows = src.execute(f"SELECT {select} FROM {schema}.{table}").fetchall()
                dst.executemany(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({', '.join('?' * len(names))})",
                                rows)
                counts[table] = len(rows)
            dst.execute("COMMIT")
        except Exception:
            dst.execute("ROLLBACK")
            raise
        return counts
    finally:
        src.close()
        dst.close()


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--duckdb", default=settings.local_duckdb_path, help="source DuckDB file")
    parser.add_argument("--sqlite", default=settings.sqlite_path, help="target SQLite file")
    parser.add_argument("--replace", action="store_true", help="overwrite a SQLite file that already has data")
    args = parser.parse_args()
    if not Path(args.duckdb).is_file():
        raise SystemExit(f"No DuckDB file at {args.duckdb}")
    counts = copy_all(args.duckdb, args.sqlite, args.replace)
    print(f"Copied {args.duckdb}\n    -> {args.sqlite}")
    for table, n in counts.items():
        print(f"  {table:34} {n:>7}")


if __name__ == "__main__":
    main()
