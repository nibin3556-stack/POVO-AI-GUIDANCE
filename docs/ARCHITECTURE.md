# POVO – AI Guidance: architecture and contracts

This document is the single source of truth for how the four parts fit together: `frontend/`, `backend/`, `n8n/` and `databricks/`.
Behaviour comes from [POC_FUNCTIONAL_SPEC.md](POC_FUNCTIONAL_SPEC.md), updated to the v2 POC `POVO_AI_Guidance_Step3_63_Alt 2.html` (2 KPI cards with the patient split, D1 removed, HS treatment segments, decile table, delivered points and Reinforce, voice and example notes, Submit).
Conventions follow the Mosaic platform standard (`D:\Workspace\Mosaic\MOSAIC_ARCHITECTURE_PROMPT.md`) and the standalone-app pattern used by XR-CONVERSION.
The Mosaic Admin Control Center, UI registry and auto-save framework are **not** part of this standalone app.

## 1. Topology

```
Browser ──► Posit Connect (Windows VM, Okta SSO)
             ├── content: POVO AI Guidance (static SPA, frontend/dist, base './')
             └── content: POVO AI Guidance API (FastAPI, backend/)  ──► Databricks SQL Warehouse
                                                                 │      catalog ${DATABRICKS_CATALOG}
                                                                 │        ├── bronze  (read only)
                                                                 │        └── app     (read/write)
                                                                 └──► n8n (Docker) ──► Azure OpenAI
n8n schedule ──► backend /api/v1/jobs/* (service token)
```

- The browser **never** calls n8n or Databricks. The backend owns every number.
- n8n is used for LLM work, which the backend calls through webhooks, and for scheduled jobs, which call the backend.
- If n8n is unavailable or `AI_ENABLED=false`, every AI feature falls back to the deterministic POC rules. The app always works without it.
- Both Posit content items are on the same host:port, which makes them the same origin, so no CORS is needed in production. Posit injects the identity header on both.

| Component | Local dev port |
|---|---|
| backend (uvicorn) | **8030** |
| frontend (vite) | **5175** |
| n8n (docker-compose, host) | **5680** → container 5678 |

## 2. Repository layout

```
POVO-AI-GUIDANCE/
  POVO_AI_Guidance_Step3_37.html   first POC (reference only)
  POVO_AI_Guidance_Step3_63_Alt 2.html   v2 POC (the current reference)
  README.md
  docker-compose.yml               n8n only (local dev)
  docs/  ARCHITECTURE.md  POC_FUNCTIONAL_SPEC.md  DEPLOYMENT.md
  databricks/
    ddl/        00_catalog_schemas.sql 01_bronze_tables.sql 02_app_tables.sql   (${catalog} placeholder)
    seed/       generate_seed_data.py  content/*.json  output/ (generated CSV, gitignored)
    scripts/    deploy_schema.py  load_seed_data.py  check_databricks.py
    README.md
  backend/     (Mosaic layout)
    main.py  requirements.txt  pytest.ini  .env.example  README.md
    api/  core/  database/  schema/  helpers/  registry/  tests/
  frontend/    (Mosaic layout + Tailwind 4)
  n8n/         *.json workflow exports, README.md, tools/
```

## 3. Identity, impersonation and permissions

- **Real user**
  - Okta signs the user in on Posit Connect (the VM). Posit then puts the user in the `RStudio-Connect-Credentials` header on every request, as JSON `{"user": "<username>", "email": "...", "groups": [...]}` or a plain username/email. The backend reads only this header. Nothing the browser sends (email, id, token) is trusted for identity.
  - `IDENTITY_SOURCE` picks where the user is checked (`backend/helpers/directory.py`):
    - `trinity` (production) follows the same gate as Mosaic. The domain is dropped (`p250048@incyte.com` becomes `p250048`), and the result must match `EMP_USER_ID` in `bis_prod.bronze_trinity.DIM_EMPLOYEE` with `EMP_STATUS = 'Active'` and no termination: `TERM_DATE` is NULL, the `1900-01-01` sentinel, or a future date. `EMP_TYPE` then picks the `DIM_SALES_FORCE_CURR` column to match `EMP_ID` against: `OHS` → `TERR_EMP_ID` (rep), `OBD` → `DIST_EMP_ID` (district manager), `ASD`/`ABD` → `AREA_EMP_ID` (area manager). The matched rows give the territories (`TERR_ID`, `TERR_NAME`, `DIST_NAME`). Their `TEAM_NAME`/`TEAM_ID` gives the brand through `TRINITY_BRAND_TEAMS`. A rep's home territory is their `TERR_ID`; a manager's is the first territory they cover. Every active, non-terminated employee may sign in: one with no sales-force row on a brand's team gets in as "Home office", with every active brand and no territory of their own. Configuring brands and "view as" a rep stay with the admin users. Answers, refusals included, are cached for `IDENTITY_CACHE_SECONDS` (60). The Trinity tables are read over the `DATABRICKS_*` connection whatever `DATA_SOURCE` is. With `DATA_SOURCE` `local` or `sqlite` (real sign-in, seed data), a Trinity territory the seed lacks is swapped for a seed one: the seed employee with the same username's territory, else `LOCAL_DATA_TERRITORY_ID`.
    - `app` (development) matches the app's own `DIM_EMPLOYEE.USERNAME`, falling back to `EMAIL`, with the territory from `DIM_SALES_ASSIGNMENT`. Production refuses to start with it.
  - Every request logs one line: employee id, `EMP_TYPE`, how the identity was established (`okta-header` or `dev-fallback`), the effective employee and the brand.
  - In development only (`ENVIRONMENT != production`), a missing header falls back to `DEV_FALLBACK_USERNAME` (default `vturano`). The Vite dev proxy also injects the header from `VITE_DEV_USER`.
  - The app has no login page, no JWT and no tokens.
- **No identity header** (production) gets 401 "Missing upstream identity context". **Unknown, inactive or terminated users** get 403 with the message "Your account is not set up for POVO AI Guidance".
- **Permissions** are role-based and declared in `backend/registry/permissions_seed.py`:
  - `REP` and `MANAGER` get `guidance.view` and `call.assess`.
  - `user.impersonate` goes only to the admin users in `ADMIN_USERS_FILE` (`backend/config/admin_users.json`), whatever their role or brand. It is not a brand feature. Add or remove a username in that file to change who can impersonate.
  - Every endpoint is guarded server-side.
