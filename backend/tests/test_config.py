"""Production must refuse local data, seed-data sign-in, missing Databricks config and a default token."""
import pytest
from pydantic import ValidationError

from core.config import Settings

GOOD = dict(environment="production", data_source="databricks", databricks_host="adb-1.2.azuredatabricks.net",
            databricks_token="dapi-x", databricks_warehouse_id="/sql/1.0/warehouses/abc123",
            povo_service_token="a-long-random-token", povo_today_override=None, identity_source="trinity")


def test_valid_production_settings():
    s = Settings(**GOOD)
    assert s.databricks_http_path == "/sql/1.0/warehouses/abc123"


@pytest.mark.parametrize("override", [
    {"data_source": "local"},
    {"databricks_token": None},
    {"povo_service_token": ""},
    {"povo_service_token": "change-me"},
    {"povo_today_override": "2026-10-13"},
    {"identity_source": "app"},
    # SQLite app data is allowed, but Trinity sign-in still needs the Databricks connection.
    {"data_source": "sqlite", "databricks_host": None},
])
def test_production_refusals(override):
    with pytest.raises(ValidationError, match="Refusing to start in production"):
        Settings(**{**GOOD, **override})


def test_brand_teams():
    s = Settings(trinity_brand_teams="povo: Derm East | Derm West ,OPZ:21,bad")
    assert s.brand_teams == {"POVO": {"DERM EAST", "DERM WEST"}, "OPZ": {"21"}}
    assert Settings(trinity_brand_teams="").brand_teams == {}


def test_dev_fallback_never_on_posit(monkeypatch):
    """ENVIRONMENT=development on Posit: no header must stay anonymous, not DEV_FALLBACK_USERNAME."""
    s = Settings(environment="development", dev_fallback_username="vturano")
    monkeypatch.delenv("CONNECT_CONTENT_GUID", raising=False)
    monkeypatch.delenv("RSTUDIO_PRODUCT", raising=False)
    assert s.dev_fallback_active
    monkeypatch.setenv("CONNECT_CONTENT_GUID", "87558405-8bf8-4b52-9725-9435787502cb")
    assert not s.dev_fallback_active


def test_data_source_none_writes_nothing(tmp_path):
    """Sign-in only: empty in-memory tables, no database file."""
    from database.warehouse import LocalWarehouse

    s = Settings(data_source="none", local_duckdb_path=str(tmp_path / "x" / "povo.duckdb"),
                 seed_output_dir=str(tmp_path))
    wh = LocalWarehouse(s)
    assert wh.name == "none" and wh.loaded_tables == []
    assert wh.query("SELECT COUNT(*) AS n FROM povo_ai_guidance.bronze.DIM_HCP") == [{"n": 0}]
    wh.close()
    assert not (tmp_path / "x").exists()
