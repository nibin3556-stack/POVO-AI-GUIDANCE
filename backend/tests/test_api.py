"""End-to-end API tests on the seeded local warehouse (today = 2026-10-13)."""
import uuid

import pytest

from helpers.dates import js_round

from tests.conftest import DATA_SOURCE, SERVICE_TOKEN, ident, seed_rows

ENVELOPE = {"data", "status", "message", "page", "limit", "total_pages", "total_items"}


def _data(resp, status=200):
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == ENVELOPE
    return body["data"]


# --- health, envelope, middleware ------------------------------------------
def test_health(client):
    d = _data(client.get("/health"))
    assert d["data_source"] == DATA_SOURCE and d["warehouse"] == "ok" and d["n8n"] == "disabled"


def test_request_id_echo_and_security_headers(client):
    rid = str(uuid.uuid4())
    r = client.get("/health", headers={"X-Request-ID": rid})
    assert r.headers["X-Request-ID"] == rid
    assert r.headers["X-Content-Type-Options"] == "nosniff" and r.headers["X-Frame-Options"] == "DENY"
    bad = client.get("/health", headers={"X-Request-ID": "not-a-uuid"})
    assert bad.headers["X-Request-ID"] != "not-a-uuid"
    assert uuid.UUID(bad.headers["X-Request-ID"]).version == 4


def test_error_envelope(client, rep):
    r = client.get("/api/v1/targets?sort=bogus:desc", headers=ident("vturano"))
    body = r.json()
    assert r.status_code == 422 and set(body) == ENVELOPE and body["data"] is None and body["status"] == 422


# --- identity, 403, impersonation ------------------------------------------
def test_me_dev_fallback(client, rep):
    d = _data(client.get("/api/v1/me"))  # no header outside production -> DEV_FALLBACK_USERNAME
    assert d["signed_in"]["username"] == "vturano" and not d["is_impersonating"]
    assert d["territory"]["territory_id"] == rep["HOME_TERRITORY_ID"] == "NE-POR"
    assert d["today"] == "2026-10-13" and d["data_as_of"] <= "2026-10-13"
    assert d["permissions"] == ["guidance.view", "call.assess", "user.impersonate"]


def test_plain_username_and_email_header(client, rep):
    assert _data(client.get("/api/v1/me", headers={"RStudio-Connect-Credentials": "vturano"}))["signed_in"][
        "employee_id"] == rep["EMPLOYEE_ID"]
    assert _data(client.get("/api/v1/me", headers={"RStudio-Connect-Credentials": rep["EMAIL"]}))["signed_in"][
        "employee_id"] == rep["EMPLOYEE_ID"]


def test_unknown_user_403(client):
    r = client.get("/api/v1/me", headers=ident("nobody"))
    assert r.status_code == 403 and r.json()["message"] == "Your account is not set up for POVO AI Guidance"


def test_admin_rep_impersonates(client, rep, other_rep):
    """vturano is a rep in the admin users file: admins impersonate whatever their role."""
    h = {**ident("vturano"), "X-Impersonate-Employee-Id": other_rep["EMPLOYEE_ID"]}
    me = _data(client.get("/api/v1/me", headers=h))
    assert me["is_impersonating"] and me["signed_in"]["username"] == "vturano"
    assert me["effective"]["employee_id"] == other_rep["EMPLOYEE_ID"]
    assert me["territory"]["territory_id"] == other_rep["HOME_TERRITORY_ID"] != rep["HOME_TERRITORY_ID"]
    own = _data(client.get("/api/v1/targets/must-wins", headers=ident("vturano")))
    theirs = _data(client.get("/api/v1/targets/must-wins", headers=h))
    assert own["territory_name"] != theirs["territory_name"]
    assert {t["hcp_id"] for t in own["hs_volume"]}.isdisjoint({t["hcp_id"] for t in theirs["hs_volume"]})