- **Impersonation**
  - The frontend sends `X-Impersonate-Employee-Id: <employee_id>` on every request while impersonating. The value is kept in Redux and persisted to `sessionStorage`.
  - The backend honours the header only when the real user has `user.impersonate`. Otherwise it returns 403.
  - The effective user's territory in the brand (`DIM_SALES_ASSIGNMENT.TERRITORY_ID`, served as `home_territory_id`) scopes **every** data query. The territory is never taken from a request parameter.
  - `POST /api/v1/impersonation` (start) and `DELETE /api/v1/impersonation` (exit) are audited.
  - Data written while impersonating records both `REP_EMPLOYEE_ID` (effective) and `ACTED_BY_EMPLOYEE_ID` (real).
- **Brand**
  - Every request is for one brand. The frontend sends `X-Brand-Code` once the user picks a brand (kept in `localStorage`); without it the backend uses `DEFAULT_BRAND_CODE` (POVO) when the user works on it, else the user's first brand.
  - The brands a user can pick are the **active** `CFG_BRAND` rows they have an **active** `DIM_EMPLOYEE` row in (one employee row per brand, each with its own role and home territory). Any other brand returns 403.
  - Every query filters on `BRAND_CODE`, and the in-process caches are keyed by brand, so two brands never share a row. Impersonation stays inside the brand and ends when the brand changes.
- **Brand features**
  - The feature catalog is code (`backend/registry/features.py`, 14 features: the three tabs, each Territory Performance card, Must-Wins, AI call prep, AI compliance check, example notes, voice notes, AI next-call messaging). A child feature needs its parent on.
  - `CFG_BRAND_FEATURE` says which are on per brand. A brand without a row for a feature does not have it, so a new brand starts with nothing. The default brand is registered with every feature on.
  - `/me` lists the brand's enabled features; the frontend hides what is off, and every guarded endpoint answers 403 "This feature is not enabled for the selected brand".
- **Admin users**
  - `ADMIN_USERS_FILE` (default `backend/config/admin_users.json`, `{"admins": ["username", ...]}`) lists who may configure brands and features and who may impersonate. The file is re-read when it changes.
  - The check is on the **real** signed-in identity (never the impersonated one) and needs no sales assignment. With `IDENTITY_SOURCE=trinity` the admin must still be an active employee in Trinity `DIM_EMPLOYEE`, and the file lists network ids (`EMP_USER_ID`, e.g. `p250048`). Admins reach the screen from the account menu (**Configure brand features**, `#/admin`).
- **Record scoping**
  - Any `hcp_id`, `account_id` or `call_id` outside the effective territory returns 404.
  - A call belongs to its effective rep: another rep gets 404, while a manager impersonating that rep can see it.

## 4. Databricks schema

- **Catalog:** configurable with `DATABRICKS_CATALOG`, default `povo_ai_guidance`. The final name is not confirmed yet.
- **Schemas:**
  - `DATABRICKS_SCHEMA=bronze` holds source-like reference data. The app only reads it.
  - `DATABRICKS_APP_SCHEMA=app` holds the app's writable tables. Write permission is granted on these only.
- **Keys (multi-brand):**
  - Every table has **one primary-key column**, its first column. `BRAND_CODE` is never part of a primary key.
  - Every table carries `BRAND_CODE` as a **foreign key** to the brand master `CFG_BRAND` (created first, in `00_catalog_schemas.sql`). The audit log and job runs may hold NULL for an entry that spans every brand.
  - Where the natural key spans several columns, the primary key is those values joined with `|` (`database/tables.py` `key_id`), e.g. `GOAL_ID` = `POVO|NE-POR|2026-10|PEF`, `ASSESSMENT_ID` = `call|participant|category|point`. Upserts use `MERGE` on it.
  - Databricks constraints are informational; SQLite enforces them (`PRAGMA foreign_keys=ON`, upserts are `INSERT … ON CONFLICT DO UPDATE`). The local DuckDB mode declares none.
  - Each brand's rows are self-contained: a table is filtered by its own columns (brand, territory) and never needs a join (e.g. `FCT_HCP_METRICS` and `DIM_HCP` carry the territory). Column names are brand-neutral (`BRAND_PATIENTS`, `FCT_BRAND_ACTIVITY`, `BRAND_DISCUSSED`). The tables the data team loads are listed in [DATA_PIPELINE_TABLES.md](DATA_PIPELINE_TABLES.md).
- **Naming and types:**
  - Table and column names are UPPERCASE, with `DIM_`, `FCT_`, `REF_`, `APP_` and `CFG_` prefixes.
  - All tables are Delta. Dates are `DATE` and moments are `TIMESTAMP` (UTC).
  - JSON payloads are `STRING`.

### 4.1 `bronze`: reference data (read only, loaded by the data pipeline or the seeder)

Primary key first, then `BRAND_CODE` (foreign key to `CFG_BRAND`) on every table.

