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


def test_submit_keeps_the_ai_verdict_and_ai_checks_unchecked_notes(client, ai_on):
    """A flag only the AI found still blocks Submit, without a second LLM call;
    a note nobody checked yet goes through the AI pass at Submit."""
    phys = _physician(8)
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if request.url.path.endswith("compliance-check"):
            seen.append(body["note"])
            if "better than" in body["note"]:
                return httpx.Response(200, json={"ok": True, "issues": [{"rule_id": "claim", "excerpt": "better than",
                                                                       "why": "Comparative claim"}]})
            return httpx.Response(200, json={"ok": True, "issues": []})
        return httpx.Response(200, json={"ok": False, "reason": "not under test"})

    _mock(handler)
    _clear_cache()
    cid = client.post("/api/v1/calls", json={"hcp_id": phys, "participant_ids": []}).json()["data"]["call_id"]
    m = _prep(client, phys)["points"]
    flagged = "HCP said it works better than her current option"
    items = [{"participant_id": phys, "category": "messaging", "point_id": m[0]["point_id"], "point_rank": 1,
              "point_text": m[0]["text"], "was_raised": True, "reception": 2, "note": flagged},
             {"participant_id": phys, "category": "messaging", "point_id": m[1]["point_id"], "point_rank": 2,
              "point_text": m[1]["text"], "was_raised": True, "reception": 2,
              "note": "HCP agreed to review two HS patients next visit"}]
    assert client.put(f"/api/v1/calls/{cid}/assessments", json={"items": items}).status_code == 200
    chk = client.post("/api/v1/compliance/check", json={
        "call_id": cid, "participant_id": phys, "category": "messaging", "point_id": m[0]["point_id"],
        "point_text": m[0]["text"], "note": flagged}).json()["data"]
    assert chk["engine"] == "rules+llm" and [i["rule_id"] for i in chk["issues"]] == ["claim"]
    seen.clear()

    r = client.post(f"/api/v1/calls/{cid}/next-call")
    assert r.status_code == 409
    assert [f["point_id"] for f in r.json()["data"]["flags"]] == [m[0]["point_id"]]
    assert seen == ["HCP agreed to review two HS patients next visit"]  # the flagged note was not re-sent
    assert r.json()["data"]["flags"][0]["result"]["issues"][0]["rule_id"] == "claim"

    # The AI pass fails on a re-check: the earlier AI verdict on this exact text still shows, not "passed".
    _mock(lambda req: httpx.Response(200, json={"ok": False, "reason": "model_error: bad format"}))
    again = client.post("/api/v1/compliance/check", json={
        "call_id": cid, "participant_id": phys, "category": "messaging", "point_id": m[0]["point_id"],
        "point_text": m[0]["text"], "note": flagged}).json()["data"]
    assert again["status"] == "flagged" and again["check_id"] == chk["check_id"]
    assert again["engine"] == "rules+llm" and [i["rule_id"] for i in again["issues"]] == ["claim"]


def test_ai_incomplete_finding_is_kept(client, ai_on):
    """The rules miss it, the AI calls the note incomplete: the finding stands, with a fix that fits."""
    _mock(lambda r: httpx.Response(200, json={"ok": True, "issues": [
        {"rule_id": "ph", "excerpt": "HCP said the HS data", "why": "The note does not say what the HCP said"},
        {"rule_id": "vague", "excerpt": "x", "why": "only one built-in finding is kept"}]}))
    d = client.post("/api/v1/compliance/check", json={
        "participant_id": _physician(7), "category": "messaging", "point_id": "MSG_EFF_HCP",
        "point_text": "HiSCR50 primary endpoint met", "note": "HCP said the HS data looked strong on the HiSCR50 slide"}
    ).json()["data"]
    assert d["engine"] == "rules+llm" and [i["rule_id"] for i in d["issues"]] == ["ph"]
    assert d["issues"][0]["why"] == "The note does not say what the HCP said"
    assert d["issues"][0]["fix"].startswith("Finish the sentence")


def test_example_notes_come_from_ai_and_never_carry_a_flag(client, ai_on):
    phys = _physician(9)
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={"ok": True, "notes": [
            "HCP liked the HiSCR50 Week 12 data and asked for the lesion and pain slides",
            "HCP said POVO is the best HS option she has seen",          # claim -> dropped
            "HCP will share [patient count] at the next visit",          # placeholder -> dropped
            "HCP liked the HiSCR50 Week 12 data and asked for the lesion and pain slides",  # duplicate
            "HCP agreed to review two HS patients on antibiotics before the next visit"]})

    _mock(handler)
    _clear_cache()
    req = {"participant_id": phys, "category": "messaging",
           "point_text": "HiSCR50 primary endpoint met at Week 12 for POVO in HS", "reception": 2}
    d = client.post("/api/v1/example-notes", json=req).json()["data"]
    assert d["source"] == "ai"
    assert d["notes"] == ["HCP liked the HiSCR50 Week 12 data and asked for the lesion and pain slides",
                          "HCP agreed to review two HS patients on antibiotics before the next visit"]
    body = calls[0]
    assert body["reception"] == "well received" and body["count"] == 3 and body["max_chars"] == 200
    assert body["participant"]["role_type"] == "HCP" and body["point_text"].startswith("HiSCR50")
    # Same request again: served from the cache, no second model call.
    assert client.post("/api/v1/example-notes", json=req).json()["data"]["notes"] == d["notes"]
    assert len(calls) == 1
    # A different reception is a different prediction.
    client.post("/api/v1/example-notes", json={**req, "reception": 0})
    assert len(calls) == 2 and calls[1]["reception"] == "not well received"


def test_example_notes_without_ai_are_empty_not_made_up(client, ai_on):
    _mock(lambda r: httpx.Response(200, json={"ok": False, "reason": "model_error: timeout"}))
    _clear_cache()
    d = client.post("/api/v1/example-notes", json={"participant_id": _physician(9), "category": "closing",
                                                   "point_text": "Agree on two HS patients to start"}).json()["data"]
    assert d == {"notes": [], "source": "none"}


def test_example_notes_with_ai_off(client):
    d = client.post("/api/v1/example-notes", json={"participant_id": _physician(9), "category": "additional"}).json()
    assert d["data"] == {"notes": [], "source": "none"}