def test_non_admin_cannot_impersonate(client, rep):
    """Only the admin users file grants impersonation: not a role, not a brand feature."""
    for username in ("mcastellano", "rsutherland"):  # a rep and a manager, neither an admin
        assert "user.impersonate" not in _data(client.get("/api/v1/me", headers=ident(username)))["permissions"]
    h = {**ident("mcastellano"), "X-Impersonate-Employee-Id": rep["EMPLOYEE_ID"]}
    assert client.get("/api/v1/me", headers=h).status_code == 403
    assert client.get("/api/v1/employees/search?q=da", headers=ident("mcastellano")).status_code == 403
    assert client.post("/api/v1/impersonation", json={"employee_id": rep["EMPLOYEE_ID"]},
                       headers=ident("mcastellano")).status_code == 403


def test_manager_impersonates_and_scope_follows(client, manager, rep, other_rep):
    mh = ident(manager["USERNAME"])
    me = _data(client.get("/api/v1/me", headers=mh))
    assert "user.impersonate" in me["permissions"]
    hits = _data(client.get("/api/v1/employees/search?q=turano", headers=mh))
    assert hits[0]["employee_id"] == rep["EMPLOYEE_ID"]
    assert _data(client.get(f"/api/v1/employees/search?q={rep['NETWORK_ID']}", headers=mh))[0]["username"] == "vturano"
    started = _data(client.post("/api/v1/impersonation", json={"employee_id": other_rep["EMPLOYEE_ID"]}, headers=mh))
    assert started["employee_id"] == other_rep["EMPLOYEE_ID"]
    h = {**mh, "X-Impersonate-Employee-Id": other_rep["EMPLOYEE_ID"]}
    me2 = _data(client.get("/api/v1/me", headers=h))
    assert me2["is_impersonating"] and me2["territory"]["territory_id"] == other_rep["HOME_TERRITORY_ID"]
    assert me2["signed_in"]["employee_id"] == manager["EMPLOYEE_ID"]
    mw = _data(client.get("/api/v1/targets/must-wins", headers=h))
    terr_hcps = {r["HCP_ID"] for r in seed_rows("DIM_HCP") if r["TERRITORY_ID"] == other_rep["HOME_TERRITORY_ID"]}
    assert all(t["hcp_id"] in terr_hcps for t in mw["hs_volume"] + mw["hs_jak"])
    _data(client.delete("/api/v1/impersonation", headers=h))
    assert client.post("/api/v1/impersonation", json={"employee_id": "p999999"}, headers=mh).status_code == 404


# --- performance ------------------------------------------------------------
def test_kpis_shape_and_consistency(client):
    for period, label in (("month", "October"), ("quarter", "Oct – Dec"), ("ytd", "Jul – Dec")):
        d = _data(client.get(f"/api/v1/performance/kpis?period={period}"))
        assert d["period_label"] == label and d["data_start"] == "2026-07-01"
        assert [c["metric_code"] for c in d["cards"]] == ["PEF", "NEW_PATIENTS"]
        for c in d["cards"]:
            assert c["yet_to_achieve"] == max(0, c["goal"] - c["achieved"])
            assert c["status"] == ("on_track" if c["achieved"] >= c["due_to_date"] else "at_risk")
        split = d["cards"][1]["split"]
        assert split["total"] == split["paid"] + split["bridge"] + split["free_trial"]
        assert split["paid"] == split["new_patients"] + split["continuing_patients"]
        assert split["paid_pct"] + split["bridge_pct"] + split["free_trial_pct"] == 100
        assert split["new_patients"] == d["cards"][1]["achieved"]
    assert _data(client.get("/api/v1/performance/kpis?period=month"))["remaining_working_days"] == 13
    assert client.get("/api/v1/performance/kpis?period=week").status_code == 422


def test_ytd_counts_the_data_window_only(client):
    d = _data(client.get("/api/v1/performance/kpis?period=ytd"))
    rows = [a for a in seed_rows("FCT_BRAND_ACTIVITY") if a["TERRITORY_ID"] == "NE-POR"]
    assert all(a["EVENT_DATE"] >= "2026-07-01" for a in rows)
    n = sum(1 for a in rows if a["EVENT_TYPE"] == "NEW_PATIENT" and a["EVENT_DATE"] <= "2026-10-13")
    pefs = sum(1 for a in rows if a["EVENT_TYPE"] == "PEF" and a["EVENT_DATE"] <= "2026-10-13")
    assert d["cards"][1]["achieved"] == n and d["cards"][0]["achieved"] == pefs >= n
    assert d["cards"][1]["split"]["continuing_patients"] == 0  # Year to Date starts at the data start
    q = _data(client.get("/api/v1/performance/kpis?period=quarter"))
    assert d["cards"][1]["goal"] >= q["cards"][1]["goal"]


