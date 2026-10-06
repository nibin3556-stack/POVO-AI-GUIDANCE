"""Multi-brand: brand selection, brand isolation, feature switches and the admin endpoints."""
import pytest

from tests.conftest import ident


def _data(resp, status=200):
    assert resp.status_code == status, resp.text
    return resp.json()["data"]


@pytest.fixture()
def second_brand(rep):
    """vturano also sells brand OPZ: a sales assignment to territory OPZ-01, no other data yet.

    The brand row comes first: DIM_SALES_ASSIGNMENT.BRAND_CODE is a foreign key to CFG_BRAND
    (the pipeline registers a new brand the same way before loading it)."""
    from database.tables import app, bronze
    from database.warehouse import get_warehouse
    from helpers import brands
    from helpers.territory_data import clear_cache

    wh = get_warehouse()
    wh.execute(f"INSERT INTO {app('CFG_BRAND')} (BRAND_CODE, BRAND_NAME, IS_ACTIVE, SORT_ORDER) "
               f"VALUES ('OPZ', 'OPZ', TRUE, 2)")
    wh.execute(f"INSERT INTO {bronze('DIM_SALES_ASSIGNMENT')} (ASSIGNMENT_ID, BRAND_CODE, EMPLOYEE_ID, TERRITORY_ID, "
               f"TERRITORY_NAME, IS_ACTIVE) VALUES (:aid, 'OPZ', :id, 'OPZ-01', 'Opz territory', TRUE)",
               {"aid": f"OPZ|{rep['EMPLOYEE_ID']}", "id": rep["EMPLOYEE_ID"]})
    clear_cache()
    brands.clear_cache()
    yield "OPZ"
    wh.execute(f"DELETE FROM {bronze('DIM_SALES_ASSIGNMENT')} WHERE BRAND_CODE = 'OPZ'")
    for table in ("CFG_BRAND_FEATURE", "APP_AUDIT_LOG", "CFG_BRAND"):
        wh.execute(f"DELETE FROM {app(table)} WHERE BRAND_CODE = 'OPZ'")
    clear_cache()
    brands.clear_cache()


def test_me_carries_brand_features_and_admin(client):
    from registry.features import ALL_CODES

    d = _data(client.get("/api/v1/me", headers=ident("vturano")))
    assert d["brand"] == {"code": "POVO", "name": "POVO"}
    assert d["brands"] == [{"code": "POVO", "name": "POVO"}]
    assert d["features"] == list(ALL_CODES) and d["is_admin"] is True
    assert _data(client.get("/api/v1/me", headers=ident("mcastellano")))["is_admin"] is False


def test_unknown_brand_header_403(client):
    r = client.get("/api/v1/me", headers={**ident("vturano"), "X-Brand-Code": "NOPE"})
    assert r.status_code == 403 and "NOPE" in r.json()["message"]


def test_non_admin_cannot_configure(client):
    assert client.get("/api/v1/admin/brands", headers=ident("mcastellano")).status_code == 403
    assert client.put("/api/v1/admin/brands/POVO/features", json={"features": {"AI_GUIDANCE": False}},
                      headers=ident("mcastellano")).status_code == 403
    assert _data(client.get("/api/v1/admin/me", headers=ident("mcastellano")))["is_admin"] is False


def test_feature_off_hides_endpoint_and_me(client):
    h = ident("vturano")
    assert client.get("/api/v1/performance/guidance", headers=h).status_code == 200
    _data(client.put("/api/v1/admin/brands/POVO/features", json={"features": {"AI_GUIDANCE": False}}, headers=h))
    try:
        r = client.get("/api/v1/performance/guidance", headers=h)
        assert r.status_code == 403 and r.json()["message"] == "This feature is not enabled for the selected brand"
        assert "AI_GUIDANCE" not in _data(client.get("/api/v1/me", headers=h))["features"]
        assert client.get("/api/v1/performance/kpis", headers=h).status_code == 200
    finally:
        _data(client.put("/api/v1/admin/brands/POVO/features", json={"features": {"AI_GUIDANCE": True}}, headers=h))
    assert client.get("/api/v1/performance/guidance", headers=h).status_code == 200


def test_parent_feature_off_turns_children_off(client):
    h = ident("vturano")
    _data(client.put("/api/v1/admin/brands/POVO/features", json={"features": {"PERFORMANCE_TAB": False}}, headers=h))
    try:
        feats = _data(client.get("/api/v1/me", headers=h))["features"]
        assert not {"PERFORMANCE_TAB", "PERFORMANCE_KPIS", "DECILES"} & set(feats)
        assert client.get("/api/v1/performance/kpis", headers=h).status_code == 403
    finally:
        _data(client.put("/api/v1/admin/brands/POVO/features", json={"features": {"PERFORMANCE_TAB": True}},
                         headers=h))


def test_unknown_feature_422(client):
    r = client.put("/api/v1/admin/brands/POVO/features", json={"features": {"FLY": True}}, headers=ident("vturano"))
    assert r.status_code == 422


def test_new_brand_is_registered_with_no_features(client, second_brand):
    h = ident("vturano")
    listed = {b["code"]: b for b in _data(client.get("/api/v1/admin/brands", headers=h))}
    assert listed["OPZ"]["enabled_features"] == 0 and listed["POVO"]["enabled_features"] == listed["POVO"]["feature_count"]
    feats = _data(client.get("/api/v1/admin/brands/OPZ/features", headers=h))["features"]
    assert feats and not any(f["is_enabled"] for f in feats)
    me = _data(client.get("/api/v1/me", headers={**h, "X-Brand-Code": "OPZ"}))
    assert me["brand"]["code"] == "OPZ" and me["features"] == []
    assert me["territory"]["territory_id"] == "OPZ-01"
    assert {b["code"] for b in me["brands"]} == {"POVO", "OPZ"}
    # A feature that is off answers 403 for the new brand, while POVO is unaffected.
    assert client.get("/api/v1/performance/kpis", headers={**h, "X-Brand-Code": "OPZ"}).status_code == 403
    assert client.get("/api/v1/performance/kpis", headers=h).status_code == 200


def test_brands_never_share_data(client, second_brand):
    h = ident("vturano")
    _data(client.put("/api/v1/admin/brands/OPZ/features",
                     json={"features": {"PRE_CALL_TAB": True, "PERFORMANCE_TAB": True, "PERFORMANCE_KPIS": True}},
                     headers=h))
    opz = {**h, "X-Brand-Code": "OPZ"}
    assert _data(client.get("/api/v1/targets", headers=opz)) == []
    assert _data(client.get("/api/v1/targets", headers=h))
    kpis = _data(client.get("/api/v1/performance/kpis", headers=opz))
    assert kpis["cards"] == []  # OPZ has no KPI definitions loaded yet


def test_admin_can_add_and_rename_a_brand(client, second_brand):
    h = ident("vturano")
    saved = _data(client.post("/api/v1/admin/brands", json={"brand_code": "opz", "brand_name": "Opzelura"},
                              headers=h))
    assert saved["code"] == "OPZ" and saved["name"] == "Opzelura" and saved["is_active"]
    me = _data(client.get("/api/v1/me", headers={**h, "X-Brand-Code": "OPZ"}))
    assert me["brand"] == {"code": "OPZ", "name": "Opzelura"}
    assert client.post("/api/v1/admin/brands", json={"brand_code": "_X", "brand_name": "x"},
                       headers=h).status_code == 422
