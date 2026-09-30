# AI generation contract (v2): PROPOSAL, NOT IMPLEMENTED

> **Status:** drafted on 2026-09-30, then put on hold by the user. The current build keeps ARCHITECTURE.md §6: AI through n8n selects and orders the library points and writes insights, with a rules fallback. Implement this document only if the user confirms it.

**Supersedes** ARCHITECTURE.md §6 and the AI and fallback parts of §5. User decision on 2026-09-30:

1. **Every piece of guidance content is written by Azure OpenAI through n8n.**
   - This covers talking points (messaging, objections, closings), insights and responses, profile bullets, AI Guidance panel lines, compliance rewrites, and the next-call revision with its summary, next best action and history line.
   - The AI is **grounded**. It receives the HCP's backend data (facts) and the approved claims from the Databricks content library (`REF_TALKING_POINT`, `REF_OBJECTION_RULE`). The n8n Guard rejects any claim or number that is not in those inputs.
2. **No fallback content, ever.**
   - If n8n or Azure OpenAI is unavailable, or the Guard rejects the answer, the backend returns **HTTP 503**. The body is the envelope `{status: 503, message: "<what is unavailable>", data: {retryable: true, reason}}`.
   - The screen then shows the message and a **Retry** button.
   - Template and rules content generators are removed from the backend: `helpers/content/select.py` templating, `helpers/revision.py` rules, and the `helpers/compliance/rewrite.py` compFix templates.

**What stays deterministic.** These are **data or validation**, not generated content:

- The metrics: KPIs, charts, the numbers in guidance candidates, stats tiles, Must-Wins and tables. They are computed from Databricks data.
- The interaction list and its summaries. They are Databricks data.
- The regex compliance rules. They are a **safety floor** (validation): a rules finding can never be removed by the AI. Issue titles, why and fix text come from `REF_COMPLIANCE_RULE`.
- UI wording (headings, button labels, progress step labels) and the tag vocabulary.
- `AI_ENABLED=false` no longer means "use rules". Every AI endpoint returns 503 "AI is turned off".

## 1. Persistence (no regeneration mid-call)

**Call prep**

- Generated call prep is persisted as **revision 0** in `APP_CALL_PREP_REVISION`, with `ENGINE='ai'` and `CALL_ID` null.
- The row is keyed by territory + primary HCP + participant + category. A rep assesses exactly the points they saw, and they are not regenerated.
- Later revisions (1, 2, …) come from the next-call AI.
- `POST /call-prep` reads the latest revision row. If none exists, it calls n8n, stores revision 0 and returns it.
- `point_id` for AI points is `ai-<12 hex>`, the sha1 of territory|primary|participant|category|revision|rank|text. It is stable once stored.

**Profile bullets and territory guidance** are cached in `APP_AI_CACHE`:

| Content | Cache key | Expiry |
|---|---|---|
| Profile bullets | kind `brief`, key territory+participant+revision_no+data_as_of | 24 h |
| Territory guidance | `APP_TERRITORY_GUIDANCE_SNAPSHOT`, keyed by territory + today | the day |

- The nightly n8n job pre-generates guidance through the backend.
- `GET /performance/guidance` serves today's snapshot, or generates it live and stores it.

**Compliance checks** are stored per note in `APP_COMPLIANCE_CHECK`, as today. `next-call` reuses a check whose `NOTE_TEXT` equals the current note, so it only calls the AI for notes that are unchecked or have changed.

## 2. Backend API changes

### `GET /api/v1/performance/guidance`

```
{ missed:  [{hcp_id|null, text, emphasis|null}],   // ≤ 3 lines; emphasis = substring of text to bold
  strong:  [{text, emphasis|null}],               // ≤ 3 lines
  focus:   [{hcp_id, name, display_name, role_type, tier_code, reason}],   // exactly 3 when ≥ 3 candidates
  source: "ai", generated_at }
```

The backend computes **candidate facts** from the POC rules (see §3 W3) and the AI writes the lines. On AI failure it returns 503.

### `GET /api/v1/targets/{hcp_id}/profile`

The response is unchanged except that it **no longer carries `bullets`**. The field is removed.

### NEW `GET /api/v1/targets/{hcp_id}/participants/{participant_id}/brief`

- Returns `{participant_id, bullets: [string × 5], source: "ai", generated_at}`, or 503.
- Scope: the participant must be the primary or one of its NP/PA, in the effective territory. Otherwise 404.

### `POST /api/v1/call-prep`

- The shape is unchanged. `source` is always `"ai"`, `points[].point_id` has the form `ai-…`, and it returns 503 on AI failure.
- `pillar`, `text` and `detail` come from the AI.
- `detail_label` is set by the backend: messaging → "Insight", objection → "Response", closing → null.

### `POST /api/v1/compliance/check`

- The shape is unchanged. Rules findings plus AI issues are merged.
- `suggested_text` comes from the AI and is **required when any issue exists**.
- On AI failure it returns 503. The assessment row stays `unchecked`; it is never marked passed without the AI.

### `POST /api/v1/calls/{call_id}/next-call`

- Same 409 and 422 semantics as before.
- Every note must have a stored check. Notes without one are checked through the AI first. If any check is unavailable, it returns 503.
- The revised lists come from the AI (W5). The backend persists them as revision n+1.
- On AI failure it returns 503 and **nothing is persisted**: the call stays `planned`.

### `GET /api/v1/reference`

Adds `tag_labels`, a map from status to ready label, so the frontend can show the tag legend if needed. Point `tags` stay ready strings.

## 3. n8n webhooks v2

All webhooks share the following:

