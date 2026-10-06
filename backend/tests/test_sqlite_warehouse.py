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
    for table in ("DIM_HCP", "FCT_INTERACTION", "REF_INTERACTION_CHANNEL", "DIM_SALES_ASSIGNMENT"):
        assert wh.query(f"SELECT COUNT(*) AS N FROM {tables.bronze(table)}")[0]["N"] == len(seed_rows(table))
    zips = {r["ZIP"] for r in seed_rows("DIM_ACCOUNT")}
    assert any(z.startswith("0") for z in zips)
    assert {r["ZIP"] for r in wh.query("SELECT ZIP FROM DIM_ACCOUNT")} == zips  # leading zeros kept
    row = wh.query("SELECT INTERACTION_DATE, BRAND_DISCUSSED FROM FCT_INTERACTION LIMIT 1")[0]
    assert isinstance(row["INTERACTION_DATE"], date) and isinstance(row["BRAND_DISCUSSED"], bool)


def test_insert_merge_and_list_params(sqlite_wh):
    wh, _ = sqlite_wh
    now = datetime(2026, 10, 1, 14, 30, tzinfo=timezone.utc)
    base = {"CALL_ID": "C1", "BRAND_CODE": "POVO", "TERRITORY_ID": "NE-POR", "REP_EMPLOYEE_ID": "p1", "ACTED_BY_EMPLOYEE_ID": "p1",
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
    wh.execute("UPDATE DIM_SALES_ASSIGNMENT SET REGION = 'Edited' WHERE TERRITORY_ID = 'NE-POR'")
    wh.close()
    again = warehouse.SqliteWarehouse(s)
    try:
        assert again.loaded_tables == []
        assert again.query("SELECT REGION FROM DIM_SALES_ASSIGNMENT WHERE TERRITORY_ID = 'NE-POR'")[0]["REGION"] == "Edited"
    finally:
        again.close()


def test_keys_single_primary_key_and_brand_foreign_key(sqlite_wh):
    """Every table: one primary-key column, never BRAND_CODE; BRAND_CODE references CFG_BRAND and is enforced."""
    import sqlite3

    wh, _ = sqlite_wh
    for table in tables.ALL_COLUMNS:
        info = wh.query(f"SELECT name, pk FROM pragma_table_info('{table}') WHERE pk > 0")
        assert [r["name"] for r in info] == [tables.PRIMARY_KEYS[table]], table
        if table != "CFG_BRAND":
            assert tables.PRIMARY_KEYS[table] != "BRAND_CODE"
            fks = wh.query(f"SELECT \"from\" AS col, \"table\" AS ref FROM pragma_foreign_key_list('{table}')")
            assert fks == [{"col": "BRAND_CODE", "ref": "CFG_BRAND"}], table
    assert {r["BRAND_CODE"] for r in wh.query("SELECT BRAND_CODE FROM CFG_BRAND")} == {"POVO"}
    with pytest.raises(sqlite3.IntegrityError):  # unknown brand
        wh.execute("INSERT INTO REF_HOLIDAY (HOLIDAY_ID, BRAND_CODE, HOLIDAY_DATE) VALUES ('X|2026-01-01', 'X', '2026-01-01')")
    with pytest.raises(sqlite3.IntegrityError):  # brand still referenced
        wh.execute("DELETE FROM CFG_BRAND WHERE BRAND_CODE = 'POVO'")
    # Upserting the brand master never deletes it, so it works while rows reference it.
    wh.merge("CFG_BRAND", ["BRAND_CODE"], [{"BRAND_CODE": "POVO", "BRAND_NAME": "Povorcitinib", "IS_ACTIVE": True}])
    assert wh.query("SELECT BRAND_NAME FROM CFG_BRAND")[0]["BRAND_NAME"] == "Povorcitinib"
