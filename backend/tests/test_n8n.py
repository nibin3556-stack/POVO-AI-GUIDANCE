"""n8n integration: unreachable host and Guard failures fall back to the rules;
valid Guard output is used (and validated again on the backend)."""
import json

import httpx

from database.tables import app
from database.warehouse import get_warehouse
from helpers import n8n_client
from tests.conftest import seed_rows


def _physician(index: int) -> str:
    hcps = [h for h in seed_rows("DIM_HCP") if h["TERRITORY_ID"] == "NE-POR" and h["ROLE_TYPE"] == "HCP"]
    return hcps[index]["HCP_ID"]


def _mock(handler) -> None:
    n8n_client.set_client(httpx.Client(base_url="http://n8n.test", transport=httpx.MockTransport(handler)))


def _prep(client, hcp, cat="messaging"):
    r = client.post("/api/v1/call-prep", json={"hcp_id": hcp, "participant_id": hcp, "category": cat})
    assert r.status_code == 200, r.text
    return r.json()["data"]


def _clear_cache():
    get_warehouse().execute(f"DELETE FROM {app('APP_AI_CACHE')}")


def test_unreachable_n8n_falls_back(client, ai_on, monkeypatch):
    monkeypatch.setattr(ai_on, "n8n_base_url", "http://127.0.0.1:9")
    n8n_client.set_client(None)  # a real client pointed at a closed port
    _clear_cache()
    d = _prep(client, _physician(3))
    assert d["source"] == "rules" and len(d["points"]) == 3
    health = client.get("/health").json()["data"]
    assert health["n8n"] == "error" and health["status"] == "degraded"


def test_guard_failure_falls_back(client, ai_on):
    _clear_cache()
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": False, "reason": "ordered_point_ids not in candidates"})

    _mock(handler)
    d = _prep(client, _physician(4))
    assert d["source"] == "rules"
    body = calls[0]
    assert body["category"] == "messaging" and body["max_points"] == 3 and len(body["candidates"]) == 5
    assert set(body) == {"request_id", "category", "participant", "interactions", "candidates", "max_points"}


def test_invalid_ai_output_is_rejected_by_backend(client, ai_on):
    _clear_cache()
    _mock(lambda r: httpx.Response(200, json={"ok": True, "ordered_point_ids": ["NOT_A_CANDIDATE"],
                                              "insights": {}}))
    assert _prep(client, _physician(5))["source"] == "rules"
    _mock(lambda r: httpx.Response(500, text="boom"))
    assert _prep(client, _physician(5))["source"] == "rules"


def test_valid_ai_output_orders_points_and_is_cached(client, ai_on):
    _clear_cache()
    hcp = _physician(6)
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        seen.append(body)
        ids = [c["point_id"] for c in body["candidates"]]
        return httpx.Response(200, json={"ok": True, "ordered_point_ids": [ids[3], ids[0], ids[1]],
                                         "insights": {ids[3]: "Asked about selectivity at the last program"}})

    _mock(handler)
    d = _prep(client, hcp)
    ids = [c["point_id"] for c in seen[0]["candidates"]]
    assert d["source"] == "ai" and [p["point_id"] for p in d["points"]] == [ids[3], ids[0], ids[1]]
    assert d["points"][0]["detail"] == "Asked about selectivity at the last program"
    assert d["points"][0]["text"] == seen[0]["candidates"][3]["text"]  # approved text never changes
    again = _prep(client, hcp)
    assert len(seen) == 1 and again["points"] == d["points"]  # served from APP_AI_CACHE

    # Objection requests come back with insights: {} and keep the approved responses.
    def obj_handler(request):
        body = json.loads(request.content)
        return httpx.Response(200, json={"ok": True, "ordered_point_ids": [body["candidates"][2]["point_id"]],
                                         "insights": {}})
    _mock(obj_handler)
    o = _prep(client, hcp, "objection")
    assert o["source"] == "ai" and o["points"][0]["detail_label"] == "Response"


def test_compliance_llm_can_add_but_never_remove(client, ai_on):
    phys = _physician(7)

    def handler(request):
        body = json.loads(request.content)
        assert body["allowed_rule_ids"] and body["rule_findings"][0]["rule_id"] == "ae"
        return httpx.Response(200, json={"ok": True, "issues": [{"rule_id": "claim", "excerpt": "works great",
                                                                   "why": "Implied efficacy claim"},
                                                                  {"rule_id": "made_up", "excerpt": "x", "why": "y"}],
                                         "suggested_text": "Safety information reported to Pharmacovigilance."})

    _mock(handler)
    r = client.post("/api/v1/compliance/check", json={
        "participant_id": phys, "category": "messaging", "point_id": "MSG_EFF_HCP",
        "point_text": "HiSCR50 primary endpoint met", "note": "Patient developed a rash on another JAK"})
    d = r.json()["data"]
    assert d["engine"] == "rules+llm"
    assert [i["rule_id"] for i in d["issues"]] == ["ae", "claim"]
    assert d["suggested_text"] == "Safety information reported to Pharmacovigilance."


def test_compliance_guard_failure_keeps_rules(client, ai_on):
    _mock(lambda r: httpx.Response(200, json={"ok": False, "reason": "rule id outside the allowed list"}))
    r = client.post("/api/v1/compliance/check", json={
        "participant_id": _physician(7), "category": "messaging", "point_id": "MSG_EFF_HCP",
        "point_text": "HiSCR50 primary endpoint met", "note": "Patient developed a rash on another JAK"})
    d = r.json()["data"]
    assert d["engine"] == "rules" and d["issues"][0]["rule_id"] == "ae"
