"""IDENTITY_SOURCE=trinity: the Mosaic sign-in gate against bis_prod.bronze_trinity.

A small in-memory SQLite stands in for the Trinity DIM_EMPLOYEE and
DIM_SALES_FORCE_CURR (the directory uses bare table names off Databricks). The
TERR_IDs are the seed territories, so the pages behind the gate have data.
"""
import sqlite3
import threading

import pytest

from tests.conftest import ident
from database.warehouse import Warehouse

EMPLOYEES = [
    # EMP_ID, EMP_USER_ID, first, last, email, status, type, title, dept, TERM_DATE
    (250048, "P250048", "Vincent", "Turano", "vincent.turano@incyte.com", "Active", "OHS", "Territory Manager", "Derm", None),
    (250049, "p250049", "Maria", "Castellano", "m@incyte.com", "Active", "OHS", "Territory Manager", "Derm", "1900-01-01"),
    (250544, "p250544", "Barbara", "Drake", "b@incyte.com", "Active", "OBD", "District Manager", "Derm", None),
    (250600, "p250600", "Gone", "Away", "g@incyte.com", "Active", "OHS", "Territory Manager", "Derm", "2025-01-31"),
    (250601, "p250601", "Not", "Active", "n@incyte.com", "Inactive", "OHS", "Territory Manager", "Derm", None),
    (250602, "p250602", "Leaving", "Soon", "l@incyte.com", "Active", "OHS", "Territory Manager", "Derm", "2027-06-30"),
    (250700, "p250700", "Home", "Office", "h@incyte.com", "Active", "HQ", "Analyst", "Commercial Ops", None),
    (250701, "vturano", "Admin", "User", "a@incyte.com", "Active", "HQ", "Director", "Commercial Ops", None),
    (250800, "p250800", "Other", "Team", "o@incyte.com", "Active", "OHS", "Territory Manager", "Onc", None),
    # Real Trinity territories the seed data does not have.
    (250900, "mcastellano", "Megan", "Castellano", "mc@incyte.com", "Active", "OHS", "Territory Manager", "Derm", None),
    (250901, "p250901", "New", "Hire", "nh@incyte.com", "Active", "OHS", "Territory Manager", "Derm", None),
]
SALES_FORCE = [
    # TEAM_ID, TEAM_NAME, TERR_ID, TERR_NAME, DIST_ID, DIST_NAME, AREA_ID, AREA_NAME, TERR/DIST/AREA_EMP_ID
    (21, "DERM", "NE-POR", "Portland, ME", "D1", "Northeast", "A1", "East", 250048, 250544, 9),
    (21, "DERM", "NE-BOS", "Boston, MA", "D1", "Northeast", "A1", "East", 250049, 250544, 9),
    (21, "DERM", "NE-WOR", "Worcester, MA", "D1", "Northeast", "A1", "East", 250600, 250544, 9),
    (21, "DERM", "NE-HAR", "Hartford, CT", "D1", "Northeast", "A1", "East", 250602, 250544, 9),
    (13, "ONC", "ON-001", "Oncology 1", "D9", "Onc District", "A9", "Onc Area", 250800, 1, 9),
    (21, "DERM", "13101108", "Long Island, NY", "D2", "Metro", "A1", "East", 250900, 7, 9),
    (21, "DERM", "13101109", "Queens, NY", "D2", "Metro", "A1", "East", 250901, 7, 9),
]


class StubTrinity(Warehouse):
    name = "sqlite-stub"

    def __init__(self):
        self.con = sqlite3.connect(":memory:", check_same_thread=False)
        self.lock = threading.Lock()
        self.queries = 0
        self.con.execute("CREATE TABLE DIM_EMPLOYEE (EMP_ID BIGINT, EMP_USER_ID TEXT, EMP_FIRST_NAME TEXT, "
                         "EMP_LAST_NAME TEXT, EMP_WORK_EMAIL TEXT, EMP_STATUS TEXT, EMP_TYPE TEXT, JOB_TITLE TEXT, "
                         "DEPT_NAME TEXT, TERM_DATE TEXT)")
        self.con.execute("CREATE TABLE DIM_SALES_FORCE_CURR (TEAM_ID BIGINT, TEAM_NAME TEXT, TERR_ID TEXT, "
                         "TERR_NAME TEXT, DIST_ID TEXT, DIST_NAME TEXT, AREA_ID TEXT, AREA_NAME TEXT, "
                         "TERR_EMP_ID BIGINT, DIST_EMP_ID BIGINT, AREA_EMP_ID BIGINT)")
        self.con.executemany("INSERT INTO DIM_EMPLOYEE VALUES (?,?,?,?,?,?,?,?,?,?)", EMPLOYEES)
        self.con.executemany("INSERT INTO DIM_SALES_FORCE_CURR VALUES (?,?,?,?,?,?,?,?,?,?,?)", SALES_FORCE)

    def _run(self, sql, params, fetch):
        with self.lock:
            self.queries += 1
            cur = self.con.execute(sql, params or {})
            names = [d[0] for d in cur.description or []]
            return [dict(zip(names, r)) for r in cur.fetchall()] if fetch else None


