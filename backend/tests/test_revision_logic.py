"""Next-call revision rules on hand-built lists (POC applyRevision + rankNext, Step 3_63)."""
from datetime import date

import pytest

from helpers.content.library import get_library
from helpers.content.select import item
from helpers.revision import objection_state, revise

DOT = "·"
CALL = date(2026, 10, 13)
WELL, MOD = "Builds on well received", "Builds on moderate"


@pytest.fixture()
def lib():
    return get_library()


@pytest.fixture()
def ctx():
    return {"values": {"display_name": "Dr. Winters", "physician_display_name": "Dr. Winters",
                       "segment_short_name": "Conventional", "call_date": "10/13/2026",
                       "call_date_long": "Oct 13, 2026"},
            "flags": {"seg_conv"}, "person": {"role_type": "HCP", "segment_code": "conv", "decile": 10,
                                              "povo_patients": 0}, "primary": {}}


def _lists(lib):
    m = [item(pid, lib.point(pid)["PILLAR"], lib.point(pid)["TEXT_TEMPLATE"], f"ins {pid}")
         for pid in ("MSG_EFF_HCP", "MSG_SAF_HCP", "MSG_SEG_CONV_HCP", "MSG_MECH_HCP", "MSG_PAIN_HCP")]
    o = [item(f"OBJ_{k:02d}", None, f"objection {k}", "response") for k in (10, 12, 1, 16, 17)]
    c = [item(pid, None, f"closing {k}", None)
         for k, pid in enumerate(("CLS_HCP_CONV_1", "CLS_HCP_CONV_2", "CLS_HCP_3", "CLS_HCP_4", "CLS_HCP_5"), 1)]
    return {"messaging": m, "objection": o, "closing": c}


def _ids(points):
    return [x["point_id"] for x in points]


def test_objection_state_regex():
    assert objection_state("") == ""
    assert objection_state("Still concerned about JAK safety") == "open"
    assert objection_state("Not resolved yet") == "open"
    assert objection_state("Resolved after reviewing the approved response") == "res"
    assert objection_state("Talked about it") == "open"  # anything else stays open


def test_full_revision(lib, ctx):
    answers = {
        "messaging": {"MSG_EFF_HCP": {"reception": 2, "note": ""},
                      "MSG_SAF_HCP": {"reception": 1, "note": "Asked for the monitoring data"},
                      "MSG_SEG_CONV_HCP": {"reception": 0, "note": ""}},
        "objection": {"OBJ_10": {"reception": None, "note": "Resolved after reviewing data"},
                      "OBJ_12": {"reception": None, "note": "Still concerned about safety"}},
        "closing": {"CLS_HCP_CONV_1": {"reception": 2, "note": "Agreed to identify 2 patients"}},
    }
    r = revise(lib, ctx, _lists(lib), answers, CALL, "10/13/2026")

    m = r["lists"]["messaging"]
    # Well-received follow-up, then 1 unused point from the well-received theme (efficacy: lesions and pain),
    # then the moderate follow-up; delivered: well, moderately, not well received.
    assert _ids(m) == ["MSG_EFF_HCP~F", "MSG_PAIN_HCP", "MSG_SAF_HCP~F",
                       "MSG_EFF_HCP", "MSG_SAF_HCP", "MSG_SEG_CONV_HCP"]
    assert m[0]["tags"] == [WELL] and m[1]["tags"] == [] and m[2]["tags"] == [MOD]
    assert m[0]["text"] == "Restate the Week 12 HiSCR50 result, then share the lesion and pain data"
    assert m[0]["detail"] == "Builds on the Efficacy message, well received on 10/13/2026"
    assert [x["label"] for x in m[3:]] == ["Well Received", "Moderately Received", "Not Well Received"]
    assert all(x["delivered"] and x["delivered_date"] == "2026-10-13" for x in m[3:])
    assert not any(x["delivered"] for x in m[:3])

    o = r["lists"]["objection"]
    assert _ids(o) == ["OBJ_01", "OBJ_16", "OBJ_17", "OBJ_10", "OBJ_12"]
    assert (o[3]["label"], o[3]["is_open"]) == ("Resolved", False)
    assert (o[4]["label"], o[4]["is_open"], o[4]["detail"]) == ("Still Open", True, "response")

    c = r["lists"]["closing"]
    assert _ids(c)[:3] == ["CLS_HCP_CONV_1~F2", "CLS_HCP_CONV_2", "CLS_HCP_3"]
    assert c[0]["text"] == "Let's confirm the first patient we identified starts POVO this month"
    assert c[0]["tags"] == [WELL] and c[3]["label"] == "Well Received"

    assert r["summaries"] == {
        "messaging": f"3 delivered {DOT} 1 well received {DOT} 3 new messages for the next call",
        "objection": f"2 delivered {DOT} 1 still open {DOT} 3 new objections for the next call",
        "closing": f"1 delivered {DOT} 1 well received {DOT} 3 new closings for the next call"}
    assert r["next_best_action"] == ("Lead with efficacy, answer the open objection and confirm the agreed "
                                     "next step")
    assert r["history_line"] == ("1 of 3 messages well received, 1 objection still open, "
                                 "1 closing well received")


