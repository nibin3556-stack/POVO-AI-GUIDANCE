"""Refresh the bronze (source data) tables of the SQLite database from the seed CSVs.

With DATA_SOURCE=sqlite the backend only fills EMPTY bronze tables at start,
so new dummy data needs this script. App tables are never touched.

    python ..\\databricks\\seed\\generate_seed_data.py         # new CSVs (as of today)
    .venv\\Scripts\\python scripts\\load_sqlite_bronze.py      # every bronze table
    .venv\\Scripts\\python scripts\\load_sqlite_bronze.py --tables DIM_HCP,FCT_INTERACTION

Stop the backend first. Paths default to SQLITE_PATH and SEED_OUTPUT_DIR.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import get_settings  # noqa: E402
from database import tables  # noqa: E402
from database.warehouse import load_csv_into_sqlite, sqlite_connect  # noqa: E402


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sqlite", default=settings.sqlite_path, help="SQLite database file")
    parser.add_argument("--dir", default=settings.seed_output_dir, help="folder with <TABLE>.csv files")
    parser.add_argument("--tables", default="", help="comma-separated bronze tables (default: all)")
    args = parser.parse_args()
    wanted = [t.strip().upper() for t in args.tables.split(",") if t.strip()] or list(tables.BRONZE_COLUMNS)
    unknown = [t for t in wanted if t not in tables.BRONZE_COLUMNS]
    if unknown:
        raise SystemExit(f"Not bronze tables: {', '.join(unknown)}")
    con = sqlite_connect(args.sqlite)
    try:
        for table in wanted:
            if load_csv_into_sqlite(con, table, args.dir):
                n = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                print(f"  {table:28} {n:>7}")
            else:
                print(f"  {table:28} skipped (no {table}.csv in {args.dir})")
    finally:
        con.close()


if __name__ == "__main__":
    main()
