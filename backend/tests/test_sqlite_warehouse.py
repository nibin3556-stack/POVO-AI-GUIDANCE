"""SQLite engine: types survive the round trip, MERGE upserts, and a filled
database is never overwritten from the CSVs (it IS the database)."""
from datetime import date, datetime, timezone

import pytest

from core.config import get_settings
from database import tables, warehouse
from tests.conftest import SEED_DIR, seed_rows


@pytest.fixture()
def sqlite_wh(tmp_path, monkeypatch):
    s = get_settings().model_copy(update={"data_source": "sqlite", "sqlite_path": str(tmp_path / "t.sqlite"),
                                          "seed_output_dir": str(SEED_DIR)})
    monkeypatch.setattr(tables, "get_settings", lambda: s)
    wh = warehouse.SqliteWarehouse(s)
    yield wh, s
    wh.close()


def test_bronze_filled_from_csv_with_real_types(sqlite_wh):
    wh, _ = sqlite_wh
    assert set(wh.loaded_tables) == set(tables.BRONZE_COLUMNS)
    for table in ("DIM_HCP", "FCT_INTERACTION", "REF_KPI_METRIC"):
        assert wh.query(f"SELECT COUNT(*) AS N FROM {tables.bronze(table)}")[0]["N"] == len(seed_rows(table))
    zips = {r["ZIP"] for r in seed_rows("DIM_ACCOUNT")}
    assert any(z.startswith("0") for z in zips)
    assert {r["ZIP"] for r in wh.query("SELECT ZIP FROM DIM_ACCOUNT")} == zips  # leading zeros kept
    row = wh.query("SELECT INTERACTION_DATE, POVO_DISCUSSED FROM FCT_INTERACTION LIMIT 1")[0]
    assert isinstance(row["INTERACTION_DATE"], date) and isinstance(row["POVO_DISCUSSED"], bool)


def test_insert_merge_and_list_params(sqlite_wh):
    wh, _ = sqlite_wh
    now = datetime(2026, 10, 1, 14, 30, tzinfo=timezone.utc)
    base = {"CALL_ID": "C1", "TERRITORY_ID": "NE-POR", "REP_EMPLOYEE_ID": "p1", "ACTED_BY_EMPLOYEE_ID": "p1",
            "HCP_ID": "H000001", "CALL_DATE": date(2026, 10, 1), "PARTICIPANT_IDS": '["H000001"]',
            "STATUS": "planned", "REVISION_NO": 0, "CREATED_AT": now, "UPDATED_AT": now}
    wh.insert("APP_CALL", [base])
    wh.merge("APP_CALL", ["CALL_ID"], [{**base, "STATUS": "assessed", "REVISION_NO": 1}])
    rows = wh.query("SELECT * FROM APP_CALL WHERE CALL_ID IN (:ids)", {"ids": ["C1", "C2"]})
    assert len(rows) == 1 and rows[0]["STATUS"] == "assessed" and rows[0]["REVISION_NO"] == 1
    assert rows[0]["CALL_DATE"] == date(2026, 10, 1)
    assert rows[0]["CREATED_AT"] == datetime(2026, 10, 1, 14, 30)  # naive UTC, as DuckDB returns it
    assert wh.query("SELECT COUNT(*) AS N FROM APP_CALL WHERE CREATED_AT < :t", {"t": now})[0]["N"] == 0


def test_existing_data_is_never_overwritten(sqlite_wh):
    wh, s = sqlite_wh
    wh.execute("UPDATE DIM_TERRITORY SET REGION = 'Edited' WHERE TERRITORY_ID = 'NE-POR'")
    wh.close()
    again = warehouse.SqliteWarehouse(s)
    try:
        assert again.loaded_tables == []
        assert again.query("SELECT REGION FROM DIM_TERRITORY WHERE TERRITORY_ID = 'NE-POR'")[0]["REGION"] == "Edited"
    finally:
        again.close()
