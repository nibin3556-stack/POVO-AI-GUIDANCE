"""Run a compliance check, optionally add the LLM second pass, persist it.

Order matters and is the whole safety argument:

  1. The rules run first and their findings are ALWAYS kept.
  2. When AI is on, n8n may ADD issues (rule ids from the 14 allowed only) and
     propose a better rewrite. It can never remove a rules finding.
  3. The LLM rewrite is used only if it fits the length limit and passes the
     rules itself (unfilled [brackets] allowed, they are the rep's to fill).

The original note is kept in APP_COMPLIANCE_CHECK.NOTE_TEXT for audit; the
audit row itself carries rule ids and the score only.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from core.config import get_settings
from helpers import n8n_client
from helpers.compliance.engine import (BUILT_IN, check, issue_out, max_severity, result_label, score)
from helpers.compliance.rewrite import CAT_CODE, suggest
from helpers.content.library import get_library
from helpers.dates import now_utc
from database.warehouse import get_warehouse

STEPS = ["Reading your note", "Checking against 14 compliance rules", "Drafting a rewrite"]
NOTE_LIMIT = {"additional": 600}


def note_limit(category: str) -> int:
    return NOTE_LIMIT.get(category, 200)


def evaluate(note: str, category: str, point_text: str, who: str, ctx_text: str,
             participant_role: str = "HCP", request_id: Optional[str] = None, use_ai: bool = True) -> dict:
    """The check result (not persisted). ctx_text is what relevance is judged against."""
    rules = get_library().compliance_rules
    txt = (note or "").strip()
    rel_ctx = ctx_text if category == "additional" else (point_text or ctx_text or "")
    issues = check(txt, rel_ctx, rules)
    cat = CAT_CODE.get(category, "m")
    suggested = suggest(txt, issues, rules, cat, who, point_text or "", rel_ctx) if issues else ""
    engine = "rules"
    if use_ai and get_settings().ai_active and txt:
        allowed = [r["RULE_ID"] for r in rules]
        out = n8n_client.post(get_settings().n8n_compliance_path, {
            "request_id": request_id, "category": category, "point_text": point_text or "",
            "participant_role": participant_role, "note": txt,
            "rule_findings": [{"rule_id": x["rule"]["RULE_ID"], "title": x["rule"]["TITLE"],
                               "severity": x["rule"]["SEVERITY"]} for x in issues],
            "allowed_rule_ids": allowed})
        if out is not None:
            engine = "rules+llm"
            by_id = {r["RULE_ID"]: r for r in rules}
            have = {x["rule"]["RULE_ID"] for x in issues}
            for extra in out.get("issues") or []:
                rid = extra.get("rule_id") if isinstance(extra, dict) else None
                if rid in by_id and rid not in have and rid not in BUILT_IN:
                    issues.append({"rule": by_id[rid], "hit": str(extra.get("excerpt") or "")[:200],
                                   "why": str(extra.get("why") or "")[:400] or None})
                    have.add(rid)
            cand = out.get("suggested_text")
            if issues and isinstance(cand, str) and cand.strip() and len(cand) <= note_limit(category):
                leftover = [x for x in check(cand.strip(), rel_ctx, rules) if x["rule"]["RULE_ID"] != "ph"]
                if not leftover:
                    suggested = cand.strip()
            issues.sort(key=lambda x: {"high": 0, "med": 1, "low": 2}.get(x["rule"]["SEVERITY"], 1))
    return {"status": "flagged" if issues else "passed", "result_label": result_label(issues),
            "max_severity": max_severity(issues), "score": score(issues),
            "issues": [issue_out(x) for x in issues], "suggested_text": suggested or None,
            "steps": list(STEPS), "engine": engine}


def persist(result: dict, call_id: Optional[str], participant_id: str, category: str, point_id: str,
            note: str, rep_id: str, acted_by: str) -> str:
    check_id = str(uuid.uuid4())
    get_warehouse().insert("APP_COMPLIANCE_CHECK", [{
        "CHECK_ID": check_id, "CALL_ID": call_id, "PARTICIPANT_ID": participant_id, "CATEGORY": category,
        "POINT_ID": point_id, "NOTE_TEXT": note, "RESULT_LABEL": result["result_label"],
        "MAX_SEVERITY": result["max_severity"], "SCORE": result["score"],
        "ISSUES_JSON": json.dumps(result["issues"]), "SUGGESTED_TEXT": result["suggested_text"],
        "ENGINE": result["engine"], "SUGGESTION_ACCEPTED": False, "REP_EMPLOYEE_ID": rep_id,
        "ACTED_BY_EMPLOYEE_ID": acted_by, "CREATED_AT": now_utc()}])
    return check_id
