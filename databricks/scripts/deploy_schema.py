"""Create the POVO AI Guidance catalog, schemas and tables on a Databricks SQL warehouse.

Runs ddl/00_catalog_schemas.sql, 01_bronze_tables.sql and 02_app_tables.sql in
order, after substituting ${catalog}, ${bronze_schema} and ${app_schema}.
Every statement is CREATE ... IF NOT EXISTS, so re-running is safe and never
drops data.

Usage
    python databricks/scripts/deploy_schema.py --dry-run          # print the SQL only
    python databricks/scripts/deploy_schema.py                    # create everything
    python databricks/scripts/deploy_schema.py --skip-catalog     # catalog pre-created by admins
    python databricks/scripts/deploy_schema.py --with-grants --app-principal <principal>

Config comes from the environment, then backend/.env and backend/.env.local:
DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID, DATABRICKS_CATALOG
(default povo_ai_guidance), DATABRICKS_SCHEMA (default bronze),
DATABRICKS_APP_SCHEMA (default app), DATABRICKS_APP_PRINCIPAL (for grants).
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import _common as c  # noqa: E402


def planned_statements(s: c.Settings, skip_catalog: bool, with_grants: bool) -> list[tuple[str, str]]:
    """[(file, statement)] in execution order, placeholders substituted."""
    files = list(c.DDL_FILES) + ([c.GRANTS_FILE] if with_grants else [])
    out = []
    for name in files:
        for stmt in c.split_statements(c.read_ddl(name)):
            if skip_catalog and re.search(r"^\s*CREATE\s+CATALOG\b", _strip_comments(stmt), re.I):
                continue
            out.append((name, c.substitute(stmt, s.placeholders())))
    return out


def _strip_comments(stmt: str) -> str:
    return "\n".join(line for line in stmt.splitlines() if not line.strip().startswith("--"))


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Deploy the POVO AI Guidance Databricks schema.")
    p.add_argument("--dry-run", action="store_true", help="print the SQL and exit without connecting")
    p.add_argument("--skip-catalog", action="store_true", help="do not run CREATE CATALOG (pre-created by admins)")
    p.add_argument("--with-grants", action="store_true", help="also run ddl/03_grants.sql")
    p.add_argument("--app-principal", default=None, help="principal for the grants (else DATABRICKS_APP_PRINCIPAL)")
    p.add_argument("--env-file", type=Path, default=None, help="explicit .env file instead of backend/.env")
    args = p.parse_args(argv)

    c.load_env(args.env_file)
    s = c.Settings.from_env()
    if args.app_principal:
        s = replace(s, app_principal=args.app_principal)
    c.validate_identifiers(s)
    if args.with_grants and not s.app_principal:
        raise SystemExit("--with-grants needs --app-principal or DATABRICKS_APP_PRINCIPAL")

    statements = planned_statements(s, args.skip_catalog, args.with_grants)
    print(f"catalog {s.catalog}  bronze {s.bronze_schema}  app {s.app_schema}  "
          f"({len(statements)} statements{', catalog skipped' if args.skip_catalog else ''})")

    if args.dry_run:
        current = None
        for name, stmt in statements:
            if name != current:
                print(f"\n-- ===== {name} =====")
                current = name
            print(stmt + ";\n")
        return 0

    with c.connect(s) as conn, conn.cursor() as cur:
        for i, (name, stmt) in enumerate(statements, 1):
            first_line = next(line for line in stmt.splitlines() if line.strip() and not line.strip().startswith("--"))
            print(f"  [{i:>2}/{len(statements)}] {name}: {first_line.strip()[:90]}")
            try:
                c.run(cur, stmt)
            except Exception as exc:  # show which statement failed, then stop
                c.bad(f"{name} failed: {str(exc)[:300]}",
                      "if CREATE CATALOG is not permitted, ask an admin to create it and use --skip-catalog")
                return 1
    c.ok("schema deployed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
