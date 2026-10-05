# POVO AI Guidance: n8n workflows

**Four files, three webhook paths and one schedule, with one file per path.** Every `.json` in this folder is a workflow to import and activate. There are no spare copies and no older versions.

| File | Trigger | Called by |
|---|---|---|
| `POVO AI Guidance - Call Prep v1.json` | `POST /webhook/povo-call-prep` | backend `POST /api/v1/call-prep` (`N8N_CALL_PREP_PATH`) |
| `POVO AI Guidance - Compliance Check v1.json` | `POST /webhook/povo-compliance-check` | backend `POST /api/v1/compliance/check` (`N8N_COMPLIANCE_PATH`) |
| `POVO AI Guidance - Example Notes v1.json` | `POST /webhook/povo-example-notes` | backend `POST /api/v1/example-notes` (`N8N_EXAMPLE_NOTES_PATH`) |
| `POVO AI Guidance - Next Call v1.json` | `POST /webhook/povo-next-call` | backend "AI Suggestions for Next Call" (`N8N_NEXT_CALL_PATH`) |
| `POVO AI Guidance - Nightly Guidance Refresh v1.json` | cron `0 5 * * 1-5`, America/New_York | n8n itself. It calls backend `/api/v1/jobs/*`. |

The contracts are fixed in [docs/ARCHITECTURE.md §6](../docs/ARCHITECTURE.md). What the AI does is described in [docs/POC_FUNCTIONAL_SPEC.md §4C, §6 and §7](../docs/POC_FUNCTIONAL_SPEC.md).
The browser never calls n8n. Only the backend does.

## What each workflow does

All three webhook workflows have the same shape:

```
Webhook (POST, responseMode: responseNode)
  → Build Prompt (Code: validates the request, builds the system prompt and data block)
  → Request Valid? (IF)
      ├─ true  → <X> Writer (LLM) (Basic LLM Chain)
      │            ├─ Azure OpenAI Chat Model   (credential "Azure OpenAI account", gpt-4.1, temperature 0, json_object)
      │            └─ Structured Output Parser
      │          ├─ success → Guard (Code) ─────────┐
      │          └─ error output → Model Failed ─────┤
      └─ false → Reject Request ─────────────────────┴→ Respond to Webhook
```

Every response is exactly `{"ok": true, ...payload}` or `{"ok": false, "reason": "..."}`. There is no other shape.

- **Contract break** (missing `request_id`, unknown category, no candidates, and so on) goes to *Reject Request* and returns `{ok:false, reason:"invalid_request: ..."}`.
- **Model failure** covers an Azure timeout, a content filter hit, or output the parser cannot read. The chain's **error output** (`onError: continueErrorOutput`) goes to *Model Failed* and returns `{ok:false, reason:"model_error: ..."}`.
  - The model node has a 25 s timeout with 1 retry, and the workflow's `executionTimeout` is 55 s. A failure is therefore answered inside the backend's `N8N_TIMEOUT_SECONDS` (60).
- **Guard failure** returns `{ok:false, reason}`. On success the Guard returns `{ok:true, ...payload}`.

The system prompts live in each **Build Prompt** Code node as readable line arrays. They are deliberately free of `{ }`, because the chain treats the system message as a template. Every prompt:

- forbids inventing clinical claims and suggesting off-label use;
- says the approved (MLR) text must never be altered;
- requires JSON only;
- keeps the POC's plain, professional US-English tone.

### Call Prep v1: `povo-call-prep`

- Request: `{request_id, category, participant:{…}, interactions:[…], candidates:[{point_id, pillar, text, detail}], max_points: 3}`
- Response: `{ok:true, ordered_point_ids:[≤3], insights:{point_id: "≤220 chars"}}`

The model only **chooses and orders point_ids**. It never returns point text, so the approved text cannot be changed on the way through.

The Guard fails the call (`ok:false`) when `ordered_point_ids`:
- is empty;
- has more than `max_points` entries;
- contains duplicates;
- contains an id that is not a candidate.

The Guard cleans insights without failing the call:
- Insights are kept only for ids that were returned.
- Insights are kept only for the `messaging` category. ARCHITECTURE says "insights are only for messaging", and objections and closings show their approved Response or closing text instead.
- A sentence is stripped when it has a claim-like number (`%`, mg, weeks, p-value, n=, fold) that is not in that point's approved text.
- A sentence is also stripped when it has any other number that is not in the approved text or the participant facts.
- An insight that is still over 220 characters is dropped, never truncated.

### Example Notes v1: `povo-example-notes`

- Request: `{request_id, category, category_label, point_text, reception ("well received" | "moderately received" | "not well received" | null), other_points:[string], participant:{role_type, decile, tier_name, segment_short_name, ...}, interactions:[{date, type_label, summary}], count, max_chars}`
- Response: `{ok:true, notes:[string]}`

Predicts the notes the rep is most likely to write for one point (or Additional Notes), matched to the reception the rep picked. The rep clicks one and edits it.