@pytest.fixture()
def trinity(client, monkeypatch):
    from core.config import get_settings
    from helpers.directory import TrinityDirectory, set_directory

    monkeypatch.setattr(get_settings(), "identity_source", "trinity")
    monkeypatch.setattr(get_settings(), "trinity_brand_teams", "POVO:DERM")
    stub = StubTrinity()
    set_directory(TrinityDirectory(stub))
    yield stub
    set_directory(None)


def _me(client, who, **headers):
    return client.get("/api/v1/me", headers={**ident(who), **headers})


def test_rep_signs_in_with_okta_email(client, trinity):
    """p250048@incyte.com -> p250048 -> EMP_USER_ID (any case) -> territory from DIM_SALES_FORCE_CURR."""
    d = _me(client, "p250048@incyte.com").json()["data"]
    me = d["signed_in"]
    assert (me["employee_id"], me["username"], me["full_name"], me["role_code"]) == \
        ("250048", "p250048", "Vincent Turano", "REP")
    assert me["access_level"] == "Rep level, 1 territory" and me["business_unit"] == "DERM"
    assert d["territory"]["territory_id"] == "NE-POR" and d["brand"]["code"] == "POVO"
    assert "user.impersonate" not in d["permissions"]


@pytest.mark.parametrize("who", ["p250049", "p250602"])  # TERM_DATE sentinel, TERM_DATE in the future
def test_not_terminated(client, trinity, who):
    assert _me(client, who).status_code == 200


@pytest.mark.parametrize("who", [
    "p250600",   # terminated
    "p250601",   # EMP_STATUS Inactive
    "p250700",   # active, but not in the sales force and not an admin
    "p250800",   # in the sales force, on a team that does not sell POVO
    "nobody",    # not in DIM_EMPLOYEE
])
def test_refused(client, trinity, who):
    r = _me(client, who)
    assert r.status_code == 403 and r.json()["message"] == "Your account is not set up for POVO AI Guidance"


def test_district_manager(client, trinity):
    me = _me(client, "p250544").json()["data"]["signed_in"]
    assert me["role_code"] == "MANAGER" and me["access_level"] == "District level, 4 territories"
    assert me["access_regions"] == "Northeast" and me["home_territory_id"] == "NE-BOS"


def test_home_office_admin_views_as_rep(client, trinity):
    """An admin with no sales-force row gets in with no territory, and can "view as" a rep."""
    d = _me(client, "vturano@incyte.com").json()["data"]
    assert d["is_admin"] and d["signed_in"]["access_level"] == "Home office"
    assert d["signed_in"]["home_territory_id"] is None and "user.impersonate" in d["permissions"]
    h = {**ident("vturano"), "X-Impersonate-Employee-Id": "250048"}
    hits = client.get("/api/v1/employees/search?q=turano", headers=ident("vturano")).json()["data"]
    assert [e["employee_id"] for e in hits] == ["250048"]
    assert client.get("/api/v1/employees/search?q=ne-bos", headers=ident("vturano")).json()["data"][0][
        "username"] == "p250049"
    assert client.post("/api/v1/impersonation", json={"employee_id": "250048"}, headers=h).status_code == 200
    seen = _me(client, "vturano", **{"X-Impersonate-Employee-Id": "250048"}).json()["data"]
    assert seen["is_impersonating"] and seen["territory"]["territory_id"] == "NE-POR"
    assert seen["signed_in"]["employee_id"] == "250701"
    assert client.get("/api/v1/admin/brands", headers=ident("vturano")).status_code == 200
    # A terminated rep cannot be viewed.
    assert _me(client, "vturano", **{"X-Impersonate-Employee-Id": "250600"}).status_code == 403


def test_identity_is_cached(client, trinity):
    _me(client, "p250048")
    n = trinity.queries
    _me(client, "P250048@incyte.com")
    _me(client, "nobody")
    m = trinity.queries
    _me(client, "nobody")  # a refusal is cached too
    assert n > 0 and trinity.queries == m and m - n == 1


def test_no_identity_401(client, trinity, monkeypatch):
    from core.config import get_settings

    monkeypatch.setattr(get_settings(), "dev_fallback_username", "")
    r = client.get("/api/v1/me")
    assert r.status_code == 401 and r.json()["message"] == "Missing upstream identity context"


def test_trinity_territory_shown_on_seed_data(client, trinity, monkeypatch):
    """DATA_SOURCE local/sqlite: a Trinity territory the seed lacks maps to seed data."""
    from core.config import get_settings
    from helpers.directory import get_directory

    # The seed employee with the same username keeps their seed territory.
    assert _me(client, "mcastellano").json()["data"]["territory"]["territory_id"] == "NE-BOS"
    # Anyone else: LOCAL_DATA_TERRITORY_ID, else their own (empty) Trinity territory.
    assert _me(client, "p250901").json()["data"]["territory"]["territory_id"] == "13101109"
    monkeypatch.setattr(get_settings(), "local_data_territory_id", "NE-HFD")
    get_directory().clear()  # the earlier answer is cached
    d = _me(client, "p250901").json()["data"]
    assert d["territory"]["territory_id"] == "NE-HFD" and d["territory"]["territory_name"] == "Hartford, CT territory"
    assert d["signed_in"]["full_name"] == "New Hire" and d["signed_in"]["access_level"] == "Rep level, 1 territory"