| Table | Columns (key first) |
|---|---|
| **DIM_EMPLOYEE** | EMPLOYEE_ID STRING (`p250544`), BRAND_CODE (home brand), NETWORK_ID STRING (`3351`), USERNAME (`vturano`), EMAIL, FIRST_NAME, LAST_NAME, FULL_NAME, INITIALS, BUSINESS_UNIT (`COMMERCIAL`), ROLE_CODE (`REP`\|`MANAGER`), ROLE_TITLE, ACCESS_LEVEL, ACCESS_REGIONS (`Northeast`), IS_ACTIVE BOOLEAN. One row per person. |
| **DIM_SALES_ASSIGNMENT** | ASSIGNMENT_ID (`POVO|p250544`), BRAND_CODE, EMPLOYEE_ID, TERRITORY_ID (`NE-POR`), TERRITORY_NAME (`Portland, ME territory`), CITY, STATE, REGION (`Northeast`), TIME_ZONE (`America/New_York`), IS_ACTIVE BOOLEAN. Sales: the territory an employee covers for a brand, one row per employee and brand (there is no territory table). The brands a user can pick and the territory that scopes their data come from here. |
| **DIM_ACCOUNT** | ACCOUNT_ID STRING, BRAND_CODE, TERRITORY_ID, ACCOUNT_NAME, CITY, STATE, ZIP, CLAIMS_INDICATION_PATIENTS INT, CLAIMS_BRAND_PATIENTS INT, CLAIMS_MAIN_FOCUS STRING (focus code), IS_CLAIMS_ONLY BOOLEAN (no affiliated HCP) |
| **DIM_HCP** | HCP_ID STRING (`H000123`), BRAND_CODE, NPI STRING, FIRST_NAME, LAST_NAME, DEGREE (`MD`\|`DO`\|`NP`\|`PA`), ROLE_TYPE (`HCP`\|`NP`\|`PA`), SPECIALTY, ACCOUNT_ID, PARENT_HCP_ID (the physician, for NP/PA), TERRITORY_ID, TERRITORY_NAME, REGION (the territory the HCP belongs to), CITY, STATE, ZIP |
| **FCT_HCP_METRICS** | HCP_METRIC_ID (`POVO|H000123|2026-10-05`), BRAND_CODE, HCP_ID, TERRITORY_ID, AS_OF_DATE DATE, INDICATION_PATIENTS_12M INT (POVO: HS), INDICATION_VISITS_PER_MONTH INT, COMPETITOR_PATIENTS INT (POVO: JAK), BRAND_PATIENTS INT, PROGRAM_ENROLLED_PATIENTS INT (POVO: IncyteCARES PEFs). The backend uses the latest AS_OF_DATE per HCP. |
| **DIM_CALL_PLAN_TARGET** | PLAN_TARGET_ID (`POVO|2026|NE-POR|H000123`), BRAND_CODE, PLAN_YEAR INT, TERRITORY_ID, HCP_ID, DECILE INT (2–10; D1 is ignored if present), TIER_CODE (`SH`\|`MED`\|`LOW`), SEGMENT_CODE (`imm`\|`exp`\|`conv`), COMPETITIVE_FOCUS (`cosentyx`\|`bimzelx`\|`humira`\|`jak`\|`conventional`), IS_IN_CALL_PLAN BOOLEAN, VOLUME_RANK INT (1 = highest HS volume in the territory) |
| **REF_INTERACTION_CHANNEL** | REF_ID (`POVO|TIER|SH`), BRAND_CODE, REF_TYPE, CODE, NAME, SHORT_NAME, DESCRIPTION, TEAM_LABEL, COLOR_HEX, ARCHETYPE_NAME, ARCHETYPE_DESC, DECILE_MIN, DECILE_MAX, CALLS_PER_YEAR, REACH_GOAL_PCT, EVENT_TYPE, UNIT, PARAM_VALUE DOUBLE, SORT_ORDER. **The master reference list**, one row per item, `REF_TYPE` says which: `CHANNEL` (CODE `rep`… , NAME = card title `Direct call`, TEAM_LABEL `POVO Sales`), `TIER` (CODE `SH`\|`MED`\|`LOW`, NAME `Super High`, DECILE_MIN/MAX, CALLS_PER_YEAR, REACH_GOAL_PCT), `SEGMENT` (CODE `imm`\|`exp`\|`conv`, NAME = full name, SHORT_NAME, DESCRIPTION, COLOR_HEX, ARCHETYPE_*), `KPI_METRIC` (CODE `PEF`\|`NEW_PATIENTS` as in FCT_TERRITORY_GOAL, NAME = card title, EVENT_TYPE counted as actual, UNIT; drives the 2 KPI cards), `KPI_PARAMETER` (CODE `PAID_PERSISTENCE`\|`PENDING_ON_THERAPY`\|`BRIDGE_SHARE`, PARAM_VALUE, DESCRIPTION; the rates behind the Total on POVO split — if any is missing the card has no split). Each type uses only its own columns. |
| **REF_COMPETITIVE_FOCUS** | FOCUS_ID (`POVO|jak`), BRAND_CODE, FOCUS_CODE, LABEL (`Cosentyx`, …), COLOR_HEX, SORT_ORDER |
| **FCT_INTERACTION** | INTERACTION_ID STRING, BRAND_CODE, HCP_ID, TERRITORY_ID, EMPLOYEE_ID (nullable; the rep, for channel `rep`), INTERACTION_DATE DATE, CHANNEL_CODE (`rep`\|`adfa`\|`opz`\|`msl`\|`spkr`\|`pr`), INTERACTION_TYPE, BRAND_DISCUSSED BOOLEAN, SUMMARY STRING |
| **FCT_BRAND_ACTIVITY** | ACTIVITY_ID STRING, BRAND_CODE, TERRITORY_ID, HCP_ID, PATIENT_KEY STRING (anonymised token, never PHI), EVENT_DATE DATE, EVENT_TYPE (`PEF`\|`NRX`\|`NEW_PATIENT`). `NEW_PATIENT` is the first paid script. |
| **FCT_TERRITORY_GOAL** | GOAL_ID (`POVO|NE-POR|2026-10|PEF`), BRAND_CODE, TERRITORY_ID, GOAL_YEAR INT, GOAL_MONTH INT, METRIC_CODE (`PEF`\|`NRX`\|`NEW_PATIENTS`), GOAL_VALUE INT |
| **REF_HOLIDAY** | HOLIDAY_ID (`POVO|2026-07-03`), BRAND_CODE, HOLIDAY_DATE DATE, HOLIDAY_NAME |
| **REF_TALKING_POINT** | POINT_ID STRING (unique across brands), BRAND_CODE, CONTENT_VERSION STRING, CATEGORY (`messaging`\|`objection`\|`closing`), VARIANT (`initial`\|`next_call`\|`extra`\|`peer`), PILLAR STRING, AUDIENCE (`HCP`\|`NP`\|`PA`\|`ALL`), SEGMENT_CODE (`imm`\|`conv`\|`exp`\|`ALL`), WRITER_STATE (`writer`\|`non_writer`\|`ALL`), TEXT_TEMPLATE STRING, DETAIL_TEMPLATE STRING (insight or response), NEXT_CALL_TEMPLATE STRING, SORT_ORDER INT, MLR_CODE STRING, IS_ACTIVE BOOLEAN |
| **REF_OBJECTION_RULE** | RULE_ID STRING (unique across brands), BRAND_CODE, AUDIENCE, SEGMENT_CODE (or `ALL`), MIN_DECILE INT, MAX_DECILE INT, WRITER_STATE, OBJECTION_POINT_IDS STRING (ordered, comma-separated POINT_IDs), PRIORITY INT (lowest wins) |
| **REF_COMPLIANCE_RULE** | COMPLIANCE_RULE_ID (`POVO|off`), BRAND_CODE, RULE_ID (`off`, `claim`, … the code the engine knows), CHIP_LABEL, TITLE, SEVERITY (`high`\|`med`\|`low`), DEDUCTION INT, PATTERN STRING (Python regex, case-insensitive), SUPPRESS_PATTERN STRING (nullable), WHY_TEXT, FIX_TEXT, SORT_ORDER INT, IS_ACTIVE BOOLEAN |
| **REF_COMPLIANCE_TEXT** | TEXT_ID (unique across brands), BRAND_CODE, CONTENT_VERSION, KIND (`template`\|`replacement`\|`reword`\|`cut_off`), TEXT_KEY (category, rule id, or `why`\|`fix`\|`placeholder`), PATTERN (regex, reword only), TEXT_TEMPLATE (`{who}` = participant), SORT_ORDER, IS_ACTIVE. Every word the compliance rewrite adds. Templates hold placeholders only, never talking-point text. |

