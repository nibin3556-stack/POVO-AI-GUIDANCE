"""Next-call revision rules on hand-built lists (POC applyRevision, final)."""
import pytest

from helpers.content.library import get_library
from helpers.content.select import item
from helpers.revision import objection_state, revise

DOT = "·"


@pytest.fixture()
def lib():
    return get_library()


@pytest.fixture()
def ctx():
    return {"values": {"display_name": "Dr. Winters", "physician_display_name": "Dr. Winters",
                       "call_date": "10/13/2026", "call_date_long": "Oct 13, 2026"},
            "flags": set(), "person": {"role_type": "HCP"}, "primary": {}}


def _lists(lib):
    m = [item(pid, lib.point(pid)["PILLAR"], lib.point(pid)["TEXT_TEMPLATE"], f"ins {pid}")
         for pid in ("MSG_EFF_HCP", "MSG_SAF_HCP", "MSG_SEG_CONV_HCP", "MSG_MECH_HCP", "MSG_PAIN_HCP")]
    o = [item(f"OBJ_{k:02d}", None, f"objection {k}", "response") for k in (10, 12, 1, 16, 17)]
    c = [item(f"CLS_HCP_{k}", None, f"closing {k}", None) for k in range(1, 6)]
    return {"messaging": m, "objection": o, "closing": c}


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
        "closing": {"CLS_HCP_1": {"reception": 2, "note": "Agreed to identify 2 patients"}},
    }
    r = revise(lib, ctx, _lists(lib), answers, "10/13/2026")
    m = r["lists"]["messaging"]
    assert [x["point_id"] for x in m] == ["MSG_PEER", "MSG_SAF_HCP", "MSG_EFF_HCP", "MSG_MECH_HCP", "MSG_PAIN_HCP"]
    assert m[0]["tags"] == [f"New {DOT} replaces a removed message"]
    assert m[0]["pillar"] == "Disease progression" and m[0]["previous_text"].startswith("Active HS despite")
    assert m[0]["detail"] == "The message it replaces was not well received on the 10/13/2026 call"
    assert m[1]["tags"] == ["Changed"]
    assert m[1]["text"] == "Open with overall safety, then the monitoring section of the Prescribing Information"
    assert m[1]["detail"] == "From the 10/13/2026 call: Asked for the monitoring data"
    assert m[2]["tags"] == [f"Retained {DOT} well received", "▼ was #1"]
    assert m[3]["tags"] == [] and m[3]["previous_rank"] == 4

    o = r["lists"]["objection"]
    assert [x["point_id"] for x in o] == ["OBJ_12", "OBJ_01", "OBJ_16", "OBJ_17", "OBJ_10"]
    assert o[0]["tags"] == [f"Still open {DOT} address first", "▲ was #2"]
    assert o[-1]["tags"] == ["Resolved last call", "▼ was #1"]

    c = r["lists"]["closing"]
    assert c[0]["tags"] == ["New"]
    assert c[0]["text"] == "Thank you, Dr. Winters. I will follow up next week on the patients we identified"
    assert c[1]["tags"] == ["New AI suggestion"] and c[2]["tags"] == ["New AI suggestion"]
    assert c[1]["text"].startswith("I will bring answers to the open questions from our Oct 13, 2026 call")
    assert c[2]["text"] == "I will bring the approved information on the data you asked about"
    assert c[1]["previous_text"] == "closing 2" and c[3]["tags"] == []

    assert r["summaries"] == {"messaging": f"1 changed {DOT} 1 reordered {DOT} 1 removed",
                              "objection": f"3 objections moved up {DOT} 1 resolved",
                              "closing": f"1 new closing {DOT} 2 replaced with AI suggestions"}
    assert r["next_best_action"] == ("Open with safety, clear the open objection first and confirm the agreed "
                                     "next step")
    assert r["history_line"] == ("1 of 3 messages well received, 1 objection still open, "
                                 "1 closing well received")


def test_second_not_well_is_changed_and_retained_stays(lib, ctx):
    answers = {"messaging": {"MSG_EFF_HCP": {"reception": 0, "note": ""}, "MSG_SAF_HCP": {"reception": 0, "note": ""},
                             "MSG_SEG_CONV_HCP": {"reception": 2, "note": ""}},
               "objection": {}, "closing": {}}
    r = revise(lib, ctx, _lists(lib), answers, "10/13/2026")
    m = r["lists"]["messaging"]
    assert m[0]["point_id"] == "MSG_PEER"
    assert m[1]["point_id"] == "MSG_SAF_HCP" and m[1]["tags"][0] == "Changed"
    assert m[2]["point_id"] == "MSG_SEG_CONV_HCP" and m[2]["tags"] == [f"Retained {DOT} well received"]
    assert r["next_best_action"] == "Open with safety"


def test_peer_message_never_duplicated(lib, ctx):
    lists = _lists(lib)
    answers = {"messaging": {"MSG_EFF_HCP": {"reception": 0, "note": ""}}, "objection": {}, "closing": {}}
    first = revise(lib, ctx, lists, answers, "10/13/2026")["lists"]
    again = revise(lib, ctx, {**lists, "messaging": first["messaging"]},
                   {"messaging": {"MSG_SAF_HCP": {"reception": 0, "note": ""}}, "objection": {}, "closing": {}},
                   "10/20/2026")["lists"]["messaging"]
    assert [x["point_id"] for x in again].count("MSG_PEER") == 1


def test_llm_states_override_regex(lib, ctx):
    answers = {"messaging": {}, "objection": {"OBJ_10": {"reception": None, "note": "Talked it through"}},
               "closing": {}}
    r = revise(lib, ctx, _lists(lib), answers, "10/13/2026", llm_states={"OBJ_10": "resolved"})
    assert r["lists"]["objection"][-1]["point_id"] == "OBJ_10"
    assert r["counts"]["o_res"] == 1