def test_pefs_per_target_add_up_to_the_pef_card(client):
    d = _data(client.get("/api/v1/performance/kpis?period=ytd"))
    targets = _data(client.get("/api/v1/targets?limit=200"))
    mw = _data(client.get("/api/v1/targets/must-wins"))
    every = {t["hcp_id"]: t for t in targets + mw["hs_volume"] + mw["hs_jak"]}
    assert all(t["pef"] >= t["povo_patients"] for t in every.values())
    assert sum(t["pef"] for t in every.values()) == d["cards"][0]["achieved"]


def test_guidance(client):
    d = _data(client.get("/api/v1/performance/guidance"))
    assert d["source"] == "live" and len(d["focus"]) == 3 and len(d["missed"]) <= 2
    assert all(m["days_since_call"] > 21 and m["tier_code"] in ("SH", "MED") for m in d["missed"])
    scores = [f["score"] for f in d["focus"]]
    assert scores == sorted(scores, reverse=True)


def test_segmentation_deciles_writers(client):
    s = _data(client.get("/api/v1/performance/segmentation"))
    assert s["total_targets"] == sum(x["hcp_count"] for x in s["segments"])
    assert [x["segment_code"] for x in s["segments"]] == ["imm", "exp", "conv"]
    assert sum(x["pct"] for x in s["segments"]) == 100
    for x in s["segments"]:
        f = x["funnel"]
        assert x["hcp_count"] >= f["reached"] >= f["writers"] >= f["adopters"]
        assert x["penetration_pct"] == js_round(f["povo_patients"] / f["hs_patients"] * 100)
    writers = sum(x["funnel"]["writers"] for x in s["segments"])
    assert writers == s["total_targets"] - s["not_writing"]

    dz = _data(client.get("/api/v1/performance/deciles"))
    assert [r["decile"] for r in dz["rows"]] == list(range(10, 1, -1))
    assert [t["tier_code"] for t in dz["tiers"]] == ["SH", "MED", "LOW"]
    assert sum(r["targets"] for r in dz["rows"]) == s["total_targets"]
    for r in dz["rows"]:
        assert r["reached"] >= r["writers"]  # a new POVO writer has always been called
        tier = next(t for t in dz["tiers"] if t["tier_code"] == r["tier_code"])
        assert r["frequency_goal"] == tier["frequency_goal"] and r["reach_goal_pct"] == tier["reach_goal_pct"]
        assert r["avg_frequency"] is None or r["avg_frequency"] == js_round(r["calls"] / r["reached"] * 10) / 10

    m = _data(client.get("/api/v1/performance/new-writers?grain=month"))
    assert [b["label"] for b in m["buckets"]] == ["Jul", "Aug", "Sep", "Oct"] and m["buckets"][-1]["is_partial"]
    assert m["range_label"] == "Jul 1 – Oct 13, 2026" and m["segment_codes"] == ["imm", "exp", "conv"]
    assert m["total"] == writers == sum(sum(b["segments"].values()) for b in m["buckets"])
    w = _data(client.get("/api/v1/performance/new-writers?grain=week"))
    assert len(w["buckets"]) == 6 and w["buckets"][-1]["end_date"] == "2026-10-13"
    assert w["x_axis_label"] == "Week ending Friday, 2026" and w["range_label"].startswith("last 6 weeks, ")


# --- targets and accounts -----------------------------------------------------
def test_targets_pagination_sort_filters(client):
    r = client.get("/api/v1/targets?limit=5")
    body = r.json()
    assert body["page"] == 1 and body["limit"] == 5 and len(body["data"]) == 5 and body["total_items"] > 5
    hs = [t["hs_patients"] for t in body["data"]]
    assert hs == sorted(hs, reverse=True)
    assert all(t["is_in_call_plan"] and not t["is_must_win"] and t["decile"] >= 2 for t in body["data"])
    assert client.get("/api/v1/targets?limit=201").status_code == 422
    assert client.get("/api/v1/targets?sort=npi:asc").status_code == 422
    asc = _data(client.get("/api/v1/targets?sort=decile:asc&limit=200"))
    assert [t["decile"] for t in asc] == sorted(t["decile"] for t in asc) and asc[0]["decile"] == 2
    pef = [t["pef"] for t in _data(client.get("/api/v1/targets?sort=pef:desc&limit=200"))]
    assert pef == sorted(pef, reverse=True)
    pa = _data(client.get("/api/v1/targets?role=PA&limit=200"))
    assert pa and all(t["role_type"] == "PA" for t in pa)
    facets = _data(client.get("/api/v1/targets/facets"))
    assert sum(f["count"] for f in facets["role"]) == body["total_items"]