**Content tables** (`REF_TALKING_POINT`, `REF_OBJECTION_RULE`, `REF_COMPLIANCE_RULE`, `REF_COMPLIANCE_TEXT`):

- **No content in code.** The reference HTML only showed the data shapes. Every talking point, rule, rewrite line and KPI rate is read from these tables; example notes are predicted by AI per note (no fixed text). Code holds logic and UI wording only.

- The **backend** owns them as JSON files in `databricks/seed/content/` (`talking_points.json`, `objection_rules.json`, `compliance_rules.json`). Each file is an array of objects whose keys are exactly the column names above.
- The backend defines the template placeholders and documents them in `databricks/seed/content/README.md`. Templates use `{snake_case}` placeholders, rendered with `str.format_map` over a safe dict.
- The seeder copies these files into the CSV output unchanged.
- The text is MLR-approved claim text. The LLM never rewrites it; it can only choose points, order them and write insight lines.

**Dummy-data volume** (deterministic; fixed random seed; `--as-of` defaults to today in America/New_York):

- **Territories and employees**
  - 8 Northeast territories: Portland ME (`NE-POR`), Boston MA, Hartford CT, Providence RI, Manchester NH, Burlington VT, Worcester MA, Springfield MA.
  - One rep per territory. Vince Turano (username `vturano`) is the Portland rep and the dev default user; Dana Whitaker (`p250611` / `3418`) is Hartford and Luis Ortega (`p250702` / `3526`) is Providence.
  - Plus 2 managers: Barbara Drake (`p250544` / `3351` / `bdrake`), home Boston, plus one more. A manager's own view shows their home territory.
- **Data window:** activity, calls and interactions run from the first day of the month three months before the as-of month (as of 10/05/2026: Jul 1 to Oct 5), so the dashboard always shows the current month plus the three before it. Goals run from that month to December.
- **Targets per territory:** about 83 (D10–D2), split by decile like the POC (±15% per territory). 142 HCPs are modelled so the HS ranking stays realistic; the D1 HCPs are then left out of every table.
  - About 50 physicians, each with 0–2 affiliated NP/PA.
  - 6–8 accounts, plus 2 claims-only accounts.
  - Names use the POC's Portland names where they exist.
- **Writers and activity**
  - About 24 writers per territory, about 15 of them JAK users. A new writer has always been called.
  - Totals are consistent: `FCT_HCP_METRICS.BRAND_PATIENTS` equals the count of `NEW_PATIENT` events per HCP, and `PROGRAM_ENROLLED_PATIENTS` (the PEFs column) equals the PEF events per HCP, so the PEFs of all targets add up to the PEF card. NRx ≈ 1.2× new patients, PEF ≈ 1.36× new patients.
- **Goals:** the POC v2 shape from the data-start month (8, 12, 15, 17, 18, 19, then +1 a month), scaled per territory. PEF goal = ×1.4, NRx goal = ×1.25.
- **Interactions**
  - Rep calls follow the tier calls/yr × attainment factor. Reach follows the tier reach factor.
  - Some Super High and Medium targets have no call for more than 21 days, and a few in-plan targets were never called.
  - Every physician gets about 4–6 non-rep interactions (ADFA, Opz, MSL, Speaker, PR).
- **Holidays:** US holidays for the as-of year and the next.

### 4.2 `app`: writable tables

| Table | Columns | Primary key |
|---|---|---|
| **APP_CALL** | CALL_ID STRING (uuid4), TERRITORY_ID, REP_EMPLOYEE_ID, ACTED_BY_EMPLOYEE_ID, HCP_ID (primary physician), CALL_DATE DATE, PARTICIPANT_IDS STRING (JSON array of HCP_IDs), STATUS (`planned`\|`assessed`), REVISION_NO INT, CREATED_AT, UPDATED_AT | CALL_ID |
| **APP_CALL_POINT_ASSESSMENT** | ASSESSMENT_ID, CALL_ID, PARTICIPANT_ID, CATEGORY (`messaging`\|`objection`\|`closing`\|`additional`), POINT_ID (`additional` for the free-text note), POINT_RANK INT, POINT_TEXT STRING (text as shown), WAS_RAISED BOOLEAN, RECEPTION INT (0 = not well, 1 = moderately, 2 = well; null = unset), NOTE STRING, COMPLIANCE_STATUS (`unchecked`\|`passed`\|`flagged`), COMPLIANCE_CHECK_ID, UPDATED_AT, UPDATED_BY | ASSESSMENT_ID = CALL_ID\|PARTICIPANT_ID\|CATEGORY\|POINT_ID |
| **APP_COMPLIANCE_CHECK** | CHECK_ID STRING, CALL_ID (nullable), PARTICIPANT_ID, CATEGORY, POINT_ID, NOTE_TEXT (original, retained for audit), RESULT_LABEL (`Compliant`\|`Minor issue`\|`Needs review`\|`Non-compliant`), MAX_SEVERITY (nullable), SCORE INT, ISSUES_JSON, SUGGESTED_TEXT, ENGINE (`rules`\|`rules+llm`), SUGGESTION_ACCEPTED BOOLEAN, REP_EMPLOYEE_ID, ACTED_BY_EMPLOYEE_ID, CREATED_AT | CHECK_ID |
| **APP_CALL_PREP_REVISION** | REVISION_ID STRING, CALL_ID, TERRITORY_ID, HCP_ID (primary), PARTICIPANT_ID, REVISION_NO INT, CALL_DATE DATE, CATEGORY, POINTS_JSON (ordered point list with tags, previous rank and previous text), SUMMARY_TEXT, NEXT_BEST_ACTION, HISTORY_LINE, ENGINE, CREATED_AT | REVISION_ID |
| **APP_TERRITORY_GUIDANCE_SNAPSHOT** | SNAPSHOT_ID, TERRITORY_ID, SNAPSHOT_DATE DATE, PAYLOAD_JSON, CREATED_AT | SNAPSHOT_ID = BRAND_CODE\|TERRITORY_ID\|SNAPSHOT_DATE |
| **APP_AI_CACHE** | CACHE_KEY STRING, KIND, PAYLOAD_JSON, CREATED_AT, EXPIRES_AT | CACHE_KEY |
| **APP_AUDIT_LOG** | AUDIT_ID STRING, REQUEST_ID STRING (uuid4), ACTED_BY_EMPLOYEE_ID, EFFECTIVE_EMPLOYEE_ID, ACTION (`IMPERSONATE_START`, `IMPERSONATE_END`, `CALL_CREATE`, `ASSESSMENT_SAVE`, `COMPLIANCE_CHECK`, `SUGGESTION_ACCEPT`, `NEXT_CALL_GENERATE`, `BRAND_SAVE`, `FEATURE_UPDATE`, `JOB_RUN`), MODULE, RECORD_ID, DETAIL_JSON (never secrets, never note text), CREATED_AT | AUDIT_ID |
| **APP_JOB_RUN** | RUN_ID STRING, JOB_NAME, STARTED_AT, FINISHED_AT, STATUS (`running`\|`success`\|`failed`), DETAIL STRING | RUN_ID |
| **CFG_BRAND** | BRAND_CODE, BRAND_NAME, DESCRIPTION (also tells the next-call AI what the product is), IS_ACTIVE BOOLEAN, SORT_ORDER INT, UPDATED_AT, UPDATED_BY. **The brand master**; created in `00_catalog_schemas.sql`. | BRAND_CODE |
| **CFG_BRAND_FEATURE** | BRAND_FEATURE_ID, FEATURE_CODE (from `registry/features.py`), IS_ENABLED BOOLEAN, UPDATED_AT, UPDATED_BY (admin username, or `system`) | BRAND_FEATURE_ID = BRAND_CODE\|FEATURE_CODE |