- The participant is named only by role (HCP, PA, NP); no patient details, adverse events, off-label uses, pricing or claims.
- The Guard drops notes over `max_chars`, under 4 words, with `[placeholders]` or PHI, and duplicates; with none left it answers `ok:false`.
- The backend then runs every note through the 14 compliance rules and drops any that fires, and caches the answer in `APP_AI_CACHE`.
- On `ok:false` the screen shows **no** example notes. There is no fixed fallback text.

### Compliance Check v1: `povo-compliance-check`

- Request: `{request_id, category, point_text, participant_role, note, rule_findings:[{rule_id, title, severity}], allowed_rule_ids:[14]}`
- Response: `{ok:true, issues:[{rule_id, excerpt, why}], suggested_text}`

This is a second pass after the backend's deterministic rules, which remain the guaranteed floor.

- The 14-rule table (id, title, severity and what to look for) lives in *Build Prompt*.
- The model reports **additional** issues only.
- It drafts a rewrite that:
  - keeps the rep's facts;
  - removes off-label details, AE details, PHI and pricing;
  - uses the approved redirect phrases: *Off-label question sent to Medical Information*, *Safety information reported to Pharmacovigilance* and *Access questions referred to IncyteCARES*.
- The rewrite limit is 200 characters, or 600 for `category: "additional"`.

The Guard fails the call (`ok:false`) when:
- an issue has a `rule_id` that is not in `allowed_rule_ids`;
- the rewrite is empty or over the limit;
- the rewrite contains PHI patterns: DOB wording, dates before last year, MRN or record number, SSN, phone number or email;
- the rewrite mentions off-label use or pricing outside the approved phrases.

The Guard drops, without failing the call:
- issues that repeat a rule the deterministic rules already found;
- issues whose excerpt is not actually in the note.

### Next Call v1: `povo-next-call`

- Request: `{request_id, participant:{…}, call_date, assessments:[{category, point_id, text, reception, note}]}`
- Response: `{ok:true, objection_states:{point_id: "open"|"resolved"}, summary (≤240), next_best_action (≤200)}`

`reception` may be `0/1/2` (as stored) or a label. The backend applies the deterministic revision rules (§7) itself.

The Guard fails the call (`ok:false`) when:
- `objection_states` does not cover **exactly** the objection point_ids given (those with `category: "objection"`);
- a state is not `open` or `resolved`;
- a text field is empty, or over its limit and cannot be cut back to a whole sentence or clause of at least 40 characters (a summary or next best action that runs slightly over is trimmed, not rejected);
- the summary or next best action contains a claim-like number (%, mg, weeks, fold, p-value) that is not in the assessments.

### Nightly Guidance Refresh v1: schedule

```
Weekdays 05:00 ET (Schedule Trigger, cron 0 5 * * 1-5; workflow setting timezone America/New_York)
  → Settings          (Code) backend_url = $env.POVO_BACKEND_URL when env access is allowed, else http://host.docker.internal:8030
  → Refresh Guidance  POST {backend_url}/api/v1/jobs/refresh-guidance   timeout 300 s, 3 tries
  → Purge AI Cache    POST {backend_url}/api/v1/jobs/purge-ai-cache     timeout 120 s, 3 tries
  → Summarise Run     (Code)
```

