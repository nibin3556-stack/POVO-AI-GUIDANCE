"""AI example notes for the post-call assessment.

For one point (or Additional Notes) the n8n example-notes workflow predicts the
few notes this rep is most likely to write after the call, from the point, the
participant's profile and recent interactions, and the reception the rep has
picked so far. The rep can click one, then edit it like any typed note.

There is no fallback text: when AI is off or the workflow fails, the answer is
an empty list and the screen shows no example notes. Every AI note is checked
here against the compliance rules and dropped if anything fires, so a
suggestion can never start the rep off with a flagged note.

Answers are cached in APP_AI_CACHE (AI_CACHE_HOURS) by territory, participant,
category, point text, reception, the other raised points and content version.
"""
from __future__ import annotations

from typing import Optional

from core.config import get_settings
from helpers import n8n_client
from helpers.compliance.engine import check
from helpers.compliance.service import note_limit
from helpers.content.library import get_library
from helpers.content.select import LABELS
from helpers.dates import today
from helpers.prep import MAX_INTERACTIONS, _cache_key, cache_get, cache_put, participant_payload
from helpers.targets import Universe

#: How many example notes one point shows.
MAX_NOTES = 3
#: Notes shorter than this are too thin to save the rep any typing.
MIN_WORDS = 4
#: RECEPTION in APP_CALL_POINT_ASSESSMENT -> the wording sent to the model.
RECEPTION_WORDS = {0: "not well received", 1: "moderately received", 2: "well received"}
ADDITIONAL_LABEL = "Additional notes (anything discussed outside the points)"


def valid_notes(out: Optional[dict], ctx_text: str, limit: int) -> list[str]:
    """Re-check the Guard's promise and the compliance rules; keep at most MAX_NOTES distinct notes."""
    raw = (out or {}).get("notes")
    if not isinstance(raw, list):
        return []
    rules = get_library().compliance_rules
    keep: list[str] = []
    seen: set[str] = set()
    for n in raw:
        if not isinstance(n, str):
            continue
        s = " ".join(n.split())
        if (not s or len(s) > limit or len(s.split()) < MIN_WORDS or "[" in s or s.lower() in seen
                or check(s, ctx_text, rules)):
            continue
        seen.add(s.lower())
        keep.append(s)
        if len(keep) == MAX_NOTES:
            break
    return keep


def suggest_notes(u: Universe, p: dict, category: str, point_text: str, reception: Optional[int],
                  other_points: list[str], request_id: Optional[str]) -> dict:
    """{notes: [...], source: "ai" | "none"}."""
    if not get_settings().ai_active:
        return {"notes": [], "source": "none"}
    lib = get_library()
    limit = note_limit(category)
    ctx_text = point_text if category != "additional" else " ".join(other_points)
    key = _cache_key("example_notes", u.td.territory_id, p["hcp_id"], category, point_text, reception,
                     "||".join(other_points), lib.content_version)
    cached = cache_get(key)
    if cached is not None:
        return {"notes": list(cached.get("notes") or []), "source": "ai"}
    ints = sorted((i for i in u.td.interactions if i["HCP_ID"] == p["hcp_id"]),
                  key=lambda i: i["INTERACTION_DATE"] or today(), reverse=True)[:MAX_INTERACTIONS]
    body = {"request_id": request_id, "category": category,
            "category_label": LABELS.get(category, ADDITIONAL_LABEL), "point_text": point_text,
            "reception": RECEPTION_WORDS.get(reception) if reception is not None else None,
            "other_points": other_points, "participant": participant_payload(u, p),
            "interactions": [{"date": i["INTERACTION_DATE"].isoformat() if i["INTERACTION_DATE"] else None,
                              "type_label": i.get("INTERACTION_TYPE") or u.refs.channel(i["CHANNEL_CODE"])["TYPE_LABEL"],
                              "summary": i.get("SUMMARY") or ""} for i in ints],
            "count": MAX_NOTES, "max_chars": limit}
    notes = valid_notes(n8n_client.post(get_settings().n8n_example_notes_path, body), ctx_text, limit)
    if not notes:
        return {"notes": [], "source": "none"}
    cache_put(key, "example_notes", {"notes": notes})
    return {"notes": notes, "source": "ai"}