Every table above also carries `BRAND_CODE`, a foreign key to `CFG_BRAND` (NULL in the audit log and job runs for an entry that spans every brand). A brand that appears in `DIM_SALES_ASSIGNMENT` is registered in `CFG_BRAND` at startup and whenever an admin opens the brand list, active and with no features; in SQLite, where the foreign key is enforced, the brand row comes first (the CSV loader adds it).

### 4.3 Local data mode (development and tests without Databricks)

- `DATA_SOURCE=databricks` (the VM) uses `databricks-sql-connector` with native `:name` parameters.
- `DATA_SOURCE=local` uses DuckDB (`backend/.localdata/povo.duckdb`, gitignored).
  - The file is attached **as the catalog name**, so the same `catalog.schema.TABLE` SQL works.
  - Bronze tables are (re)loaded from `databricks/seed/output/<TABLE>.csv` at startup.
  - App tables are created if missing and persist between restarts.
- **SQL rules:** portable SQL only — plain SELECT/INSERT/MERGE, no Databricks-only functions. Filter by territory in SQL. Do the heavy metric computation in Python; the data is small per territory. Cache bronze reads per territory in-process (TTL `BRONZE_CACHE_SECONDS`, default 600).

## 5. REST API (FastAPI, `/api/v1`)

Every response uses the Mosaic envelope `{data, status, message, page, limit, total_pages, total_items}`. Errors use the same envelope and never carry a stack trace. JSON keys are snake_case, and dates are ISO `YYYY-MM-DD`. Every request carries an `X-Request-ID` (uuid4), which is validated or regenerated and echoed back.

**Health and session**

- **`GET /health`** (no auth) → `{status, data_source, warehouse: ok|error, n8n: ok|disabled|error, version}`.
- **`GET /api/v1/me`** → `{signed_in: Employee, effective: Employee, is_impersonating, permissions: [..], territory: Territory, today, data_as_of, brand: {code, name}, brands: [{code, name}], features: [FEATURE_CODE], is_admin}`.
  - `Employee` = `{employee_id, network_id, username, full_name, initials, business_unit, role_code, role_title, access_level, access_regions, home_territory_id, territory_name, region}`.
  - `Territory` = `{territory_id, territory_name, city, state, region}`.
  - `data_as_of` = the maximum `FCT_BRAND_ACTIVITY.EVENT_DATE`.

**Reference data**

- **`GET /api/v1/reference`** → `{content_version, tiers: [{code, name, decile_min, decile_max, calls_per_year, reach_goal_pct}], segments: [{code, short_name, full_name, description, color_hex}], competitive_focus: [{code, label, color_hex}], role_types: [{code, label}], interaction_channels: [{code, type_label, team_label}], categories: [{code, label}], reception_scale: [{value, label}], compliance: {rule_count, steps, severity_labels}, next_call_steps: [template with {n} and {notes}], limits: {points_per_category, note_max_length, additional_note_max_length}}`.
  - Built from the bronze `REF_` tables and the same backend constants the endpoints enforce.
  - The shell loads it once, next to `/me`, before any page renders. The frontend holds **no copy** of this business data; codes returned by other endpoints are labelled and coloured through it.

**Impersonation**

- **`GET /api/v1/employees/search?q=&limit=8`** (`user.impersonate`) → `Employee[]`. Matches employee ID, network ID, username, part of the name, or part of the territory. `q` must be at least 2 characters.
- **`POST /api/v1/impersonation`** `{employee_id}` (`user.impersonate`) → `Employee`. Validates and audits. `DELETE /api/v1/impersonation` audits the exit.

**Territory Performance**

- **`GET /api/v1/performance/kpis?period=month|quarter|ytd`** → `{period, period_label, period_start, period_end, remaining_working_days, data_start, cards: [{metric_code: PEF|NEW_PATIENTS, title, unit, goal, achieved, yet_to_achieve, pct_achieved, due_to_date, status: on_track|at_risk|no_goal, split?}]}`.
  - Year to Date runs from the data start to 12/31; only activity from the data start counts.
  - The NEW_PATIENTS card carries `split = {total, paid, bridge, free_trial, paid_pct, bridge_pct, free_trial_pct, new_patients, continuing_patients, as_of}`: Paid NRx = new patients in the period + 85% of the earlier ones; Bridge + Free Trial = 70% of the PEFs not yet paid (55% bridge); the % add up to 100 (largest remainder).
- **`GET /api/v1/performance/guidance`** → `{missed: [{hcp_id, name, display_name, role_type, tier_code, days_since_call}], super_high_not_writing, strong: {best_segment: {segment_code, short_name, trial_pct}, top_writer: {hcp_id, display_name, povo_patients, ties: [display_name]}|null, super_high_reach_pct}, focus: [{hcp_id, name, display_name, role_type, tier_code, reason, score}], source: live|snapshot, generated_at}`. `ties` names every physician tied for the most POVO patients.
- **`GET /api/v1/performance/segmentation`** → `{total_targets, not_writing, segments: [{segment_code, short_name, full_name, description, color_hex, hcp_count, pct, trial_pct, penetration_pct, adoption_pct, reach_pct, funnel: {reached, reached_pct, writers, writers_pct, adopters, adopters_pct, povo_patients, hs_patients}}]}`. The three `pct` add up to 100; the funnel is Targets > Reached (called in the data window) > Writing > 3+ POVO patients.
- **`GET /api/v1/performance/deciles`** → `{rows: [{decile, tier_code, targets, writers, yet_to_write, hs_patients, avg_hs_patients, reached, reach_pct, reach_goal_pct, calls, avg_frequency|null, frequency_goal}], tiers: [{tier_code, tier_name, decile_min, decile_max, calls_per_year, reach_goal_pct, targets, writers, frequency_goal}], elapsed_pct, data_start, super_high_total, super_high_not_writing}`.
  - `rows` covers D10 → D2. Reach = targets called in the data window / targets; avg frequency = calls / targets reached.
  - `frequency_goal` = calls a year × `elapsed_pct` (working days from the data start to today / working days in the year).