- Both requests authenticate with the n8n credential **POVO Service Token** (type *Header Auth*: name `X-POVO-Service-Token`, value = the backend's `POVO_SERVICE_TOKEN`), plus an `X-Request-Id`. No env access is needed, so this works on n8n 2.x where `$env` is blocked by default.
- Create that credential once per n8n instance (*Credentials → New → Header Auth*), and select it on both HTTP nodes after import.
- The backend must listen where the n8n container can reach it: locally, `uvicorn main:app --host 0.0.0.0 --port 8030`. `127.0.0.1` alone is not reachable from Docker. On the VM, set `POVO_BACKEND_URL`, or edit the default in **Settings**, to the backend content URL.
- Both continue on error, so the purge still runs if the refresh fails.
- *Summarise Run* returns `{ok, refresh_guidance:{run_id, territories, snapshot_date}, purge_ai_cache:{deleted}, message}`. It **throws** (the execution is marked failed) if either job failed.
- There is no email or chat alerting, which is out of scope. Check **Executions** in n8n.

## Local n8n (docker-compose)

1. Copy `.env.example` to `.env` at the repo root.
2. Set `POVO_SERVICE_TOKEN` to the same value as in `backend/.env`.
3. From the repo root, run:

```bash
docker compose up -d      # http://localhost:5680  (container 5678, volume povo_n8n_data)
```

The compose file sets the n8n environment the workflows need:

| Variable | Value | Why |
|---|---|---|
| `POVO_BACKEND_URL` | `http://host.docker.internal:8030` | optional: overrides the Settings node default |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` | lets the Settings node read `POVO_BACKEND_URL`; without it the default is used |
| `TZ`, `GENERIC_TIMEZONE` | `America/New_York` | default timezone; the nightly workflow also pins it in its settings |

On the VM, either set `POVO_BACKEND_URL` (with env access allowed) or edit the Settings default. The service token always comes from the **POVO Service Token** credential.

**This machine (2026-09-30):** the POVO workflows run in the `n8n-kam` container at **http://localhost:5679**, not the `n8n` container on 5678, and `backend/.env` points `N8N_BASE_URL` there. The credential **POVO Service Token** exists in that instance.

## Import, credential, activation

1. **Import** each `.json`: n8n → *Workflows* → *Import from File*. Alternatively, use the deploy script below.
2. **Credential.** Open each of the three LLM workflows and select the **Azure OpenAI account** credential on *Azure OpenAI Chat Model*.
   - If the credential does not exist yet, create it with the resource name, API key and API version. The deployment name is set on the node: `gpt-4.1`.
   - The files ship with the placeholder id `REPLACE_WITH_YOUR_AZURE_OPENAI_CRED_ID`, so the node is unbound until you do this.
3. **Activate** all four workflows. The production URL `/webhook/<path>` only answers while a workflow is active. The editor's *Test workflow* uses `/webhook-test/<path>`.
4. **Point the backend at n8n.** In `backend/.env`:
   ```
   AI_ENABLED=true
   N8N_BASE_URL=http://localhost:5680
   N8N_CALL_PREP_PATH=/webhook/povo-call-prep
   N8N_COMPLIANCE_PATH=/webhook/povo-compliance-check
   N8N_NEXT_CALL_PATH=/webhook/povo-next-call
   N8N_EXAMPLE_NOTES_PATH=/webhook/povo-example-notes
   N8N_TIMEOUT_SECONDS=60
   POVO_SERVICE_TOKEN=<same as n8n>
   ```

### Tools

| Tool | For |
|---|---|
| `node tools/validate-workflows.js` | Checks every file: JSON parses, `active:false`, name ends in `vN`, file name matches the name, unique node names and UUID ids, every connection source and target exists, no dangling nodes, the error output is wired, Code nodes compile, the webhook uses POST + responseNode + Respond node, webhook paths are unique across files, the Azure credential placeholder and temperature 0 are set, and there are no hardcoded secrets or IPs. Exit code 1 on failure. **Run it before every commit.** |
| `node tools/deploy-to-n8n.js [--dry-run] [--activate] [files…]` | Uses the n8n public API (`X-N8N-API-KEY`) with env `N8N_URL` (default `http://localhost:5680`) and `N8N_API_KEY`. It creates or updates workflows **by name**. It binds the model credential in this order: the one already on the live node, then `N8N_AZURE_CREDENTIAL_ID`, then one borrowed from another workflow. It sends only the settings keys the API accepts, including `timezone`. `--activate` activates the workflow and deactivates any other active workflow on the same webhook path. `--dry-run` sends nothing and also works offline without a key. |
| `tools/test-webhooks.ps1` / `tools/test-webhooks.sh` | POST each `samples/*.json` to the running n8n and print the response. Options: `-N8nUrl` / `N8N_URL`, and `-Test` / `--test` for `/webhook-test/`. |
| `samples/*.json` | Request bodies that match the §6 contracts exactly: `call-prep`, `compliance-check`, `compliance-check-additional` (600-character limit) and `next-call`. |

```powershell
node n8n/tools/validate-workflows.js
$env:N8N_API_KEY = "<key>"; node n8n/tools/deploy-to-n8n.js --activate
.\n8n\tools\test-webhooks.ps1
```

## How the backend uses these workflows, and the fallback

- The backend POSTs the request (always with `request_id`) and waits up to `N8N_TIMEOUT_SECONDS`.
- On `ok:true` it uses the payload. Call-prep answers are cached in `APP_AI_CACHE` for `AI_CACHE_HOURS`, and compliance results are stored with `engine = rules+llm`.
- It falls back to the deterministic POC rules on any of:
  - `ok:false`;
  - a non-2xx status;
  - a timeout;
  - n8n being down;
  - `AI_ENABLED=false`.
- The rules are:
  - call prep: the rules ordering;
  - compliance: the 14 regex rules plus `compFix`;
  - next call: regex open/resolved plus templated summary and next best action.
- **The app always works without n8n.**

## Rules for changing these workflows

- **One file per webhook path.** n8n serves only one active workflow per path. Never keep two files that register the same path; the validator enforces this.
- **Version in the workflow name.** A breaking change becomes `… v2`. Save it as a new file named exactly after the workflow, delete the `v1` file in the same commit, and deactivate `v1` on the instance (`deploy-to-n8n.js --activate` does this automatically).
  - Keep the webhook path unchanged unless the backend's `N8N_*_PATH` changes with it.
- **Export with `active: false`**, keep the placeholder credential, and never put a URL, key or token in a file. Use `{{ $env.* }}` and n8n credentials. After editing in the n8n editor, export, replace the file, and run the validator.
- The approved talking-point text is never sent back by any workflow, and no prompt may ask the model to rewrite it.