- POST, with `responseMode: responseNode`.
- Azure OpenAI Chat Model (`gpt-4.1`, temperature 0.2, `json_object`) with the credential "Azure OpenAI account".
- A Guard Code node, then a single Respond node.
- The response is `{ok: true, ...}` or `{ok: false, reason}`.
- **Every** request carries `request_id` and `facts`. `facts` is the participant or territory data object; the Guard may only accept numbers that appear in `facts`, `interactions` or the cited claims.

**Common Guard rules**

- Numbers: each number token (`\d+(\.\d+)?%?`, excluding list ordinals 1–5 at the start of a line) must occur in the allowed source strings.
- Every generated text must be at most 320 chars and at least 12 chars.
- It must not contain an email, a phone number, a date of birth or an MRN.
- For point generation, every point must cite ≥ 1 `claim_id` from the request, and `pillar` must come from the request's `allowed_pillars`.

| # | Workflow file (version in the name) | Path | Request (besides `request_id`) | Response payload |
|---|---|---|---|---|
| W1 | `POVO AI Guidance - Call Prep v2.json` (replaces v1) | `/webhook/povo-call-prep` | `category`, `facts` (participant: role_type, display_name, full_name, degree, specialty, account_name, city, decile, tier_name, rank, rank_of, segment_short_name, segment_full_name, competitive_focus_label, hs_patients, jak_patients, povo_patients, povo_discussions, last_call_date, parent_display_name\|null, incytecares_enrolled_patients), `interactions` [{date, type_label, team_label, summary}] (≤ 12), `claims` [{claim_id, pillar, text, detail}] (library rows for this category, audience and segment, rendered), `allowed_pillars` [..], `count: 3` | `{points: [{claim_ids: [..], pillar, text, detail}] × count}`. Messaging `detail` is an insight tied to this HCP's facts or interactions; objection `text` is the likely objection phrased for this HCP, with `detail` the approved response; closing `detail` = "". |
| W2 | `POVO AI Guidance - Participant Brief v1.json` (new) | `/webhook/povo-participant-brief` | `facts` (as W1), `interactions`, `post_call` {call_date, messages_well_received, objections_open, closings_well_received}\|null | `{bullets: [string × 5]}`, in POC bullet order: decile/rank/HS visits; segment + competitive focus + patient archetype; POVO status; discussions/last call; IncyteCARES, or the post-call line when `post_call` is given. For NP/PA: works with; decile + HS; role duty; POVO status; discussions. |
| W3 | `POVO AI Guidance - Territory Guidance v1.json` (new) | `/webhook/povo-territory-guidance` | `facts` {territory_name, missed_candidates [{hcp_id, display_name, tier_name, days_since_call}], super_high_not_writing, super_high_tier_name, best_segment {short_name, trial_pct}, top_writer {hcp_id, display_name, povo_patients}\|null, super_high_reach_pct, focus_candidates [{hcp_id, display_name, role_type, tier_name, hs_patients, povo_patients, days_since_call\|null, score}] (top 6)} | `{missed: [{hcp_id\|null, text, emphasis}] ≤ 3, strong: [{text, emphasis}] ≤ 3, focus: [{hcp_id, reason}] × 3 (hcp_ids ⊂ focus_candidates, distinct)}`. `emphasis` must be a substring of `text`. |
| W4 | `POVO AI Guidance - Compliance Check v2.json` (replaces v1) | `/webhook/povo-compliance-check` | as v1, plus `facts` (participant) | as v1. `suggested_text` is **required** (non-empty) when rule_findings or issues exist; otherwise "". |
| W5 | `POVO AI Guidance - Next Call v2.json` (replaces v1) | `/webhook/povo-next-call` | `facts`, `call_date`, `assessments` [{category, point_id, pillar, text, detail, raised, reception (0\|1\|2\|null), note}], `current` {messaging, objection, closing: [{point_id, rank, pillar, text, detail}]}, `claims` {messaging, objection, closing: [{claim_id, pillar, text, detail}]}, `allowed_pillars` {…per category}, `count: 3` | `{lists: {messaging\|objection\|closing: [{source_point_id\|null, status, claim_ids, pillar, text, detail}] × 3}, summary ≤ 240, next_best_action ≤ 200, history_line ≤ 200}`. `status` ∈ messaging/closing: `retained`, `changed`, `new`, `new_ai`; objection: `still_open`, `resolved`, `retained`, `new`. `source_point_id` must be one of `current[category]` for anything other than `new`/`new_ai`. |

**The nightly workflow** is unchanged (it calls `/api/v1/jobs/refresh-guidance`, which now generates through W3).

**Backend env additions:** `N8N_BRIEF_PATH=/webhook/povo-participant-brief` and `N8N_GUIDANCE_PATH=/webhook/povo-territory-guidance`.

## 4. How the backend turns W5 statuses into tags

| status | tags (ready strings) |
|---|---|
| retained | `Retained · well received` |
| changed | `Changed` (+ `previous_text` = the source point text) |
| new | `New` (messaging that replaces a removed point also gets `New · replaces a removed message`, when a current point with reception 0 is not carried over) |
| new_ai | `New AI suggestion` |
| still_open | `Still open · address first` |
| resolved | `Resolved last call` |

- Rank moves: when `source_point_id`'s previous rank ≠ the new rank, add `▲ was #n` or `▼ was #n`. `previous_rank` is always set for carried-over points.
- The banner (`summary`, `next_best_action`) and `history_line` come from the W5 response.

## 5. Frontend

- Every AI-backed area handles 503 with an inline error state: the backend message plus a **Retry** button. There is never placeholder content.
  - The areas are: AI Guidance panel, profile bullets, Call Preparation points, compliance check, and AI Suggestions for Next Call.
- The Guidance panel renders `text` lines, with `emphasis` in bold. Focus buttons stay as they are (`reason` is the tooltip).
- Profile bullets come from the new `brief` endpoint for the active participant. They show "AI generating" while loading.
