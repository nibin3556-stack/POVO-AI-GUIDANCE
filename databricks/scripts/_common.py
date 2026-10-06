"""Shared helpers for the Databricks scripts: config, DDL parsing, connection.

Why one module: deploy, load and check must agree on the placeholders, the
table list and the column types. The DDL files are the single source of truth
for both, so the loader and the checker read them instead of repeating them.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

DATABRICKS_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = DATABRICKS_DIR.parent
DDL_DIR = DATABRICKS_DIR / "ddl"
SEED_OUTPUT_DIR = DATABRICKS_DIR / "seed" / "output"

DDL_FILES = ["00_catalog_schemas.sql", "01_bronze_tables.sql", "02_app_tables.sql"]
GRANTS_FILE = "03_grants.sql"

GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"


def ok(msg: str) -> None:
    print(f"  {GREEN}PASS{RESET}  {msg}")


def bad(msg: str, fix: str = "") -> None:
    print(f"  {RED}FAIL{RESET}  {msg}")
    if fix:
        print(f"        {DIM}{fix}{RESET}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}WARN{RESET}  {msg}")


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
def load_env(env_file: Path | None = None) -> list[Path]:
    """Load backend/.env then backend/.env.local (same order as the backend).

    Real environment variables always win (override=False), so a value set in
    the shell or on the VM is never silently replaced by a file.
    python-dotenv is optional: without it only the real environment is used.
    """
    candidates = [env_file] if env_file else [REPO_DIR / "backend" / ".env", REPO_DIR / "backend" / ".env.local"]
    loaded = [p for p in candidates if p and p.exists()]
    if not loaded:
        return []
    try:
        from dotenv import load_dotenv
    except ImportError:
        warn("python-dotenv not installed; .env files ignored, using the environment only")
        return []
    for p in loaded:
        load_dotenv(p, override=False)
    return loaded


@dataclass(frozen=True)
class Settings:
    host: str
    token: str
    warehouse_id: str
    catalog: str
    bronze_schema: str
    app_schema: str
    app_principal: str

    @classmethod
    def from_env(cls) -> "Settings":
        host = os.getenv("DATABRICKS_HOST", "").strip()
        host = re.sub(r"^https?://", "", host).rstrip("/")
        return cls(
            host=host,
            token=os.getenv("DATABRICKS_TOKEN", "").strip(),
            warehouse_id=os.getenv("DATABRICKS_WAREHOUSE_ID", "").strip(),
            catalog=os.getenv("DATABRICKS_CATALOG", "povo_ai_guidance").strip(),
            bronze_schema=os.getenv("DATABRICKS_SCHEMA", "bronze").strip(),
            app_schema=os.getenv("DATABRICKS_APP_SCHEMA", "app").strip(),
            app_principal=os.getenv("DATABRICKS_APP_PRINCIPAL", "").strip(),
        )

    @property
    def configured(self) -> bool:
        return bool(self.host and self.token and self.warehouse_id)

    @property
    def http_path(self) -> str:
        return f"/sql/1.0/warehouses/{self.warehouse_id}"

    def placeholders(self) -> dict[str, str]:
        return {"catalog": self.catalog, "bronze_schema": self.bronze_schema,
                "app_schema": self.app_schema, "app_principal": self.app_principal}

    def bronze(self, table: str) -> str:
        return f"{self.catalog}.{self.bronze_schema}.{table}"

    def app(self, table: str) -> str:
        return f"{self.catalog}.{self.app_schema}.{table}"


_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def validate_identifiers(s: Settings) -> None:
    """Catalog and schema names are spliced into SQL text, so only plain identifiers are accepted."""
    for name, value in (("DATABRICKS_CATALOG", s.catalog), ("DATABRICKS_SCHEMA", s.bronze_schema),
                        ("DATABRICKS_APP_SCHEMA", s.app_schema)):
        if not _IDENT.match(value):
            raise SystemExit(f"{name}={value!r} is not a plain identifier (letters, digits, underscore)")


# --------------------------------------------------------------------------
# DDL
# --------------------------------------------------------------------------
_PLACEHOLDER = re.compile(r"\$\{(\w+)\}")


def substitute(sql: str, values: dict[str, str]) -> str:
    """Replace ${name} placeholders; an unknown or empty one is an error, not a silent blank."""
    def repl(m: re.Match) -> str:
        v = values.get(m.group(1))
        if not v:
            raise SystemExit(f"placeholder ${{{m.group(1)}}} has no value")
        return v
    return _PLACEHOLDER.sub(repl, sql)


def split_statements(sql: str) -> list[str]:
    """Split a DDL file on ';' at end of line; chunks that are only comments are dropped.

    The DDL files never put ';' inside a string, which keeps this simple.
    """
    out = []
    for chunk in re.split(r";[ \t]*(?:\r?\n|$)", sql):
        body = "\n".join(line for line in chunk.splitlines() if not line.strip().startswith("--")).strip()
        if body:
            out.append(chunk.strip())
    return out


def read_ddl(name: str) -> str:
    return (DDL_DIR / name).read_text(encoding="utf-8")


_TABLE = re.compile(r"CREATE TABLE IF NOT EXISTS \$\{catalog\}\.\$\{(\w+)\}\.(\w+)\s*\((.*?)\)\s*USING DELTA", re.S)
_COLUMN = re.compile(r"^\s*([A-Z_][A-Z0-9_]*)\s+(STRING|INT|BIGINT|DATE|TIMESTAMP|BOOLEAN|DOUBLE)\b")


def parse_tables(ddl_name: str) -> dict[str, list[tuple[str, str]]]:
    """{TABLE: [(COLUMN, TYPE), ...]} in DDL order, for one DDL file."""
    tables: dict[str, list[tuple[str, str]]] = {}
    for m in _TABLE.finditer(read_ddl(ddl_name)):
        cols = [(c.group(1), c.group(2)) for line in m.group(3).splitlines() if (c := _COLUMN.match(line))]
        tables[m.group(2)] = cols
    return tables


def bronze_tables() -> dict[str, list[tuple[str, str]]]:
    return parse_tables("01_bronze_tables.sql")


def app_tables() -> dict[str, list[tuple[str, str]]]:
    """App-schema tables: CFG_BRAND (created first, in 00, as every table references it) and 02."""
    return {**parse_tables("00_catalog_schemas.sql"), **parse_tables("02_app_tables.sql")}


# --------------------------------------------------------------------------
# Connection
# --------------------------------------------------------------------------
def connect(s: Settings):
    """Open a databricks-sql-connector connection (imported lazily so --dry-run needs no packages)."""
    if not s.configured:
        raise SystemExit("DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID must all be set "
                         "(environment or backend/.env)")
    try:
        from databricks import sql
    except ImportError:
        raise SystemExit("databricks-sql-connector is not installed: pip install -r databricks/requirements.txt")
    return sql.connect(server_hostname=s.host, http_path=s.http_path, access_token=s.token)


def run(cursor, statement: str, params: dict | None = None) -> list:
    cursor.execute(statement, params or {})
    try:
        return cursor.fetchall()
    except Exception:  # statements without a result set
        return []


def eprint(*args) -> None:
    print(*args, file=sys.stderr)
