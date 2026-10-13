# POVO AI Guidance content (owned by the backend)

These four files are the source of the `REF_` content tables. The seeder copies them into
`seed/output/*.csv` unchanged; the backend reads the tables through the warehouse and falls back
to these files when the tables are empty. `CONTENT_VERSION` is `2026.2`; it is part of the AI
cache key, so bump it whenever the text changes.

| File | Table | Rows |
|---|---|---|
| `talking_points.json` | `REF_TALKING_POINT` | 62 |
| `objection_rules.json` | `REF_OBJECTION_RULE` | 10 |
| `compliance_rules.json` | `REF_COMPLIANCE_RULE` | 14 |
| `compliance_texts.json` | `REF_COMPLIANCE_TEXT` | 12 |

This is **dummy seed content** until the client supplies approved text: it was transcribed from the
v2 POC (`POVO_AI_Guidance_Step3_63_Alt 2.html`), which is a reference for the data shapes only.
`MLR_CODE` is `DRAFT-POC-3.63` until real approval codes are assigned. Replacing it is a table load;
the code holds none of this text. The LLM never
rewrites it; it can only choose points, order them and write insight lines.

## Template syntax

Templates (`TEXT_TEMPLATE`, `DETAIL_TEMPLATE`, `NEXT_CALL_TEMPLATE`) use `{snake_case}` placeholders,
rendered with `str.format_map`. An unknown placeholder is left as-is and never raises.

A template can hold **alternatives** separated by ` || `. Each alternative can start with a
condition, `[flag]` or `[!flag]`. The backend uses the first alternative whose condition holds, or
the first one without a condition. This keeps every word in content, not in code:

```
[is_writer] {hs_not_on_povo} of {hs_patients} HS patients are not on POVO yet || No POVO patients yet; {hs_patients} HS patients to reach
```

## Placeholders

| Placeholder | Meaning | Example |
|---|---|---|
| `{display_name}` | The participant: "Dr. Last" for a physician, "First Last" for an NP/PA | `Dr. Winters` |
| `{physician_display_name}` | The primary physician (for NP/PA text) | `Dr. Winters` |
| `{physician_possessive}` | The primary physician, possessive | `Dr. Winters'` |
| `{account_name}` | The participant's account | `Maine Medical Partners Dermatology` |
| `{hs_patients}` | HS patients, last 12 months | `133` |
| `{hs_not_on_povo}` | HS patients minus POVO patients | `124` |
| `{povo_patients}` | POVO patients | `9` |
| `{jak_patients}` | HS patients on a JAK inhibitor | `4` |
| `{decile}` | Decile, 1 to 10 | `10` |
| `{rank}` / `{rank_of}` | HS rank in the territory / number of POVO Targets | `1` / `83` |
| `{focus_label}` | Competitive focus label | `Humira` |
| `{segment_short_name}` | Segment short name | `Advanced Biologics plus JAK` |
| `{msl_date_short}` | Latest MSL visit (physician) | `Sep 12` |
| `{speaker_date_short}` | Latest speaker program (physician) | `Sep 3` |
| `{adfa_date_short}` | Latest ADFA visit (physician's office) | `Aug 28` |
| `{call_date}` | The assessed call, MM/DD/YYYY | `10/13/2026` |
| `{call_date_long}` | The assessed call, long form | `Oct 13, 2026` |
| `{opener}` | Objections only: the rotating opener for the point's position (1 to 5): "Expect {n} to", "Be ready for {n} to", "Be advised that {n} may", "Prepare for {n} to", "Watch for {n} to" | `Be advised that Dr. Winters may` |

## Condition flags

| Flag | True when |
|---|---|
| `is_writer` | POVO patients > 0 |
| `povo_one` | exactly 1 POVO patient |
| `is_jak_focus` | competitive focus is `jak` |
| `jak_one` | JAK focus and exactly 1 JAK patient |
| `has_msl_visit` / `has_speaker_program` / `has_adfa_visit` | the physician has such an interaction |
| `never_called` | no rep call on record for the participant |
| `seg_imm` / `seg_exp` / `seg_conv` | the participant's HS treatment segment |
| `well_received` | next-call closings: the closing was rated Well Received |

## Selection rules

- **Messaging and closings:** active `initial` rows for the participant's role (or `ALL`) and segment
  (or `ALL`). Rows with the same `SORT_ORDER` are alternatives for one slot, and the most specific
  wins (segment before audience before `ALL`). The screen shows the first 3.
- **Objections:** the `REF_OBJECTION_RULE` row matching audience, segment, decile range and writer
  state, with the lowest `PRIORITY`, lists the ordered `POINT_ID`s.
- **Next call:** `NEXT_CALL_TEMPLATE` is the follow-up of a delivered point ("Builds on well
  received" / "Builds on moderate"); closings choose the `[well_received]` or the other text. The
  `peer` row and the `pool` rows are the new messages the ranking can add ("New").

## Compliance rules

Ten rules are Python regexes (`PATTERN`, case-insensitive; the patient-name part of `phi` is
case-sensitive through `(?-i:...)`), with an optional `SUPPRESS_PATTERN`. `gib`, `vague` and `rel`
have no pattern and are built-in detectors in `backend/helpers/compliance/engine.py`. `ph` matches
unfilled `[brackets]`, and the engine also flags a note cut off mid-sentence (it ends on a word such as
"a", "the", "before" or "and", or on a comma). Only titles, chips, severities, deductions and texts are read from the table
for those.
