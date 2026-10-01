"""Reference data the frontend needs to label and colour what the API returns.

One place for every lookup the screens use (tiers, segments, competitive focus,
roles, interaction channels, talking-point categories, the reception scale,
compliance wording and note limits), so the frontend holds no copy of the
business data. Everything comes from the bronze REF_ tables or from the same
backend constants the endpoints already apply, so a value changed here or in
the warehouse shows up in the UI without a frontend release.
"""
from __future__ import annotations

from helpers.compliance.engine import LABEL_BY_SEVERITY
from helpers.compliance.service import DEFAULT_NOTE_LIMIT, NOTE_LIMIT, compliance_steps
from helpers.content.library import get_library
from helpers.content.select import CATEGORIES, LABELS
from helpers.prep import PREP_STEPS, TP_SHOW
from helpers.territory_data import get_refs

ROLE_TYPES = (("HCP", "HCP"), ("NP", "NP"), ("PA", "PA"))
#: RECEPTION in APP_CALL_POINT_ASSESSMENT: 0 = not well, 1 = moderately, 2 = well.
RECEPTION_SCALE = ("Not Well Received", "Moderately Received", "Well Received")
#: Shown while POST /calls/{id}/next-call runs, before its response (which carries
#: the same steps) arrives. {n} is the number of notes, {notes} "note" or "notes".
NEXT_CALL_STEPS = ("Reading the post-call assessment", "Running the AI compliance check on {n} {notes}",
                   "Drafting next-call talking points")


def next_call_steps(note_count: int) -> list[str]:
    word = "note" if note_count == 1 else "notes"
    return [s.format(n=note_count, notes=word) for s in NEXT_CALL_STEPS]


def build_reference() -> dict:
    refs, lib = get_refs(), get_library()
    return {
        "content_version": lib.content_version,
        "tiers": [{"code": t["TIER_CODE"], "name": t["TIER_NAME"], "decile_min": t["DECILE_MIN"],
                   "decile_max": t["DECILE_MAX"], "calls_per_year": t["CALLS_PER_YEAR"],
                   "reach_goal_pct": t["REACH_GOAL_PCT"]} for t in refs.tiers],
        "segments": [{"code": s["SEGMENT_CODE"], "short_name": s["SHORT_NAME"], "full_name": s["FULL_NAME"],
                      "description": s["DESCRIPTION"], "color_hex": s["COLOR_HEX"]} for s in refs.segments],
        "competitive_focus": [{"code": f["FOCUS_CODE"], "label": f["LABEL"], "color_hex": f["COLOR_HEX"]}
                              for f in refs.focus],
        "role_types": [{"code": c, "label": label} for c, label in ROLE_TYPES],
        "interaction_channels": [{"code": c["CHANNEL_CODE"], "type_label": c["TYPE_LABEL"],
                                  "team_label": c["TEAM_LABEL"]} for c in refs.channels],
        "kpi_metrics": [{"code": m["METRIC_CODE"], "title": m["TITLE"], "unit": m["UNIT"]}
                        for m in refs.kpi_metrics],
        "categories": [{"code": c, "label": LABELS[c]} for c in CATEGORIES],
        "reception_scale": [{"value": i, "label": label} for i, label in enumerate(RECEPTION_SCALE)],
        "compliance": {"rule_count": len(lib.compliance_rules), "steps": compliance_steps(),
                       "severity_labels": dict(LABEL_BY_SEVERITY)},
        "next_call_steps": list(NEXT_CALL_STEPS),
        "prep_steps": {cat: list(lines) for cat, lines in PREP_STEPS.items()},
        "limits": {"points_per_category": TP_SHOW, "note_max_length": DEFAULT_NOTE_LIMIT,
                   "additional_note_max_length": NOTE_LIMIT["additional"]},
    }