def test_must_wins(client):
    d = _data(client.get("/api/v1/targets/must-wins"))
    assert len(d["hs_volume"]) == 5 and len(d["hs_jak"]) == 5
    assert all(t["jak_patients"] == 0 for t in d["hs_volume"]) and all(t["jak_patients"] > 0 for t in d["hs_jak"])


def test_accounts(client):
    body = client.get("/api/v1/accounts?limit=50").json()
    rows = body["data"]
    assert any(a["is_claims_only"] for a in rows)
    acc = next(a for a in rows if not a["is_claims_only"])
    targets = _data(client.get(f"/api/v1/accounts/{acc['account_id']}/targets"))
    assert len(targets) == acc["in_plan_count"]


def test_other_territory_is_404(client, other_rep):
    hcp = next(r for r in seed_rows("DIM_HCP") if r["TERRITORY_ID"] == other_rep["HOME_TERRITORY_ID"])
    acc = next(r for r in seed_rows("DIM_ACCOUNT") if r["TERRITORY_ID"] == other_rep["HOME_TERRITORY_ID"])
    assert client.get(f"/api/v1/targets/{hcp['HCP_ID']}/profile").status_code == 404
    assert client.get(f"/api/v1/accounts/{acc['ACCOUNT_ID']}/targets").status_code == 404
    r = client.post("/api/v1/call-prep", json={"hcp_id": hcp["HCP_ID"], "participant_id": hcp["HCP_ID"],
                                               "category": "messaging"})
    assert r.status_code == 404
    assert client.post("/api/v1/calls", json={"hcp_id": hcp["HCP_ID"], "participant_ids": []}).status_code == 404


# --- profile, call prep, calls, compliance, next call ------------------------
@pytest.fixture(scope="module")
def target_with_pa():
    hcps = seed_rows("DIM_HCP")
    pa = next(h for h in hcps if h["TERRITORY_ID"] == "NE-POR" and h["ROLE_TYPE"] == "PA")
    return pa["PARENT_HCP_ID"], pa["HCP_ID"]


def test_profile_np_pa_resolves_to_physician(client, target_with_pa):
    phys, pa = target_with_pa
    d = _data(client.get(f"/api/v1/targets/{pa}/profile"))
    assert d["primary_hcp_id"] == phys and d["preselected_participant_ids"] == [phys, pa]
    p0 = d["participants"][0]
    assert p0["is_primary"] and len(p0["bullets"]) == 5 and p0["bullets"][0].startswith("Decile D")
    assert p0["segment_code"] in ("imm", "exp", "conv") and "Opportunity" not in p0["bullets"][1]
    assert p0["interaction_counts"]["all"] == len(p0["interactions"])
    pa_p = next(p for p in d["participants"] if p["hcp_id"] == pa)
    assert pa_p["bullets"][2] == "Handles prior authorizations for new HS starts"


def test_call_prep_rules(client, target_with_pa):
    phys, pa = target_with_pa
    for cat, label in (("messaging", "Insight"), ("objection", "Response"), ("closing", None)):
        d = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys, "category": cat}))
        assert d["source"] == "rules" and not d["is_revised"] and len(d["points"]) == 3 and len(d["steps"]) == 3
        assert d["delivered"] == []
        assert all("{" not in p["text"] for p in d["points"])
        assert all(p["detail_label"] == label for p in d["points"])
    obj = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys, "category": "objection"}))
    assert obj["points"][0]["text"].startswith("Expect Dr. ")
    assert obj["points"][2]["text"].startswith("Be advised that Dr. ")
    pa_msg = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": pa, "category": "messaging"}))
    segments = {s["code"]: s["short_name"] for s in _data(client.get("/api/v1/reference"))["segments"]}
    pa_seg = next(p for p in _data(client.get(f"/api/v1/targets/{pa}/profile"))["participants"]
                  if p["hcp_id"] == pa)["segment_code"]
    assert pa_msg["heading"].endswith("(PA)")
    assert [p["pillar"] for p in pa_msg["points"]] == ["Efficacy", "Safety", segments[pa_seg]]


