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
