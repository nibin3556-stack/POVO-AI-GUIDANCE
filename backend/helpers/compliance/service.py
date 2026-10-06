"""Run a compliance check, optionally add the LLM second pass, persist it.

Order matters and is the whole safety argument:

  1. The rules run first and their findings are ALWAYS kept.
  2. When AI is on, n8n may ADD issues (rule ids from the 14 allowed only) and
     propose a better rewrite. It can never remove a rules finding. Of the
     built-in detectors (unreadable / incomplete / vague / unrelated) at most one
     is reported, and a rules finding wins over the AI's.
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
from helpers.compliance.rewrite import suggest
from helpers.content.library import get_library
from helpers.dates import now_utc
from database.tables import app
from database.warehouse import get_warehouse

NOTE_LIMIT = {"additional": 600}
DEFAULT_NOTE_LIMIT = 200


def compliance_steps(brand_code: Optional[str] = None) -> list[str]:
    """The modal's three steps. The rule count follows the active rulebook, not a fixed 14."""
    return ["Reading your note", f"Checking against {len(get_library(brand_code).compliance_rules)} compliance rules",
            "Drafting a rewrite"]


def note_limit(category: str) -> int:
    return NOTE_LIMIT.get(category, DEFAULT_NOTE_LIMIT)


def evaluate(note: str, category: str, point_text: str, who: str, ctx_text: str,
             participant_role: str = "HCP", request_id: Optional[str] = None, use_ai: bool = True,
             brand_code: Optional[str] = None) -> dict:
    """The check result (not persisted). ctx_text is what relevance is judged against."""
    lib = get_library(brand_code)
    rules, texts = lib.compliance_rules, lib.compliance_texts
    txt = (note or "").strip()
    rel_ctx = ctx_text if category == "additional" else (point_text or ctx_text or "")
    issues = check(txt, rel_ctx, rules)
    for x in issues:
        if x.get("cut"):
            x["why"], x["fix"] = texts.cut_off.get("why"), texts.cut_off.get("fix")
    suggested = suggest(txt, issues, rules, texts, category, who, point_text or "", rel_ctx) if issues else ""
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
                if rid not in by_id or rid in have:
                    continue
                if rid in BUILT_IN and have & set(BUILT_IN):
                    continue  # one built-in finding at most; the rules' own wins
                hit = str(extra.get("excerpt") or "")[:200]
                issues.append({"rule": by_id[rid], "hit": hit, "why": str(extra.get("why") or "")[:400] or None,
                               # The AI's "incomplete" is a cut-off note, not an unfilled [bracket].
                               "fix": texts.cut_off.get("fix") if rid == "ph" and "[" not in hit else None})
                have.add(rid)
            cand = out.get("suggested_text")
            if issues and isinstance(cand, str) and cand.strip() and len(cand) <= note_limit(category):
                leftover = [x for x in check(cand.strip(), rel_ctx, rules)
                            if x["rule"]["RULE_ID"] != "ph" or x.get("cut")]
                if not leftover:
                    suggested = cand.strip()
            issues.sort(key=lambda x: {"high": 0, "med": 1, "low": 2}.get(x["rule"]["SEVERITY"], 1))
    return {"status": "flagged" if issues else "passed", "result_label": result_label(issues),
            "max_severity": max_severity(issues), "score": score(issues),
            "issues": [issue_out(x) for x in issues], "suggested_text": suggested or None,
            "steps": compliance_steps(brand_code), "engine": engine}


def latest_ai_check(call_id: str, participant_id: str, category: str, point_id: str, note: str,
                    brand_code: Optional[str] = None) -> Optional[dict]:
    """The newest AI-assisted check of exactly this note on this call slot, as a full result, or None.

    Submit reuses it instead of calling the LLM again, and a check whose AI pass
    failed falls back to it: the rules are part of every "rules+llm" result, so
    the reused verdict is never weaker than a rules re-run, and the rep never sees
    "passed" for a text the AI flagged.
    """
    rows = get_warehouse().query(
        f"SELECT CHECK_ID, RESULT_LABEL, MAX_SEVERITY, SCORE, ISSUES_JSON, SUGGESTED_TEXT, ENGINE "
        f"FROM {app('APP_COMPLIANCE_CHECK')} "
        f"WHERE BRAND_CODE = :brand AND CALL_ID = :cid AND PARTICIPANT_ID = :pid AND CATEGORY = :cat "
        f"AND POINT_ID = :point AND NOTE_TEXT = :note AND ENGINE = 'rules+llm' ORDER BY CREATED_AT DESC LIMIT 1",
        {"brand": brand_code or get_settings().default_brand_code, "cid": call_id, "pid": participant_id,
         "cat": category, "point": point_id, "note": note})
    if not rows:
        return None
    r = rows[0]
    issues = json.loads(r.get("ISSUES_JSON") or "[]")
    return {"check_id": r["CHECK_ID"], "status": "flagged" if issues else "passed", "result_label": r["RESULT_LABEL"],
            "max_severity": r.get("MAX_SEVERITY"), "score": int(r.get("SCORE") or 0), "issues": issues,
            "suggested_text": r.get("SUGGESTED_TEXT"), "steps": compliance_steps(brand_code), "engine": r["ENGINE"]}


def persist(result: dict, call_id: Optional[str], participant_id: str, category: str, point_id: str,
            note: str, rep_id: str, acted_by: str, brand_code: Optional[str] = None) -> str:
    check_id = str(uuid.uuid4())
    get_warehouse().insert("APP_COMPLIANCE_CHECK", [{
        "BRAND_CODE": brand_code or get_settings().default_brand_code, "CHECK_ID": check_id, "CALL_ID": call_id, "PARTICIPANT_ID": participant_id, "CATEGORY": category,
        "POINT_ID": point_id, "NOTE_TEXT": note, "RESULT_LABEL": result["result_label"],
        "MAX_SEVERITY": result["max_severity"], "SCORE": result["score"],
        "ISSUES_JSON": json.dumps(result["issues"]), "SUGGESTED_TEXT": result["suggested_text"],
        "ENGINE": result["engine"], "SUGGESTION_ACCEPTED": False, "REP_EMPLOYEE_ID": rep_id,
        "ACTED_BY_EMPLOYEE_ID": acted_by, "CREATED_AT": now_utc()}])
    return check_id