def test_full_call_loop(client, target_with_pa, other_rep):
    phys, pa = target_with_pa
    call = _data(client.post("/api/v1/calls", json={"hcp_id": pa, "participant_ids": []}))
    assert call["hcp_id"] == phys and call["participant_ids"] == [phys, pa] and call["status"] == "planned"
    again = _data(client.post("/api/v1/calls", json={"hcp_id": phys, "participant_ids": [pa]}))
    assert again["call_id"] == call["call_id"]  # the open planned call is reused
    cid = call["call_id"]
    assert _data(client.get(f"/api/v1/calls/active?hcp_id={phys}"))["call_id"] == cid

    # Another rep cannot see it.
    assert client.get(f"/api/v1/calls/{cid}", headers=ident(other_rep["USERNAME"])).status_code == 404

    # Nothing answered -> 422.
    assert client.post(f"/api/v1/calls/{cid}/next-call").status_code == 422

    prep = {c: _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys, "category": c}))
            for c in ("messaging", "objection", "closing")}
    m, o, c = prep["messaging"]["points"], prep["objection"]["points"], prep["closing"]["points"]
    items = [
        {"participant_id": phys, "category": "messaging", "point_id": m[0]["point_id"], "point_rank": 1,
         "point_text": m[0]["text"], "was_raised": True, "reception": 2,
         "note": "HCP agreed the HS data was relevant for two patients"},
        {"participant_id": phys, "category": "messaging", "point_id": m[2]["point_id"], "point_rank": 3,
         "point_text": m[2]["text"], "was_raised": True, "reception": 0, "note": ""},
        {"participant_id": phys, "category": "objection", "point_id": o[1]["point_id"], "point_rank": 2,
         "point_text": o[1]["text"], "was_raised": True,
         "note": "Patient developed a rash on another JAK"},  # adverse event -> flagged
        {"participant_id": phys, "category": "closing", "point_id": c[0]["point_id"], "point_rank": 1,
         "point_text": c[0]["text"], "was_raised": True, "reception": 2,
         "note": "Agreed to identify two HS patients before the next visit"},
    ]
    saved = _data(client.put(f"/api/v1/calls/{cid}/assessments", json={"items": items}))
    assert len(saved["assessments"]) == 4 and all(a["compliance_status"] == "unchecked" for a in saved["assessments"])

    too_long = dict(items[0], note="x " * 150)
    assert client.put(f"/api/v1/calls/{cid}/assessments", json={"items": [too_long]}).status_code == 422

    chk = _data(client.post("/api/v1/compliance/check", json={
        "call_id": cid, "participant_id": phys, "category": "objection", "point_id": o[1]["point_id"],
        "point_text": o[1]["text"], "note": items[2]["note"]}))
    assert chk["status"] == "flagged" and chk["issues"][0]["rule_id"] == "ae"
    assert chk["result_label"] == "Non-compliant" and chk["steps"][1] == "Checking against 14 compliance rules"
    row = next(a for a in _data(client.get(f"/api/v1/calls/{cid}"))["assessments"] if a["category"] == "objection")
    assert row["compliance_status"] == "flagged" and row["compliance_check_id"] == chk["check_id"]
    assert _data(client.post(f"/api/v1/compliance/{chk['check_id']}/accept"))["suggestion_accepted"] is True

    # Flagged note -> 409 with the flags.
    r = client.post(f"/api/v1/calls/{cid}/next-call")
    assert r.status_code == 409
    flags = r.json()["data"]["flags"]
    assert [{k: f[k] for k in ("participant_id", "category", "point_id", "chip", "note")} for f in flags] == [
        {"participant_id": phys, "category": "objection", "point_id": o[1]["point_id"], "chip": "Adverse event",
         "note": items[2]["note"]}]
    # The full report travels with the flag, so the screen can open it without a new check.
    report = flags[0]["result"]
    assert report["status"] == "flagged" and report["issues"][0]["rule_id"] == "ae" and report["check_id"]
    assert report["suggested_text"] and report["result_label"] == "Non-compliant"

    # Fix the note: still open. Add a compliant Additional Note (it carries into the next pre-call plan).
    items[2]["note"] = "Still concerned about JAK safety for HS patients with risk factors"
    note = "Office asked for HSTruths.com patient resources; follow-up visit planned in 2 weeks"
    extra = {"participant_id": phys, "category": "additional", "point_id": "additional", "point_rank": 0,
             "point_text": "", "was_raised": False, "reception": None, "note": note}
    _data(client.put(f"/api/v1/calls/{cid}/assessments", json={"items": [items[2], extra]}))
    assert _data(client.post("/api/v1/compliance/check", json={
        "call_id": cid, "participant_id": phys, "category": "additional", "point_id": "additional",
        "point_text": "", "note": note}))["status"] == "passed"
    done = _data(client.post(f"/api/v1/calls/{cid}/next-call"))
    assert done["revision_no"] == 1 and done["source"] == "rules" and len(done["steps"]) == 3
    assert [p["participant_id"] for p in done["participants"]] == [phys]  # the PA answered nothing
    assert "answer the open objection" in done["participants"][0]["next_best_action"]

    rev_m = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys,
                                                          "category": "messaging"}))
    assert rev_m["is_revised"] and rev_m["revision_no"] == 1 and rev_m["revised_from_date"] == "2026-10-13"
    assert rev_m["heading"].startswith("Next-call Suggested Messaging") and len(rev_m["points"]) == 3
    assert rev_m["points"][0]["point_id"] == f"{m[0]['point_id']}~F"
    assert rev_m["points"][0]["tags"] == ["Builds on well received"]
    assert rev_m["banner"]["summary"].startswith("2 delivered · 1 well received")
    assert [(x["point_id"], x["label"]) for x in rev_m["delivered"]] == [
        (m[0]["point_id"], "Well Received"), (m[2]["point_id"], "Not Well Received")]
    assert all(x["delivered_date"] == "2026-10-13" for x in rev_m["delivered"])
    rev_o = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys,
                                                          "category": "objection"}))
    assert rev_o["points"][0]["point_id"] == o[0]["point_id"]
    assert [(x["point_id"], x["label"], x["is_open"]) for x in rev_o["delivered"]] == [
        (o[1]["point_id"], "Still Open", True)]

    prof = _data(client.get(f"/api/v1/targets/{phys}/profile"))["participants"][0]
    assert prof["stats"]["last_call_date"] == "2026-10-13"
    # The assessed call's card carries this participant's notes, in form order.
    assert prof["interactions"][0]["is_new"] and prof["interactions"][0]["summary"] == " · ".join(
        [items[0]["note"], items[2]["note"], items[3]["note"], note])
    assert prof["bullets"][4].startswith("Post-call 10/13/2026: 1 of 2 messages well received")
    assert prof["bullets"][5] == f"Last call note (Oct 13, 2026): {note}"

    assert client.post(f"/api/v1/calls/{cid}/next-call").status_code == 409  # already assessed
    assert client.put(f"/api/v1/calls/{cid}/assessments", json={"items": [items[0]]}).status_code == 409
    assert _data(client.get(f"/api/v1/calls/active?hcp_id={phys}")) is None

    # Second call: the rep reinforces the delivered Efficacy message.
    second = _data(client.post("/api/v1/calls", json={"hcp_id": phys, "participant_ids": []}))
    assert second["call_id"] != cid
    reinforce = {"participant_id": phys, "category": "messaging", "point_id": m[0]["point_id"], "point_rank": 4,
                 "point_text": m[0]["text"], "was_raised": True, "reception": 1,
                 "note": "HCP asked for the lesion and pain data again"}
    _data(client.put(f"/api/v1/calls/{second['call_id']}/assessments", json={"items": [reinforce]}))
    assert _data(client.post(f"/api/v1/calls/{second['call_id']}/next-call"))["revision_no"] == 2
    again = _data(client.post("/api/v1/call-prep", json={"hcp_id": phys, "participant_id": phys,
                                                          "category": "messaging"}))
    eff = next(x for x in again["delivered"] if x["point_id"] == m[0]["point_id"])
    assert eff["label"] == "Reinforced · Moderately Received" and eff["reception"] == 1