- **`GET /api/v1/performance/new-writers?grain=month|week`** → `{grain, total, range_label, x_axis_label, segment_codes, buckets: [{label, start_date, end_date, segments: {imm, exp, conv}, total, is_partial}]}`.
  - Writers are stacked by HS treatment segment, so the stacks add up to the donut's writers.
  - Monthly returns the current month plus the three before it; weekly the last 6 weeks, each ending on a Friday.

**Targets and accounts**

`Target` = `{hcp_id, name ("Last, First"), display_name ("Dr. Last" for HCP, "First Last" for NP/PA), role_type, degree, specialty, account_id, account_name, city, state, zip, competitive_focus, segment_code, decile, tier_code, is_in_call_plan, hs_patients, jak_patients, povo_patients, pef, last_call_date|null, parent_hcp_id|null, is_must_win}`. `pef` = PEFs received through IncyteCARES (≥ povo_patients).

- **`GET /api/v1/targets/must-wins`** → `{territory_name, hs_volume: Target[5], hs_jak: Target[5]}`.
- **`GET /api/v1/targets`** → paginated `Target[]` (in-plan and not Must-Win).
  - Parameters: `page`, `limit` (≤ 200, UI default 10), `sort` (default `hs_patients:desc`; whitelist `name`, `decile`, `hs_patients`, `pef`, `last_call_date`).
  - Filters are comma-separated lists: `focus`, `segment`, `tier`, `account_id`, `role`.
- **`GET /api/v1/targets/facets`** → `{focus: [{code, label, color_hex, count}], segment: [{code, label, count}], tier: [{code, label, count}], account: [{code, label, count}], role: [{code, label, count}]}`. Counts are over the Full Call Plan universe.
- **`GET /api/v1/accounts?page=&limit=&sort=`** → paginated `{account_id, account_name, city, state, zip, hs_patients, povo_patients, target_count, in_plan_count, main_focus, is_claims_only}`. The default sort is `hs_patients:desc`.
- **`GET /api/v1/accounts/{account_id}/targets`** → `Target[]`.

**Call Prep**

- **`GET /api/v1/targets/{hcp_id}/profile`** → `{primary_hcp_id, preselected_participant_ids, participants: [Participant]}`.
  - When `hcp_id` is an NP or PA, the primary is the parent physician and both IDs are preselected.
  - `Participant` = `{hcp_id, role_type, degree, name, display_name, account_name, city, zip, is_primary, stats: {hs_patients, povo_patients, decile, tier_name, rank, rank_of, povo_discussions, last_call_date}, bullets: [string×5], interactions: [{interaction_id, date, channel_code, team_label, type_label, summary, is_new}], interaction_counts: {all, rep, adfa, opz, msl, spkr, pr}}`.
  - Assessed calls in `APP_CALL` are merged in as `is_new` "Direct call" interactions ("Call assessed"). They update `povo_discussions` and `last_call_date`, and bullet 5 becomes the post-call history line.
- **`POST /api/v1/call-prep`** `{hcp_id, participant_id, category}` → `{participant_id, category, revision_no, is_revised, revised_from_date|null, banner: {summary, next_best_action}|null, steps: [string×3], heading, points: [{point_id, rank, pillar|null, text, detail|null, detail_label: Insight|Response|null, tags: [string], previous_text|null, previous_rank|null}], delivered: [{…point, delivered_date, reception|null, label, is_open}], source: ai|rules}`.
  - Returns the top 3 points still to deliver, then the points "Delivered on earlier calls" with their date and reception ("Well Received", "Still Open", "Reinforced · Moderately Received").
  - Next-call tags: "Builds on well received", "Builds on moderate", "New". On screen the rep can mark a delivered point Reinforce; it is then assessed on the post-call under its own POINT_ID.
  - Uses the latest `APP_CALL_PREP_REVISION` for (territory, primary hcp, participant, category) when one exists.
  - When AI is enabled, calls the n8n call-prep webhook (cached in `APP_AI_CACHE` for 24 h by territory + participant + category + revision + content version). Falls back to rules.

**Calls and assessments**

- **`POST /api/v1/calls`** `{hcp_id, participant_ids}` → `Call`.
  - Returns the rep's open `planned` call for this HCP if one exists, updating its participants.
  - Otherwise creates a new call dated today.
- **`GET /api/v1/calls/{call_id}`** → `Call`.
  - `Call` = `{call_id, hcp_id, call_date, participant_ids, status, revision_no, assessments: [Assessment]}`.
  - `Assessment` = `{participant_id, category, point_id, point_rank, point_text, was_raised, reception|null, note, compliance_status, compliance_check_id|null}`.
- **`GET /api/v1/calls/active?hcp_id=`** → `Call|null`.
- **`PUT /api/v1/calls/{call_id}/assessments`** `{items: [Assessment without compliance fields]}` → `Call`. This is an upsert used for autosave.
  - `note` is at most 200 characters (600 for `additional`).
  - Changing a note resets its compliance status to `unchecked`.
- **`POST /api/v1/example-notes`** `{call_id|null, participant_id, category, point_text, reception: 0|1|2|null}` → `{notes: [string ≤ 3], source: ai|none}`.
  - The AI predicts what the rep is likely to write for this point, matched to the reception picked so far (messaging and closings only). For Additional Notes the model also sees the points already raised on the call.
  - Every note is checked against the compliance rules and dropped if any rule fires. Answers are cached in `APP_AI_CACHE`.
  - With AI off or failing the answer is `{notes: [], source: "none"}` and the screen shows no example notes. There is no fixed fallback text.
