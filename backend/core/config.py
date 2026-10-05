"""Typed application settings: every environment variable is declared here.

Secrets (the Databricks token, the service token) come only from the
environment or the gitignored .env / .env.local files. They are never logged
and never returned by any endpoint.

THE IMPORTANT RULE IN THIS FILE is `_refuse_unsafe_production()`. The app can
run on a laptop from a DuckDB file and a dev fallback identity; neither may ever
answer in production. A misconfiguration that would serve dummy data or skip
the service-token check must stop the process at startup, not quietly serve
(the same stance as XR-CONVERSION's config.py).
"""
from __future__ import annotations

from datetime import date
from functools import lru_cache
from os import path
from typing import Annotated, Literal, Optional

from dotenv import load_dotenv
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

#: backend/ resolved from THIS file, not from the working directory. Posit
#: Connect starts the app from its own content directory, so a CWD-relative
#: ".env" would silently not be found and every setting would fall back to dev
#: defaults (Mosaic learned this the hard way).
BACKEND_DIR = path.dirname(path.dirname(path.abspath(__file__)))
REPO_DIR = path.dirname(BACKEND_DIR)
_ENV_FILE = path.join(BACKEND_DIR, ".env")
#: Per-machine overrides on top of .env; never committed.
_ENV_LOCAL_FILE = path.join(BACKEND_DIR, ".env.local")

# .env first, then .env.local wins. Real process environment variables (Posit,
# CI, tests) still outrank both inside Settings: pydantic's normal precedence.
load_dotenv(_ENV_FILE)
load_dotenv(_ENV_LOCAL_FILE, override=True)

#: Values that must never be accepted as the production service token.
_DEFAULT_TOKENS = {"", "change-me", "changeme", "dev-token", "povo-dev-service-token"}

APP_VERSION = "1.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_ENV_FILE, _ENV_LOCAL_FILE), env_file_encoding="utf-8", extra="ignore"
    )

    # --- App -----------------------------------------------------------------
    environment: Literal["development", "production", "testing"] = "development"
    debug: bool = False
    app_name: str = "POVO AI Guidance"
    log_level: str = "INFO"
    # NoDecode: read the raw comma-separated string instead of expecting JSON.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5175"]
    #: Roles allowed to impersonate (DIM_EMPLOYEE.ROLE_CODE, comma-separated).
    #: The POC offers "Impersonate user" to the signed-in rep, so reps and
    #: managers both have it by default; set e.g. MANAGER to restrict it.
    impersonation_roles: Annotated[list[str], NoDecode] = ["REP", "MANAGER"]
    app_timezone: str = "America/New_York"
    dev_fallback_username: str = "vturano"
    posit_identity_header: str = "RStudio-Connect-Credentials"
    #: Pins "today" (YYYY-MM-DD) so tests and demos are deterministic.
    #: Refused in production: the real app always runs on the real date.
    povo_today_override: Optional[date] = None

    # --- Data ----------------------------------------------------------------
    #: local = DuckDB file (bronze reloaded from the seed CSVs at every start),
    #: sqlite = one SQLite file that keeps all its data (the interim database
    #: until Databricks is connected), databricks = the SQL warehouse.
    data_source: Literal["local", "sqlite", "databricks"] = "local"
    local_duckdb_path: str = path.join(BACKEND_DIR, ".localdata", "povo.duckdb")
    sqlite_path: str = path.join(BACKEND_DIR, ".localdata", "povo.sqlite")
    seed_output_dir: str = path.join(REPO_DIR, "databricks", "seed", "output")
    #: The backend owns the content JSON; the loader falls back to it when the
    #: REF_ content tables are empty (before the seeder has run).
    content_dir: str = path.join(REPO_DIR, "databricks", "seed", "content")
    bronze_cache_seconds: int = 600

    databricks_host: Optional[str] = None
    databricks_token: Optional[str] = None
    databricks_warehouse_id: Optional[str] = None
    databricks_catalog: str = "povo_ai_guidance"
    databricks_schema: str = "bronze"
    databricks_app_schema: str = "app"
    databricks_pool_size: int = 4

    # --- AI and n8n ----------------------------------------------------------
    ai_enabled: bool = True
    n8n_base_url: Optional[str] = None
    n8n_call_prep_path: str = "/webhook/povo-call-prep"
    n8n_compliance_path: str = "/webhook/povo-compliance-check"
    n8n_next_call_path: str = "/webhook/povo-next-call"
    n8n_example_notes_path: str = "/webhook/povo-example-notes"
    n8n_timeout_seconds: float = 60.0
    ai_cache_hours: int = 24
    povo_service_token: str = ""

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value):
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @field_validator("impersonation_roles", mode="before")
    @classmethod
    def _split_roles(cls, value):
        if isinstance(value, str):
            return [r.strip().upper() for r in value.split(",") if r.strip()]
        return [str(r).upper() for r in value]

    @field_validator("povo_today_override", "n8n_base_url", "databricks_host",
                     "databricks_token", "databricks_warehouse_id", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        # An empty line in .env ("POVO_TODAY_OVERRIDE=") means "not set".
        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="after")
    def _refuse_unsafe_production(self) -> "Settings":
        if self.environment != "production":
            return self
        problems = []
        if self.data_source == "local":
            problems.append("DATA_SOURCE=local serves dummy data from a DuckDB file")
        if self.data_source == "databricks" and not (
                self.databricks_host and self.databricks_token and self.databricks_warehouse_id):
            problems.append("DATABRICKS_HOST, DATABRICKS_TOKEN and DATABRICKS_WAREHOUSE_ID are required")
        if self.povo_service_token.strip().lower() in _DEFAULT_TOKENS:
            problems.append("POVO_SERVICE_TOKEN is empty or a default value")
        if self.povo_today_override is not None:
            problems.append("POVO_TODAY_OVERRIDE is for development and tests only")
        if problems:
            raise ValueError("Refusing to start in production: " + "; ".join(problems))
        return self

    # --- Derived ---------------------------------------------------------------
    @property
    def databricks_http_path(self) -> str:
        """Accepts the bare warehouse id or a pasted /sql/1.0/warehouses/<id> path."""
        raw = (self.databricks_warehouse_id or "").strip()
        if "/warehouses/" in raw:
            raw = raw.rsplit("/warehouses/", 1)[1].strip("/")
        return f"/sql/1.0/warehouses/{raw}"

    @property
    def databricks_hostname(self) -> str:
        host = (self.databricks_host or "").strip()
        for prefix in ("https://", "http://"):
            if host.startswith(prefix):
                host = host[len(prefix):]
        return host.split("/")[0]

    @property
    def ai_active(self) -> bool:
        return bool(self.ai_enabled and self.n8n_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
