"""The 14 compliance rules, suppressions, score, labels and the rewrite."""
import json
from pathlib import Path

import pytest

from helpers.compliance.engine import check, result_label, score
from helpers.compliance.rewrite import suggest, template

RULES = json.loads((Path(__file__).resolve().parents[2] / "databricks" / "seed" / "content"
                    / "compliance_rules.json").read_text(encoding="utf-8"))
POINT = "HiSCR50 primary endpoint met for both doses at Week 12 in STOP-HS1 and STOP-HS2"


def ids(note: str, ctx: str = POINT) -> list[str]:
    return [x["rule"]["RULE_ID"] for x in check(note, ctx, RULES)]


@pytest.mark.parametrize("rule_id,note", [
    ("off", "HCP asked about using POVO for psoriasis patients"),
    ("claim", "Told the HCP POVO is the best option for HS patients"),
    ("ae", "Patient developed a rash after starting treatment"),
    ("phi", "Discussed Patient Smith and her HS flares at length"),
    ("vulgar", "HCP said the damn prior authorization takes weeks"),
    ("lang", "The office staff was rude about the HS data review"),
    ("price", "HCP asked for free samples for HS patients"),
    ("sens", "HCP talked about her divorce during the HS discussion"),
    ("irr", "We discussed the weather before reviewing HS data"),
    ("fill", "HCP basically agreed to review HS patients next visit"),
    ("gib", "asdfgh qwerty zxcvbn"),
    ("ph", "HCP [response]; next step: [action] for HS patients"),
    ("vague", "good call"),
    ("rel", "The quarterly budget meeting ran long yesterday afternoon"),
])
def test_each_rule_triggers(rule_id, note):
    assert rule_id in ids(note)


def test_there_are_14_rules():
    assert sorted(r["RULE_ID"] for r in RULES) == sorted(
        ["off", "claim", "ae", "phi", "vulgar", "lang", "price", "sens", "irr", "fill", "gib", "ph", "vague", "rel"])


def test_clean_note_passes():
    note = "HCP agreed to review two HS patients with recurring flares before the next visit"
    issues = check(note, POINT, RULES)
    assert issues == [] and score(issues) == 100 and result_label(issues) == "Compliant"


def test_suppressions():
    assert "off" not in ids("HCP asked about psoriasis; off-label question sent to Medical Information")
    assert "ae" not in ids("A patient rash was reported to Pharmacovigilance within 24 hours")


def test_possessive_children_is_not_off_label():
    assert "off" not in ids("HCP mentioned my children while we reviewed HS patients")
    assert "off" in ids("HCP asked about treating children with HS")


def test_phi_is_case_sensitive_for_names():
    assert "phi" not in ids("Reviewed patient cases with the HCP for HS")
    assert "phi" in ids("Patient DOB was mentioned during the HS review")


def test_score_and_labels():
    ae = check("Patient developed a rash after starting treatment", POINT, RULES)
    assert score(ae) == 65 and result_label(ae) == "Non-compliant"
    fill = check("HCP basically agreed to review HS patients next visit", POINT, RULES)
    assert score(fill) == 75 and result_label(fill) == "Minor issue"  # capped at 75 with any issue
    claim = check("Told the HCP POVO is the best option for HS patients", POINT, RULES)
    assert score(claim) == 75 and result_label(claim) == "Needs review"
    gib = check("asdfgh qwerty zxcvbn", POINT, RULES)
    assert score(gib) == 0


def test_issues_sorted_by_severity():
    got = ids("HCP basically said the best thing: a patient had a rash")
    assert got.index("ae") < got.index("claim") < got.index("fill")


def test_rewrite_replaces_adverse_event_clause():
    note = "HCP agreed to review HS patients next visit. One patient had a rash last week."
    issues = check(note, POINT, RULES)
    out = suggest(note, issues, RULES, "m", "Dr. Winters", POINT, POINT)
    assert "Safety information reported to Pharmacovigilance" in out
    assert "rash" not in out


def test_rewrite_template_for_vague_and_bracket_only():
    issues = check("good call", POINT, RULES)
    assert suggest("good call", issues, RULES, "o", "Dr. Winters", POINT, POINT) == template("o", "Dr. Winters", POINT)
    only_ph = "HCP agreed to review HS data; objection [resolved / still open]"
    assert suggest(only_ph, check(only_ph, POINT, RULES), RULES, "o", "Dr. Winters", POINT, POINT) == ""


def test_template_shapes():
    assert template("c", "Dr. Winters", POINT).startswith("Closed with: HiSCR50 primary endpoint met")
    assert template("n", "Dr. Winters", "") == ("Also discussed [topic] with Dr. Winters. Dr. Winters [response]; "
                                               "next step: [action]")