def test_compliance_check_without_call(client, target_with_pa):
    phys, _ = target_with_pa
    d = _data(client.post("/api/v1/compliance/check", json={
        "participant_id": phys, "category": "messaging", "point_id": "MSG_EFF_HCP",
        "point_text": "HiSCR50 primary endpoint met", "note": "HCP agreed to review two HS patients next visit"}))
    assert d["status"] == "passed" and d["score"] == 100 and d["suggested_text"] is None


# --- jobs ----------------------------------------------------------------------
def test_jobs_require_token(client):
    assert client.post("/api/v1/jobs/refresh-guidance").status_code == 401
    assert client.post("/api/v1/jobs/purge-ai-cache", headers={"X-POVO-Service-Token": "wrong"}).status_code == 401


def test_jobs_run_with_empty_body(client):
    h = {"X-POVO-Service-Token": SERVICE_TOKEN}
    d = _data(client.post("/api/v1/jobs/refresh-guidance", headers=h))
    assert d["territories"] == 8 and d["snapshot_date"] == "2026-10-13"
    assert _data(client.post("/api/v1/jobs/purge-ai-cache", headers=h))["deleted"] >= 0


def test_reference_lookups(client):
    d = _data(client.get("/api/v1/reference"))
    assert [t["name"] for t in d["tiers"]] == ["Super High", "Medium", "Low"]
    assert {s["code"] for s in d["segments"]} == {"imm", "conv", "exp"}
    assert {f["code"] for f in d["competitive_focus"]} == {"cosentyx", "bimzelx", "humira", "jak", "conventional"}
    assert [c["code"] for c in d["categories"]] == ["messaging", "objection", "closing"]
    assert [r["label"] for r in d["reception_scale"]][2] == "Well Received"
    assert d["compliance"]["rule_count"] == 14
    assert d["compliance"]["steps"][1] == "Checking against 14 compliance rules"
    assert d["limits"] == {"points_per_category": 3, "note_max_length": 200, "additional_note_max_length": 600}
    assert {c["code"] for c in d["interaction_channels"]} == {"rep", "adfa", "opz", "msl", "spkr", "pr"}
    assert [m["title"] for m in d["kpi_metrics"]] == ["Patient Enrollment Forms", "Total Patients Receiving POVO"]
    assert [s["code"] for s in d["segments"]] == ["imm", "exp", "conv"]
    assert d["segments"][1]["full_name"] == "Advanced Biologics plus JAK Inhibitors"
    assert "example_notes" not in d  # predicted per note by AI, never fixed text
    assert d["prep_steps"]["messaging"][0] == "Analyzing {possessive} profile, decile and HS volume"


