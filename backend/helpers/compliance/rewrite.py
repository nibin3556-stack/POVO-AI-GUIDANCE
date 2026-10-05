"""Suggested rewrite of a flagged note (POC compFix).

Keep the rep's own words, drop what cannot stay, and add [placeholders] for
what the rep still has to write. The rewrite never pastes talking-point text.
Every word it adds comes from REF_COMPLIANCE_TEXT, and the words it strips are
matched with the REF_COMPLIANCE_RULE patterns, so nothing is hardcoded here:

  1. Only an unfilled [bracket]  -> no rewrite (the rep just fills it in).
     Only cut off mid-sentence   -> the rep's words, minus the dangling tail,
                                    plus the cut_off placeholder.
  2. Unreadable, vague or unrelated -> the category's template (placeholders).
  3. Otherwise split into clauses; drop off-topic / personal clauses; replace
     off-label, adverse-event and pricing clauses with their replacement line;
     reword, then strip claims, patient identifiers, vulgar, unprofessional and
     filler words; keep the clauses that still read as a sentence.
  4. If the result is too short, vague, still flagged, or lost too much of
     the rep's content, use the template instead.
"""
from __future__ import annotations

import re

from helpers.compliance.engine import CUT_RE, check, is_vague, rel_words
from helpers.content.library import ComplianceTexts
from helpers.content.render import render

ABBR = re.compile(r"\b(Dr|Mr|Mrs|Ms|St|vs|e\.g|i\.e)\.")
DOT = "․"  # one dot leader: shields "Dr." from the sentence splitter
DANGLE = re.compile(r"\b(a|an|the|is|was|are|were|very|so|really|such)\s+(and|or|but)\b|\b(and|or|but)\s*$|"
                    r"^(and|or|but)\b", re.I)
BADEND = re.compile(r"\b(about|with|to|of|for|on|in|at|by|from|is|was|are|were|and|or|but|it|that|this|she|he|"
                    r"they|we)$", re.I)
#: Rules whose matched words are removed from a kept clause.
STRIP_RULES = ("vulgar", "lang", "fill")
#: Rules whose clause is replaced by the approved line for that rule.
REPLACE_RULES = ("off", "ae", "price")


def finish_cut(txt: str, texts: ComplianceTexts) -> str:
    """'HCP asked how lab monitoring works before a' -> 'HCP asked how lab monitoring works <placeholder>.'"""
    placeholder = texts.cut_off.get("placeholder")
    if not placeholder:
        return ""
    s = txt.strip()
    for _ in range(4):
        s = re.sub(r"[\s,:;(&/.!?-]+$", "", s)
        s = re.sub(r"\s+\S+$", "", s) if CUT_RE.search(s) else s
    return f"{s} {placeholder}." if s else ""


def template(category: str, who: str, texts: ComplianceTexts) -> str:
    """The category's fallback from REF_COMPLIANCE_TEXT; "" when there is none."""
    tpl = texts.templates.get(category)
    return (render(tpl, {"who": who or "HCP"}, set()) or "") if tpl else ""


def suggest(txt: str, issues: list[dict], rules: list[dict], texts: ComplianceTexts, category: str, who: str,
            point: str, ctx_text: str) -> str:
    """The rewrite; "" when the only issue is an unfilled bracket."""
    ids = {x["rule"]["RULE_ID"]: x for x in issues}
    if "ph" in ids and len(issues) == 1:
        return finish_cut(txt, texts) if ids["ph"].get("cut") else ""
    if {"gib", "vague", "rel"} & ids.keys():
        return template(category, who, texts)
    pat = {r["RULE_ID"]: re.compile(r["PATTERN"], re.I) for r in rules if r.get("PATTERN")}
    strip = [pat[r] for r in STRIP_RULES if r in pat]
    rewords = [(re.compile(p, re.I), t) for p, t in texts.rewords]
    anonymous = texts.replacements.get("phi_name", "")
    src = ABBR.sub(lambda m: m.group(1) + DOT, str(txt))
    clauses = re.split(r"(?<=[.!?;])\s+|\n+|\s*,\s*(?=\w)", src)
    keep: list[str] = []
    add: dict[str, str] = {}

    def clean(s: str) -> str:
        if "claim" in ids:
            s = pat["claim"].sub("", s)
            s = re.sub(r"\b(than|vs\.?)\s+[\w-]+", "", s, flags=re.I)
        if "phi" in ids:
            s = re.sub(r"\b([Pp]atient|[Pp]t|Mr|Mrs|Ms)" + DOT + r"?\s+[A-Z][a-z]{2,}", anonymous, s)
            s = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b", "", s)
            s = re.sub(r"\b(dob|date of birth|mrn|medical record|ssn)\b", "", s, flags=re.I)
        for rx, replacement in rewords:
            s = rx.sub(replacement, s)
        for rx in strip:
            s = rx.sub("", s)
        s = re.sub(r"\s{2,}", " ", s)
        s = re.sub(r"\s+([,.;!?])", r"\1", s)
        s = re.sub(r"^[,;\s]+|[,;\s.!?]+$", "", s).strip()
        for _ in range(3):
            s = re.sub(r"\b(a|an|the|very|so|really|such|this|that|is|was|are|were|it|and|or|but)\s*$", "", s,
                       flags=re.I).strip()
        # A reworded clause that lost its subject ("was not receptive to ...") gets the participant back.
        if any(s.lower().startswith(t.lower()) for _, t in texts.rewords if t):
            s = f"{who or 'HCP'} {s}"
        return s

    def ok(s: str) -> bool:
        return len(s.split()) >= 3 and len(rel_words(s)) >= 2 and not BADEND.search(s)

    for c in clauses:
        s = (c or "").strip()
        if not s:
            continue
        if any(r in ids and r in pat and pat[r].search(s) for r in ("irr", "sens")):
            continue
        hit = next((r for r in REPLACE_RULES if r in ids and r in pat and pat[r].search(s)), None)
        if hit:
            if texts.replacements.get(hit):
                add.setdefault(hit, texts.replacements[hit])
            continue
        w = clean(s)
        if not DANGLE.search(w) and ok(w):
            keep.append(w)
            continue
        for part in re.split(r"\s+(?:and|but)\s+", s, flags=re.I):
            v = clean(part)
            if ok(v):
                keep.append(v)
    out = " ".join(s if re.search(r"[.!?]$", s) else s + "." for s in
                   [(k[0].upper() + k[1:]) for k in keep]).replace(DOT, ".")
    for line in add.values():
        out += (" " if out else "") + line + "."
    if not out or len(out.split()) < 3 or is_vague(out):
        return template(category, who, texts)
    if check(out, point or ctx_text or "", rules):
        return template(category, who, texts)
    w0, w1 = len(rel_words(txt)), len(rel_words(out))
    if w0 and w1 / w0 < 0.6:
        return template(category, who, texts)
    return out
