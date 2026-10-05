"""The 14-rule compliance check on call notes (POC compCheck / compScore).

The rules and their metadata (chip, title, severity, deduction, why, fix) live
in REF_COMPLIANCE_RULE. Ten are regexes (PATTERN, case-insensitive, with an
optional SUPPRESS_PATTERN: "medical information" suppresses off-label,
"reported to pharmacovigilance" suppresses adverse event). Four are built-in
detectors whose logic is here, exactly as in the POC:

  * gib   : words that are not words (keyboard mashes, no vowels, "xxxx")
  * ph    : an unfilled [bracket] (the rewrite template's placeholders), or a
            note cut off mid-sentence ("... works before a")
  * vague : under 3 words, or a stock phrase like "good call"
  * rel   : shares no content word with the point or the HS/POVO vocabulary

Only one of gib / ph / vague / rel is reported, in that priority. The result is
sorted high -> med -> low severity. The rules pass is deterministic and is the
guaranteed floor; the LLM pass (api/compliance.py) may only ADD issues.

Score: 100 minus each deduction, capped at 75 when anything is found.
Label: "Compliant" with no issues, else from the highest severity
(high = Non-compliant, med = Needs review, low = Minor issue).
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

SEV_RANK = {"high": 0, "med": 1, "low": 2}
LABEL_BY_SEVERITY = {"high": "Non-compliant", "med": "Needs review", "low": "Minor issue"}
BUILT_IN = ("gib", "ph", "vague", "rel")

#: A note that ends on one of these words (or a comma, colon, dash) stops mid-sentence.
CUT_RE = re.compile(r"(?:[,:;(&/-]|\b(?:a|an|the|to|of|for|with|at|by|from|before|after|during|into|than|and|or|but|"
                    r"so|because|if|that|which|who|whose|is|was|are|were|be|been|will|would|can|could|should|"
                    r"may|might|must|has|have|had|his|her|their|our|my|your|its|this|these|those|very|how|what|"
                    r"when|where|why))\s*[.!?]*$", re.I)

REL_STOP = re.compile(
    r"^(the|a|an|and|or|but|of|to|in|on|at|for|with|by|from|as|is|are|was|were|be|been|it|its|this|that|these|"
    r"those|he|she|they|we|you|i|his|her|their|our|my|me|him|them|not|no|yes|so|if|then|than|very|just|also|"
    r"about|into|over|after|before|during|has|have|had|do|does|did|will|would|can|could|should|may|might|there|"
    r"here|what|which|who|how|when|where|any|some|all|more|most|one|two|three|up|down|out|off|per|via|each|both)$")
REL_VOCAB = ("hs hidradenitis suppurativa povo patient patients hcp doctor dr office staff nurse np pa rep msl flare "
             "flares tunnel tunnels scar scarring lesion lesions abscess nodule pain drain draining derm dermatology "
             "skin disease prior authorization auth pa benefit benefits coverage insurance payer payor incytecares "
             "cares enroll enrollment enrolled start starts started checklist fill pharmacy specialty rx prescription "
             "prescribe prescribed prescribing dose dosing label indication efficacy safety data trial study evidence "
             "pi reassess reassessment follow followup visit call discuss discussed discussion review reviewed agree "
             "agreed ask asked question questions respond responded response receptive interest interested concern "
             "concerns hesitant open resolved next step steps action plan owner owns form submit submitted process "
             "timeline sample treat treatment treated therapy control controlled progression progress adherence "
             "outcome guide brochure counsel counseling refer referral identify identified candidate candidates "
             "chart charts moderate severe recurring current care medical information objection closing message "
             "point drug medication medicine product brand jak inhibitor").split()
WORD_OK = re.compile(r"^(hcps?|hs|np|pa|msl|adfa|povo|jak|trx|rx|pi|mri|er|md|do|dr|ok|mrn|dob|pt|pts|q\d|w/|vs)$", re.I)
VAGUE_RE = re.compile(r"^(ok|okay|good|fine|done|nice|great|na|n/a|none|nothing|same|as usual|went well|good call|"
                      r"bad call|no comments?|all good|call done|discussed|talked|met hcp|met|nil|-+)$")


def rel_stem(w: str) -> str:
    return re.sub(r"(ing|ed|es|s)$", "", w.lower(), count=1)


def rel_words(txt: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for w in re.findall(r"[a-z][a-z'-]{1,}", str(txt).lower()):
        w = re.sub(r"'s$", "", w)
        if len(w) < 3 or REL_STOP.match(w):
            continue
        out[rel_stem(w)] = 1
    return out


REL_VSET = {rel_stem(w) for w in REL_VOCAB}


def is_unrelated(txt: str, ctx_text: str) -> bool:
    words = list(rel_words(txt))
    if len(words) < 3:
        return False
    ctx = rel_words(ctx_text or "")
    return not any(w in ctx or w in REL_VSET for w in words)


def gib_words(txt: str) -> list[str]:
    out = []
    for w in re.findall(r"[A-Za-z]{3,}", txt):
        low = w.lower()
        if WORD_OK.match(low):
            continue
        if (re.match(r"^(asdf\w*|qwer\w*|zxcv\w*|hjkl\w*|lorem|ipsum|test\w*|xxx+|aaa+|blah)$", low)
                or not re.search(r"[aeiouy]", low) or re.search(r"(.)\1\1", low)
                or re.search(r"[bcdfghjklmnpqrstvwxz]{5,}", low)):
            out.append(w)
    return out


def is_cut_off(txt: str) -> bool:
    """True for a note that ends mid-sentence ("HCP asked how lab monitoring works before a")."""
    return len(txt.split()) >= 2 and bool(CUT_RE.search(txt.strip()))


def is_vague(txt: str) -> bool:
    t = re.sub(r"[.!]+$", "", txt.strip().lower())
    if VAGUE_RE.match(t):
        return True
    return len([w for w in re.split(r"\s+", t) if w]) < 3


@lru_cache(maxsize=64)
def _compiled(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.I)


def check(txt: str, ctx_text: str, rules: list[dict]) -> list[dict]:
    """Issues found in a note: [{rule, hit}] sorted by severity (POC compCheck)."""
    by_id = {r["RULE_ID"]: r for r in rules}
    out: list[dict] = []
    for r in rules:
        if r["RULE_ID"] in BUILT_IN or not r.get("PATTERN"):
            continue
        sup = r.get("SUPPRESS_PATTERN")
        if sup and _compiled(sup).search(txt):
            continue
        m = _compiled(r["PATTERN"]).search(txt)
        if m:
            out.append({"rule": r, "hit": m.group(0)})
    ph = re.search(r"\[[^\]]*\]", txt)
    gib = gib_words(re.sub(r"\[[^\]]*\]", "", txt))
    if gib and "gib" in by_id:
        out.insert(0, {"rule": by_id["gib"], "hit": ", ".join(gib[:3])})
    elif ph and "ph" in by_id:
        out.append({"rule": by_id["ph"], "hit": ph.group(0)})
    elif is_cut_off(txt) and not is_vague(txt) and "ph" in by_id:
        # why / fix for this case come from REF_COMPLIANCE_TEXT (cut_off); the rule's own are about [brackets].
        out.append({"rule": by_id["ph"], "hit": txt.strip(), "cut": True})
    elif is_vague(txt) and "vague" in by_id:
        out.append({"rule": by_id["vague"], "hit": txt.strip()})
    elif (is_unrelated(txt, ctx_text) and "rel" in by_id
          and not any(x["rule"]["RULE_ID"] in ("irr", "sens") for x in out)):
        out.append({"rule": by_id["rel"], "hit": txt.strip()})
    out.sort(key=lambda x: SEV_RANK.get(x["rule"]["SEVERITY"], 1))  # stable, like Array.sort
    return out


def score(issues: list[dict]) -> int:
    s = 100 - sum(int(x["rule"].get("DEDUCTION") or 10) for x in issues)
    if issues:
        s = min(s, 75)
    return max(0, min(100, s))


def max_severity(issues: list[dict]) -> Optional[str]:
    if not issues:
        return None
    return min((x["rule"]["SEVERITY"] for x in issues), key=lambda s: SEV_RANK.get(s, 1))


def result_label(issues: list[dict]) -> str:
    sev = max_severity(issues)
    return "Compliant" if sev is None else LABEL_BY_SEVERITY.get(sev, "Needs review")


def score_label(s: int) -> str:
    """POC scoreLbl(): the label for a score alone."""
    return "Compliant" if s >= 80 else ("Needs review" if s >= 60 else "Non-compliant")


def issue_out(x: dict) -> dict:
    r = x["rule"]
    return {"rule_id": r["RULE_ID"], "chip": r["CHIP_LABEL"], "title": r["TITLE"], "severity": r["SEVERITY"],
            "why": x.get("why") or r["WHY_TEXT"], "fix": x.get("fix") or r["FIX_TEXT"], "excerpt": x["hit"]}
