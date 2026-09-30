"""Production must refuse local data, missing Databricks config and a default token."""
import pytest
from pydantic import ValidationError

from core.config import Settings

GOOD = dict(environment="production", data_source="databricks", databricks_host="adb-1.2.azuredatabricks.net",
            databricks_token="dapi-x", databricks_warehouse_id="/sql/1.0/warehouses/abc123",
            povo_service_token="a-long-random-token", povo_today_override=None)


def test_valid_production_settings():
    s = Settings(**GOOD)
    assert s.databricks_http_path == "/sql/1.0/warehouses/abc123"


@pytest.mark.parametrize("override", [
    {"data_source": "local"},
    {"databricks_token": None},
    {"povo_service_token": ""},
    {"povo_service_token": "change-me"},
    {"povo_today_override": "2026-10-13"},
])
def test_production_refusals(override):
    with pytest.raises(ValidationError, match="Refusing to start in production"):
        Settings(**{**GOOD, **override})
