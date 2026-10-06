"""The features a brand can switch on or off: the single list the admin screen,
the endpoint guards and the frontend all read.

A feature is code, so the catalog lives here. Which features a brand has is
data: CFG_BRAND_FEATURE (one row per brand and feature), edited by the users in
ADMIN_USERS_FILE. A brand without a row for a feature does not have it, so a
new brand starts with nothing until an admin enables what it needs. The
default brand (DEFAULT_BRAND_CODE, POVO) is registered with every feature on.

`requires` names a feature that must also be on for this one to work (the UI
hides a child whose parent is off, and the guards check both).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Feature:
    code: str
    name: str
    description: str
    group: str
    requires: Optional[str] = None


PERFORMANCE_TAB = "PERFORMANCE_TAB"
PERFORMANCE_KPIS = "PERFORMANCE_KPIS"
AI_GUIDANCE = "AI_GUIDANCE"
SEGMENTATION = "SEGMENTATION"
DECILES = "DECILES"
NEW_WRITERS = "NEW_WRITERS"
PRE_CALL_TAB = "PRE_CALL_TAB"
MUST_WINS = "MUST_WINS"
AI_CALL_PREP = "AI_CALL_PREP"
POST_CALL_TAB = "POST_CALL_TAB"
COMPLIANCE_CHECK = "COMPLIANCE_CHECK"
EXAMPLE_NOTES = "EXAMPLE_NOTES"
VOICE_NOTES = "VOICE_NOTES"
AI_NEXT_CALL = "AI_NEXT_CALL"
IMPERSONATION = "IMPERSONATION"

FEATURES: tuple[Feature, ...] = (
    Feature(PERFORMANCE_TAB, "Territory Performance", "The Territory Performance tab.", "Territory Performance"),
    Feature(PERFORMANCE_KPIS, "Goal KPI cards", "Goal, achieved and on-track cards for month, quarter and year.",
            "Territory Performance", PERFORMANCE_TAB),
    Feature(AI_GUIDANCE, "AI guidance", "Missed opportunities, strong performance and recommended focus.",
            "Territory Performance", PERFORMANCE_TAB),
    Feature(SEGMENTATION, "Target segmentation", "Targets by treatment segment with reach, trial and adoption.",
            "Territory Performance", PERFORMANCE_TAB),
    Feature(DECILES, "Targets by decile", "Decile chart and table with reach and call frequency.",
            "Territory Performance", PERFORMANCE_TAB),
    Feature(NEW_WRITERS, "New writers", "New writers by segment, weekly and monthly.",
            "Territory Performance", PERFORMANCE_TAB),
    Feature(PRE_CALL_TAB, "Pre-Call Planning", "The Pre-Call Planning tab: call plan, targets and call prep.",
            "Pre-Call Planning"),
    Feature(MUST_WINS, "Must-Wins", "The two Must-Wins lists above the call plan.", "Pre-Call Planning",
            PRE_CALL_TAB),
    Feature(AI_CALL_PREP, "AI call prep", "AI orders the approved talking points and writes the insights. "
            "Off: the approved points in their rule order.", "Pre-Call Planning", PRE_CALL_TAB),
    Feature(POST_CALL_TAB, "Post-Call Assessment", "The Post-Call Assessment tab.", "Post-Call Assessment",
            PRE_CALL_TAB),
    Feature(COMPLIANCE_CHECK, "AI compliance check", "Checks every post-call note before it can be submitted.",
            "Post-Call Assessment", POST_CALL_TAB),
    Feature(EXAMPLE_NOTES, "Example notes", "AI example notes the rep can start from.", "Post-Call Assessment",
            POST_CALL_TAB),
    Feature(VOICE_NOTES, "Voice notes", "Dictate notes with speech-to-text in the browser.", "Post-Call Assessment",
            POST_CALL_TAB),
    Feature(AI_NEXT_CALL, "AI next-call messaging", "After Submit, AI suggests the next call's messaging from the "
            "HCP data and every earlier call's feedback and notes. Off: rule-based revision.",
            "Post-Call Assessment", POST_CALL_TAB),
    Feature(IMPERSONATION, "Impersonate user", "View the app as another employee of the brand.", "General"),
)

BY_CODE = {f.code: f for f in FEATURES}
ALL_CODES = tuple(f.code for f in FEATURES)


def effective(enabled: set[str]) -> set[str]:
    """The enabled features whose parent chain is enabled too."""
    out = set()
    for code in enabled:
        f = BY_CODE.get(code)
        while f is not None and f.code in enabled:
            f = BY_CODE.get(f.requires) if f.requires else None
            if f is None:
                out.add(code)
                break
    return out
