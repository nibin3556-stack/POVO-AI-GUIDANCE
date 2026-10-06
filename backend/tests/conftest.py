"""Test harness: seed data from the real generator, a temp DuckDB, a fixed "today".

The environment is set BEFORE the app is imported (settings are cached), so
every test runs with DATA_SOURCE=local, AI off (tests that need n8n switch it
on and inject a mock transport), POVO_TODAY_OVERRIDE=2026-10-13 (the POC's
date) and a service token for the jobs endpoints.

The seed CSVs come from databricks/seed/generate_seed_data.py with a fixed
--as-of, so every number the tests assert is deterministic.
"""
import csv
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

AS_OF = "2026-10-13"
_TMP = Path(tempfile.mkdtemp(prefix="povo-tests-"))
SEED_DIR = _TMP / "seed"
SERVICE_TOKEN = "test-service-token-0123456789"

#: Run the whole suite on another engine with POVO_TEST_DATA_SOURCE=sqlite.
DATA_SOURCE = os.environ.get("POVO_TEST_DATA_SOURCE", "local")

os.environ.update({
    "ENVIRONMENT": "testing", "DATA_SOURCE": DATA_SOURCE, "LOCAL_DUCKDB_PATH": str(_TMP / "povo.duckdb"),
    "SQLITE_PATH": str(_TMP / "povo.sqlite"),
    "SEED_OUTPUT_DIR": str(SEED_DIR), "POVO_TODAY_OVERRIDE": AS_OF, "AI_ENABLED": "false", "N8N_BASE_URL": "",
    "POVO_SERVICE_TOKEN": SERVICE_TOKEN, "DEV_FALLBACK_USERNAME": "vturano", "LOG_LEVEL": "WARNING",
    "BRONZE_CACHE_SECONDS": "600",
})

GENERATOR = REPO / "databricks" / "seed" / "generate_seed_data.py"
if GENERATOR.is_file():
    subprocess.run([sys.executable, str(GENERATOR), "--out", str(SEED_DIR), "--as-of", AS_OF],
                   check=True, capture_output=True)


def seed_rows(table: str) -> list[dict]:
    with open(SEED_DIR / f"{table}.csv", newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def ident(username: str) -> dict:
    return {"RStudio-Connect-Credentials": json.dumps({"user": username, "groups": []})}


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def employees():
    """Employees as the app sees them: the person plus their POVO sales assignment (HOME_TERRITORY_ID)."""
    sales = {a["EMPLOYEE_ID"]: a for a in seed_rows("DIM_SALES_ASSIGNMENT")}
    return {e["USERNAME"]: {**e, "HOME_TERRITORY_ID": sales[e["EMPLOYEE_ID"]]["TERRITORY_ID"]}
            for e in seed_rows("DIM_EMPLOYEE")}


@pytest.fixture(scope="session")
def rep(employees):
    return employees["vturano"]


@pytest.fixture(scope="session")
def manager(employees):
    return next(e for e in employees.values() if e["ROLE_CODE"] == "MANAGER")


@pytest.fixture(scope="session")
def other_rep(employees, rep):
    return next(e for e in employees.values() if e["ROLE_CODE"] == "REP" and e["HOME_TERRITORY_ID"] != rep["HOME_TERRITORY_ID"])


@pytest.fixture()
def ai_on(monkeypatch):
    """Switch AI on for one test; the test installs its own transport."""
    from core.config import get_settings
    from helpers import n8n_client

    s = get_settings()
    monkeypatch.setattr(s, "ai_enabled", True)
    monkeypatch.setattr(s, "n8n_base_url", "http://n8n.test")
    yield s
    n8n_client.set_client(None)
