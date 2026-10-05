"""The 14 compliance rules, suppressions, score, labels and the rewrite."""
import json
from pathlib import Path

import pytest

from helpers.compliance.engine import check, result_label, score
from helpers.compliance.rewrite import suggest, template
from helpers.content.library import ComplianceTexts

CONTENT = Path(__file__).resolve().parents[2] / "databricks" / "seed" / "content"
RULES = json.loads((CONTENT / "compliance_rules.json").read_text(encoding="utf-8"))
_ROWS = json.loads((CONTENT / "compliance_texts.json").read_text(encoding="utf-8"))
TEXTS = ComplianceTexts(
    templates={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in _ROWS if r["KIND"] == "template"},
    replacements={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in _ROWS if r["KIND"] == "replacement"},
    rewords=[(r["PATTERN"], r["TEXT_TEMPLATE"]) for r in _ROWS if r["KIND"] == "reword"],
    cut_off={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in _ROWS if r["KIND"] == "cut_off"})
EMPTY = ComplianceTexts(templates={}, replacements={}, rewords=[], cut_off={})
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
    out = suggest(note, issues, RULES, TEXTS, "messaging", "Dr. Winters", POINT, POINT)
    assert out.endswith(TEXTS.replacements["ae"] + ".")
    assert "rash" not in out


def test_rewrite_template_for_vague_and_bracket_only():
    issues = check("good call", POINT, RULES)
    assert (suggest("good call", issues, RULES, TEXTS, "objection", "Dr. Winters", POINT, POINT)
            == template("objection", "Dr. Winters", TEXTS))
    only_ph = "HCP agreed to review HS data; objection [resolved / still open]"
    assert suggest(only_ph, check(only_ph, POINT, RULES), RULES, TEXTS, "objection", "Dr. Winters", POINT, POINT) == ""


def test_template_comes_from_the_table_and_never_holds_the_talking_point():
    for category in ("messaging", "objection", "closing", "additional"):
        out = template(category, "Dr. Winters", TEXTS)
        assert out == TEXTS.templates[category].replace("{who}", "Dr. Winters")
        assert "HiSCR50" not in out and "[" in out
    issues = check("good call", POINT, RULES)
    assert "HiSCR50" not in suggest("good call", issues, RULES, TEXTS, "messaging", "Dr. Winters", POINT, POINT)


def test_no_wording_in_the_table_means_no_wording_in_the_rewrite():
    assert template("messaging", "Dr. Winters", EMPTY) == ""
    note = "HCP agreed to review HS patients next visit. One patient had a rash last week."
    out = suggest(note, check(note, POINT, RULES), RULES, EMPTY, "messaging", "Dr. Winters", POINT, POINT)
    assert "Pharmacovigilance" not in out and "rash" not in out


@pytest.mark.parametrize("note", [
    "HCP asked how lab monitoring works before a",
    "HCP reviewed the HS data and",
    "HCP asked about the Week 12 HS data,",
    "Agreed to identify two HS patients for.",
])
def test_note_cut_off_mid_sentence_is_incomplete(note):
    issues = check(note, "HS lab monitoring before a first POVO start", RULES)
    assert [x["rule"]["RULE_ID"] for x in issues] == ["ph"] and issues[0]["cut"] is True


def test_finished_sentence_is_not_cut_off():
    assert ids("HCP asked how lab monitoring works before a first POVO start",
               "HS lab monitoring before a first POVO start") == []
    assert ids("HCP will think about the HS data and follow up") == []


def test_rewrite_keeps_the_words_of_a_cut_off_note():
    note = "HCP asked how lab monitoring works before a"
    issues = check(note, "HS lab monitoring before a first POVO start", RULES)
    assert suggest(note, issues, RULES, TEXTS, "messaging", "Dr. Winters", "", "") == (
        f"HCP asked how lab monitoring works {TEXTS.cut_off['placeholder']}.")