def test_kpi_cards_follow_ref_kpi_metric(client):
    d = _data(client.get("/api/v1/performance/kpis?period=month"))
    assert [(c["metric_code"], c["unit"]) for c in d["cards"]] == [("PEF", "PEFs"), ("NEW_PATIENTS", "new patients")]


def test_kpi_rates_are_read_from_the_table(client):
    """Empty the table and the split disappears rather than being made up."""
    from database.tables import bronze
    from database.warehouse import get_warehouse
    from helpers.territory_data import clear_cache

    wh = get_warehouse()
    where = "WHERE REF_TYPE = 'KPI_PARAMETER'"
    params = wh.query(f"SELECT * FROM {bronze('REF_INTERACTION_CHANNEL')} {where}")
    try:
        wh.execute(f"DELETE FROM {bronze('REF_INTERACTION_CHANNEL')} {where}")
        clear_cache()
        assert "split" not in _data(client.get("/api/v1/performance/kpis?period=month"))["cards"][1]
    finally:
        for row in params:
            cols = list(row)
            wh.execute(f"INSERT INTO {bronze('REF_INTERACTION_CHANNEL')} ({', '.join(cols)}) "
                       f"VALUES ({', '.join(':' + c for c in cols)})", row)
        clear_cache()
    assert "split" in _data(client.get("/api/v1/performance/kpis?period=month"))["cards"][1]
