"""Suggested rewrite of a flagged note (POC compFix, ported line by line).

Keep the rep's own words, drop what cannot stay, fall back to a short
template for the point:

  1. Only an unfilled [bracket]  -> no rewrite (the rep just fills it in).
  2. Unreadable, vague or unrelated -> the template for the category.
  3. Otherwise split into clauses; drop off-topic / personal clauses; replace
     off-label, adverse-event and pricing clauses with the approved lines
     ("Off-label question sent to Medical Information", ...); strip claims,
     patient identifiers, vulgar, unprofessional and filler words; keep the
     clauses that still read as a sentence.
  4. If the result is too short, vague, still flagged, or lost too much of
     the rep's content, use the template instead.

Categories: m (messaging), o (objection), c (closing), n (additional notes).
"""
from __future__ import annotations

import re

from helpers.compliance.engine import check, is_vague, rel_words

VUL_RE = re.compile(r"\b(damn|crap|shit\w*|fuck\w*|bitch\w*|bastard\w*|ass|asshole\w*|dick\w*|piss\w*|wtf|stfu|"
                    r"bullshit|hell)\b", re.I)
LANG_RE = re.compile(r"\b(weird|ugly|awkward|very bad|bad|poor|stupid|dumb|idiot\w*|lazy|rude|crazy|annoying|useless|"
                     r"terrible|horrible|pathetic|clueless|incompetent|disgusting|gross|smelly|fat|fatty|chubby|skinny|"
                     r"hideous|freak\w*|moron\w*|jerk|sucks?|waste of time|whatever|dunno|lol|omg)\b", re.I)
FILL_RE = re.compile(r"\b(basically|honestly|literally|kind of|kinda|sort of|sorta|you know|etc\.?|blah|and so on|"
                     r"bla bla)\b", re.I)
ABBR = re.compile(r"\b(Dr|Mr|Mrs|Ms|St|vs|e\.g|i\.e)\.")
DOT = "․"  # one dot leader: shields "Dr." from the sentence splitter
DANGLE = re.compile(r"\b(a|an|the|is|was|are|were|very|so|really|such)\s+(and|or|but)\b|\b(and|or|but)\s*$|"
                    r"^(and|or|but)\b", re.I)
BADEND = re.compile(r"\b(about|with|to|of|for|on|in|at|by|from|is|was|are|were|and|or|but|it|that|this|she|he|"
                    r"they|we)$", re.I)
CAT_CODE = {"messaging": "m", "objection": "o", "closing": "c", "additional": "n"}


def short_point(t: str) -> str:
    s = re.sub(r"\s+", " ", re.split(r"[;:]", str(t or ""))[0]).strip()
    if len(s) > 70:
        s = re.sub(r"\s+\S*$", "", s[:68]) + "…"
    return s


def template(cat: str, who: str, point: str) -> str:
    who = who or "the HCP"
    p = short_point(point) if point else ""
    if cat == "o":
        return f"{who} raised: {p}. Addressed with approved HS data; objection [resolved / still open]"
    if cat == "c":
        return f"Closed with: {p}. {who} [agreed / asked for follow-up]"
    if cat == "n":
        return f"Also discussed [topic] with {who}. {who} [response]; next step: [action]"
    return f"Covered: {p}. {who} [response]; next step: [action]"


def suggest(txt: str, issues: list[dict], rules: list[dict], cat: str, who: str, point: str,
            ctx_text: str) -> str:
    """The rewrite; "" when the only issue is an unfilled bracket."""
    ids = {x["rule"]["RULE_ID"]: x for x in issues}
    if "ph" in ids and len(issues) == 1:
        return ""
    if {"gib", "vague", "rel"} & ids.keys():
        return template(cat, who, point)
    pat = {r["RULE_ID"]: re.compile(r["PATTERN"], re.I) for r in rules if r.get("PATTERN")}
    src = ABBR.sub(lambda m: m.group(1) + DOT, str(txt))
    clauses = re.split(r"(?<=[.!?;])\s+|\n+|\s*,\s*(?=\w)", src)
    keep: list[str] = []
    add: dict[str, str] = {}

    def clean(s: str) -> str:
        if "claim" in ids:
            s = pat["claim"].sub("", s)
            s = re.sub(r"\b(than|vs\.?)\s+[\w-]+", "", s, flags=re.I)
        if "phi" in ids:
            s = re.sub(r"\b([Pp]atient|[Pp]t|Mr|Mrs|Ms)" + DOT + r"?\s+[A-Z][a-z]{2,}", "a patient", s)
            s = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b", "", s)
            s = re.sub(r"\b(dob|date of birth|mrn|medical record|ssn)\b", "", s, flags=re.I)
        s = re.sub(r"\bhate[sd]?\b", "was not receptive to", s, flags=re.I)
        s = FILL_RE.sub("", LANG_RE.sub("", VUL_RE.sub("", s)))
        s = re.sub(r"\s{2,}", " ", s)
        s = re.sub(r"\s+([,.;!?])", r"\1", s)
        s = re.sub(r"^[,;\s]+|[,;\s.!?]+$", "", s).strip()
        for _ in range(3):
            s = re.sub(r"\b(a|an|the|very|so|really|such|this|that|is|was|are|were|it|and|or|but)\s*$", "", s,
                       flags=re.I).strip()
        if re.match(r"^(was|were|is|are) not receptive", s, re.I):
            s = f"{who or 'HCP'} {s}"
        return s

    def ok(s: str) -> bool:
        return len(s.split()) >= 3 and len(rel_words(s)) >= 2 and not BADEND.search(s)

    for c in clauses:
        s = (c or "").strip()
        if not s:
            continue
        if "irr" in ids and pat["irr"].search(s):
            continue
        if "sens" in ids and pat["sens"].search(s):
            continue
        if "off" in ids and pat["off"].search(s):
            add.setdefault("off", "Off-label question sent to Medical Information")
            continue
        if "ae" in ids and pat["ae"].search(s):
            add.setdefault("ae", "Safety information reported to Pharmacovigilance")
            continue
        if "price" in ids and pat["price"].search(s):
            add.setdefault("price", "Access questions referred to IncyteCARES")
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
        return template(cat, who, point)
    if check(out, point or ctx_text or "", rules):
        return template(cat, who, point)
    w0, w1 = len(rel_words(txt)), len(rel_words(out))
    if w0 and w1 / w0 < 0.6:
        return template(cat, who, point)
    return out