def test_not_well_received_theme_is_never_suggested_again(lib, ctx):
    answers = {"messaging": {"MSG_EFF_HCP": {"reception": 0, "note": ""}}, "objection": {}, "closing": {}}
    m = revise(lib, ctx, _lists(lib), answers, CALL, "10/13/2026")["lists"]["messaging"]
    # Efficacy is closed: no lesions-and-pain point and no disease-progression peer message.
    assert _ids(m) == ["MSG_SAF_HCP", "MSG_SEG_CONV_HCP", "MSG_MECH_HCP", "MSG_EFF_HCP"]
    assert m[-1]["label"] == "Not Well Received"


def test_pool_fills_in_new_messages(lib, ctx):
    answers = {"messaging": {"MSG_EFF_HCP": {"reception": 2, "note": ""}, "MSG_SAF_HCP": {"reception": 2, "note": ""},
                             "MSG_SEG_CONV_HCP": {"reception": 2, "note": ""}}, "objection": {}, "closing": {}}
    m = revise(lib, ctx, _lists(lib), answers, CALL, "10/13/2026")["lists"]["messaging"]
    assert _ids(m)[:3] == ["MSG_EFF_HCP~F", "MSG_SAF_HCP~F", "MSG_SEG_CONV_HCP~F"]
    assert all(x["tags"] == [WELL] for x in m[:3])


def test_reinforced_point_is_updated_in_the_history(lib, ctx):
    first = revise(lib, ctx, _lists(lib), {"messaging": {"MSG_EFF_HCP": {"reception": 2, "note": ""}},
                                           "objection": {}, "closing": {}}, CALL, "10/13/2026")["lists"]
    later = date(2026, 10, 20)
    again = revise(lib, ctx, first, {"messaging": {"MSG_EFF_HCP": {"reception": 1, "note": ""}},
                                     "objection": {}, "closing": {}}, later, "10/20/2026")["lists"]["messaging"]
    eff = next(x for x in again if x["point_id"] == "MSG_EFF_HCP")
    assert eff["delivered"] and eff["delivered_date"] == "2026-10-20"
    assert eff["label"] == f"Reinforced {DOT} Moderately Received" and eff["reception"] == 1
    assert len(_ids(again)) == len(set(_ids(again)))


def test_follow_up_of_a_follow_up_is_not_created(lib, ctx):
    first = revise(lib, ctx, _lists(lib), {"messaging": {"MSG_EFF_HCP": {"reception": 2, "note": ""}},
                                           "objection": {}, "closing": {}}, CALL, "10/13/2026")["lists"]
    again = revise(lib, ctx, first, {"messaging": {"MSG_EFF_HCP~F": {"reception": 2, "note": ""}},
                                     "objection": {}, "closing": {}}, date(2026, 10, 20),
                   "10/20/2026")["lists"]["messaging"]
    assert not any(x["point_id"].count("~") > 1 for x in again)
    assert [x["point_id"] for x in again].count("MSG_EFF_HCP~F") == 1


def test_llm_states_override_regex(lib, ctx):
    answers = {"messaging": {}, "objection": {"OBJ_10": {"reception": None, "note": "Talked it through"}},
               "closing": {}}
    r = revise(lib, ctx, _lists(lib), answers, CALL, "10/13/2026", llm_states={"OBJ_10": "resolved"})
    assert r["lists"]["objection"][-1]["point_id"] == "OBJ_10"
    assert r["lists"]["objection"][-1]["label"] == "Resolved"
    assert r["counts"]["o_res"] == 1