- **`POST /api/v1/compliance/check`** `{call_id|null, participant_id, category, point_id, point_text, note}` → `{check_id, status: passed|flagged, result_label, max_severity|null, score, issues: [{rule_id, chip, title, severity, why, fix, excerpt}], suggested_text|null, steps: [string×3], engine}`.
  - Rules run first and are always applied.
  - The LLM second pass can add issues and improve the rewrite, but can never remove a rules finding.
  - If a `call_id` is given, the assessment row's `compliance_status` and `compliance_check_id` are updated.
  - If the AI pass fails (`engine: rules`) while AI is on, the latest AI-assisted verdict on the same note text for that call slot is returned instead. A transient n8n failure can then never show "passed" for a text the AI flagged, which Submit would still block.
  - The frontend calls it when a note loses focus, on Enter, after a voice note or an example note, and for every note at once from the purple "AI checks every note for compliance" chip in the Post-Call header (notes already AI-checked with the same text are skipped; a flag opens the first flagged note's report).
- **`POST /api/v1/compliance/{check_id}/accept`** → marks `SUGGESTION_ACCEPTED`. The frontend then saves the note and re-checks it.
- **`POST /api/v1/calls/{call_id}/next-call`** (the Submit button):
  - Re-checks every non-empty note on the server. A note that already has an AI-assisted check (`ENGINE = rules+llm`) for the same text on the same call slot keeps that verdict, so no second LLM call is made. Any other note gets the full check now, with the rules plus the n8n AI pass when AI is on. A flag only the AI found therefore still blocks Submit.
  - If any note is flagged, it returns **409** `{data: {flags: [{participant_id, category, point_id, chip, note, result}]}}`. `result` is the full compliance report (as from `/compliance/check`, with `check_id`), so the screen jumps to the first flagged note and opens its report without running a new check.
  - On success the screen returns to Pre-Call Planning with the same target selected. Call Preparation and Call Participant History open on the first participant and category assessed, so "Delivered on earlier calls" and the new call card (which lists that participant's notes) are on screen. The target's row flashes.
  - If nothing is answered, it returns **422**.
  - Otherwise it builds and persists a revision for every participant × category (helpers/revision.py: raised points move to the delivered history; messaging and closings are re-ranked — follow-ups of well-received points, one unused point in a well-received theme, follow-ups of moderately received points, then unused and new points; a not-well-received theme is never suggested again), sets the call to `assessed`, increments `REVISION_NO`, and audits.
  - **AI next-call messaging** (feature `AI_NEXT_CALL`, AI on): the rules rank up to 6 approved messaging candidates; the Next Call workflow reads this call, the participant's last 5 assessed calls (points raised, reception, compliance-passed notes only), their data and recent interactions, and picks the next call's top 3 in order, each with an insight. Its pick leads the list with the tag "AI suggested"; the approved text is never changed. A missing or invalid pick keeps the rule order.
  - The call's passed Additional Notes appear in the next profile as a bullet: "Last call note (Oct 13, 2026): …".
  - Response: `{call_id, revision_no, call_date, steps: [string×3], participants: [{participant_id, summary, next_best_action}], source}`.

**Brand configuration** (users in `ADMIN_USERS_FILE` only; 403 otherwise; every change is audited as `BRAND_SAVE` or `FEATURE_UPDATE` under the brand)

- **`GET /api/v1/admin/me`** → `{username, is_admin}` (any signed-in identity).
- **`GET /api/v1/admin/brands`** → `[{code, name, description, is_active, sort_order, enabled_features, feature_count, updated_at, updated_by}]`, after registering any new brand from `DIM_EMPLOYEE`.
- **`POST /api/v1/admin/brands`** `{brand_code, brand_name, description?, is_active, sort_order?}` → the brand (create or update).
- **`GET /api/v1/admin/brands/{code}/features`** → `{brand, features: [{code, name, description, group, requires, is_enabled, updated_at, updated_by}]}`.
- **`PUT /api/v1/admin/brands/{code}/features`** `{features: {FEATURE_CODE: bool}}` → as above. Only the features sent change; an unknown code is 422.

**Jobs** (header `X-POVO-Service-Token` = `POVO_SERVICE_TOKEN`; compared in constant time; 401 otherwise)

- **`POST /api/v1/jobs/refresh-guidance`** → computes the guidance for every territory of every active brand with AI guidance on, MERGEs it into `APP_TERRITORY_GUIDANCE_SNAPSHOT`, and records `APP_JOB_RUN`. Returns `{run_id, territories, snapshot_date}`.
- **`POST /api/v1/jobs/purge-ai-cache`** → deletes expired `APP_AI_CACHE` rows and returns `{deleted}`.

## 6. n8n webhooks (called by the backend)

- **Base URL:** `N8N_BASE_URL`. **Timeout:** `N8N_TIMEOUT_SECONDS` (60).
- **Request:** every POST body carries `request_id`.
- **Workflow shape:** Webhook (POST, `responseMode: responseNode`) → Code (build prompt) → Azure OpenAI chat model (credential "Azure OpenAI account", temperature 0, JSON output) → Code **Guard** → Respond to Webhook.
- **Guard node:**
  - Validates the model output against the candidates it was given.
  - On failure, returns `{"ok": false, "reason": "..."}`, and the backend falls back to rules.
  - On success, returns `{"ok": true, ...payload}`.

| Workflow file | Path (env var) | Request | Response payload |
|---|---|---|---|
| `POVO AI Guidance - Call Prep v1.json` | `/webhook/povo-call-prep` (`N8N_CALL_PREP_PATH`) | `{request_id, category, participant: {role_type, display_name, decile, tier_name, segment_short_name, competitive_focus_label, hs_patients, povo_patients, jak_patients, povo_discussions, last_call_date}, interactions: [{date, type_label, summary}], candidates: [{point_id, pillar, text, detail}], max_points: 3}` | `{ordered_point_ids: [≤3, subset of the candidates], insights: {point_id: string ≤ 220 chars}}`. Insights are only for messaging; the approved text is never modified. |
| `POVO AI Guidance - Example Notes v1.json` | `/webhook/povo-example-notes` (`N8N_EXAMPLE_NOTES_PATH`) | `{request_id, category, category_label, point_text, reception\|null, other_points, participant, interactions, count, max_chars}` | `{notes: [string] (1..count, ≤ max_chars, no placeholders or PHI)}` |
| `POVO AI Guidance - Compliance Check v1.json` | `/webhook/povo-compliance-check` (`N8N_COMPLIANCE_PATH`) | `{request_id, category, point_text, participant_role, note, rule_findings: [{rule_id, title, severity}], allowed_rule_ids: [...14]}` | `{issues: [{rule_id (from allowed_rule_ids), excerpt, why}], suggested_text (≤ 200/600 chars, no PHI, no off-label claims)}` |
| `POVO AI Guidance - Next Call v1.json` | `/webhook/povo-next-call` (`N8N_NEXT_CALL_PATH`) | `{request_id, brand: {code, name, description}, participant: {...as in call prep}, call_date, assessments: [{category, point_id, text, reception, note}], history: [{call_date, points: [{category, text, reception, note}]}], interactions: [{date, type_label, summary}], messaging_candidates: [{point_id, pillar, text, tag}], max_messaging: 3}` | `{objection_states: {point_id: open\|resolved}, summary (≤ 240 chars), next_best_action (≤ 200 chars), next_messaging?: {ordered_point_ids: [≤3, subset of the candidates], insights: {point_id: string ≤ 220 chars}}}`. A bad `next_messaging` is dropped by the Guard, never fatal. |
| `POVO AI Guidance - Nightly Guidance Refresh v1.json` | schedule | Cron 05:00 America/New_York, Mon–Fri → HTTP POST `{{$env.POVO_BACKEND_URL}}/api/v1/jobs/refresh-guidance` with `X-POVO-Service-Token: {{$env.POVO_SERVICE_TOKEN}}`, then `/api/v1/jobs/purge-ai-cache` | — |

The backend applies the deterministic revision rules (§7 of the spec). The LLM supplies the objection open/resolved states, the summary, the next best action and which approved messaging candidates lead the next call; the regex fallback and the rule order cover all four.

## 7. Configuration (`backend/.env.example`)

**App**

- `ENVIRONMENT` (development|production|testing), `DEBUG`, `APP_NAME=POVO AI Guidance`, `LOG_LEVEL`, `CORS_ORIGINS` (dev: `http://localhost:5175`).
- `APP_TIMEZONE=America/New_York`.
- `DEV_FALLBACK_USERNAME=vturano`, `POSIT_IDENTITY_HEADER=RStudio-Connect-Credentials`.
- `DEFAULT_BRAND_CODE=POVO` (registered with every feature on), `ADMIN_USERS_FILE` (default `backend/config/admin_users.json`).

**Data**

- `DATA_SOURCE=local|sqlite|databricks`, `LOCAL_DUCKDB_PATH`, `SQLITE_PATH`, `SEED_OUTPUT_DIR`, `BRONZE_CACHE_SECONDS`.
- An existing SQLite file on the previous multi-brand layout is converted with `backend/scripts/migrate_db.py` (backup first, every row kept).
- `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, `DATABRICKS_WAREHOUSE_ID` (http path `/sql/1.0/warehouses/<id>`), `DATABRICKS_CATALOG=povo_ai_guidance`, `DATABRICKS_SCHEMA=bronze`, `DATABRICKS_APP_SCHEMA=app`.

**AI and n8n**

- `AI_ENABLED=true`, `N8N_BASE_URL`, `N8N_CALL_PREP_PATH`, `N8N_COMPLIANCE_PATH`, `N8N_NEXT_CALL_PATH`, `N8N_TIMEOUT_SECONDS`, `AI_CACHE_HOURS=24`.
- `POVO_SERVICE_TOKEN`.

**Secrets:** only `.env.example` is committed. `.env` and `.env.local` are gitignored and loaded in that order, from the backend folder resolved from `core/config.py`'s own path, not the working directory.

## 8. Frontend (`frontend/`)

**Stack** (Mosaic versions):

- React ^19.2.7, Vite ^8.1.1 with @vitejs/plugin-react ^6.0.3, TypeScript ~6.0.2 (strict and `noUncheckedIndexedAccess`).
- MUI ^7.3.11 (material, icons-material), @emotion.
- **Tailwind CSS 4** via `@tailwindcss/vite`, used for layout and spacing. MUI `sx` and the theme are used for component styling.
- Redux Toolkit ^2.12.0 + react-redux ^9.3.0, with **RTK Query** over the shared axios instance (`axiosBaseQuery`).
- react-router ^8.3.0 (`createHashRouter`, lazy pages).
- formik ^2.4.9 + yup ^1.7.1, axios ^1.18.1, dayjs, recharts ^3.9.2, react-hot-toast.
- @fontsource-variable/heebo and material-symbols (self-hosted; the VM cannot reach Google Fonts).
- Testing: vitest ^4.1.10, jsdom, @testing-library/react / jest-dom / user-event. ESLint 10 flat config.

**Build and config:**

- `vite.config.ts`: `base: './'`; dev server on port 5175; proxy `/api` and `/health` → `http://127.0.0.1:8030`, injecting `RStudio-Connect-Credentials` from `VITE_DEV_USER`.
- `constants/constant.ts`: `API_URL = import.meta.env.VITE_API_URL ?? ''`. Production sets it to the backend content URL on Posit.

**Routes** (hash router):

- `#/performance`
- `#/pre-call` and `#/pre-call/:hcpId`
- `#/post-call/:hcpId`

Tabs map to routes. The selected target and participants live in Redux (the `callSession` slice), so switching tabs keeps them.

**Folders** (`src/`):

```
config/axiosConfig.ts         X-Request-ID + X-Impersonate-Employee-Id interceptors, envelope unwrap, error events
constants/                    constant.ts, labels.ts (all UI strings), colors.ts (tokens from the spec)
context/theme.ts              getTheme(): MUI theme mirroring the POC tokens, Heebo
styles/index.css              @import "tailwindcss"; @theme tokens that mirror the MUI theme
redux/                        store.ts, hooks.ts, api/ (baseApi + one file per module), session/, callSession/
types/                        api.ts (ApiResponse<T>), models.ts
hooks/                        useDebounce, useAutoSaveAssessment, …
components/common/            AppCard, Chip variants (RoleChip, DecileChip, FocusTag, StatusChip), AiSparkle, AiStepper, EmptyState, Loader, SegmentedToggle, DataTable (paginated), ErrorBoundary
components/forms/             FormInput, FormTextArea, FormCheckbox, ReceptionSlider (Formik-bound)
components/charts/            DonutChart, DecileBarChart, StackedColumnChart, ChartTooltip (recharts wrappers)
layouts/                      AppShell (Header, AccountMenu, ImpersonationBar, TabBar)
features/impersonation/       ImpersonateDialog
features/performance/         KpiCards, AiGuidancePanel, charts
features/preCall/             MustWins, CallPlanTable, AccountsTable, Filters, CallPrep/*
features/postCall/            AssessmentPanel, PointRow, AdditionalNotes, ComplianceDialog, NextCallCta
pages/                        PerformancePage, PreCallPage, PostCallPage (thin)
routes/                       router.tsx
utils/                        format.ts (dates, "HCPs" rule), workingDays.ts, …
```

## 9. Deployment summary (details in DEPLOYMENT.md)

1. **Databricks.** Run `deploy_schema.py` (creates the catalog if permitted, the schemas and the tables), then `generate_seed_data.py` and `load_seed_data.py`. Grant the app principal SELECT on `bronze` and SELECT/MODIFY on `app`.
2. **n8n.** Import the 4 workflows. Attach the "Azure OpenAI account" credential. Set `POVO_BACKEND_URL` and `POVO_SERVICE_TOKEN` in the n8n environment. Activate.
3. **Backend.** `rsconnect deploy fastapi` (entrypoint `main:app`) as Posit content, with env vars set in Posit. Check `/health`.
4. **Frontend.** Build with `VITE_API_URL=<backend content URL>` and deploy `dist/` as static content. Both content items sit behind Okta SSO.
