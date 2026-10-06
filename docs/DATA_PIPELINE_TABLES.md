# Pipeline tables for the data team

The tables the data pipeline loads for the AI Guidance app, one set per brand. The app only reads them; every screen recalculates from them on each request, so new rows show on the dashboard without any other step (the backend keeps a copy for up to 10 minutes, `BRONZE_CACHE_SECONDS`).

Generated from [databricks/ddl/01_bronze_tables.sql](../databricks/ddl/01_bronze_tables.sql), the source of truth. If the two ever differ, the DDL wins.

## Rules for every load

- **Location:** Databricks catalog `${catalog}` (default `povo_ai_guidance`), schema `bronze`. The app's principal has read access only.
- **One primary key per table** (its first column), never `BRAND_CODE`. Where the natural key spans several columns, the key is those values joined with `|`, e.g. `GOAL_ID` = `POVO|NE-POR|2026-10|PEF`, `ASSIGNMENT_ID` = `POVO|p250544`. The exact recipe is in each key column's description below. IDs the source system owns (`HCP_ID`, `ACCOUNT_ID`, `EMPLOYEE_ID`, `POINT_ID`, ...) must be unique across brands.
- **`BRAND_CODE` on every row**, e.g. `POVO`: a **foreign key** to the brand master `app.CFG_BRAND`. Register a new brand there first (the app's admin screen **Add brand**, or one insert); its users see nothing until an admin switches features on. Load one brand at a time: never delete or overwrite another brand's rows.
- **Territories:** there is no territory table. `DIM_SALES_ASSIGNMENT` says which territory each employee covers for a brand (one row per employee and brand, with the territory's name, city, state, region and time zone); `DIM_HCP` carries the territory each HCP belongs to.
- **`TERRITORY_ID` on every fact, plan, account and HCP row.** The app reads each table by brand and territory, with no join, so a row without its territory is never shown.
- **Formats:** dates `YYYY-MM-DD`; booleans `true`/`false`; empty = NULL; IDs and ZIP codes are text (keep leading zeros).
- **Load modes:** *Upsert on key* = MERGE on the primary key. *Replace the brand's rows* = delete that brand's rows, insert the new set, in one transaction (or `INSERT OVERWRITE ... WHERE BRAND_CODE = ...`).
- **Patient data:** `PATIENT_KEY` is an anonymised token. No PHI in any table.
- **Do not write** the `app` schema (`APP_*`, `CFG_*`): the app owns calls, assessments, compliance checks, next-call revisions, AI cache, audit and the brand configuration.

## Summary

| # | Table | Group | Refresh | Load mode | Key | Used by |
|---|---|---|---|---|---|---|
| 1 | `FCT_BRAND_ACTIVITY` | Daily facts | Daily | Upsert on key (or replace the brand's rows for the data window) | ACTIVITY_ID | Goal KPI cards (achieved), Total on POVO split, new writers chart, data as-of date |
| 2 | `FCT_INTERACTION` | Daily facts | Daily | Upsert on key | INTERACTION_ID | Last call, reach and frequency, missed opportunities, call prep interaction history |
| 3 | `FCT_HCP_METRICS` | Daily facts | Daily (new AS_OF_DATE snapshot) | Append a snapshot; the app reads the latest per HCP | HCP_METRIC_ID | HS volume, JAK users, POVO patients, PEFs on targets, Must-Wins, accounts |
| 4 | `FCT_TERRITORY_GOAL` | Goals | When goals are set or changed (at least monthly) | Upsert on key | GOAL_ID | Goal KPI cards (goal, due to date, on track / at risk) |
| 5 | `DIM_CALL_PLAN_TARGET` | Call plan | When the call plan changes (yearly, plus adjustments) | Replace the brand's plan year | PLAN_TARGET_ID | Target universe, deciles, tiers, segments, competitive focus, call plan table |
| 6 | `DIM_EMPLOYEE` | Organisation and customers | Daily or on change | Upsert on key | EMPLOYEE_ID | Sign-in, role, impersonation search |
| 7 | `DIM_SALES_ASSIGNMENT` | Organisation and customers | Daily or on change | Replace the brand's rows | ASSIGNMENT_ID | Which brands an employee can use and the territory that scopes their data; header |
| 8 | `DIM_ACCOUNT` | Organisation and customers | Weekly or on change | Replace the brand's rows | ACCOUNT_ID | Accounts filter, claims-only accounts |
| 9 | `DIM_HCP` | Organisation and customers | Weekly or on change | Replace the brand's rows | HCP_ID | Targets, participants (NP/PA under a physician), the HCP's territory |
| 10 | `REF_INTERACTION_CHANNEL` | Reference lists | Rarely (KPI rates: monthly or on change) | Replace the brand's rows | REF_ID | Interaction cards and chips (CHANNEL), tier chips and reach/frequency goals (TIER), segmentation card and tags (SEGMENT), which KPI cards show and what counts as achieved (KPI_METRIC), Paid / Bridge / Free Trial rates (KPI_PARAMETER) |
| 11 | `REF_COMPETITIVE_FOCUS` | Reference lists | Rarely | Replace the brand's rows | FOCUS_ID | Competitive focus tags and filter |
| 12 | `REF_HOLIDAY` | Reference lists | Yearly | Replace the brand's rows | HOLIDAY_ID | Working days (due to date, remaining days) |
| 13 | `REF_TALKING_POINT` | Approved content (MLR) | On each MLR release | Replace the brand's rows | POINT_ID | Suggested messaging, objections and closings (call prep), next-call candidates |
| 14 | `REF_OBJECTION_RULE` | Approved content (MLR) | On each MLR release | Replace the brand's rows | RULE_ID | Which objections show per participant |
| 15 | `REF_COMPLIANCE_RULE` | Approved content (MLR) | On each compliance release | Replace the brand's rows | COMPLIANCE_RULE_ID | AI compliance check of post-call notes |
| 16 | `REF_COMPLIANCE_TEXT` | Approved content (MLR) | On each compliance release | Replace the brand's rows | TEXT_ID | Compliance rewrite wording |

## How the goal KPI cards use them

- **Goal** = sum of `FCT_TERRITORY_GOAL.GOAL_VALUE` for the months in the period (month, quarter, or data-start month to December).
- **Achieved** = count of `FCT_BRAND_ACTIVITY` rows whose `EVENT_TYPE` is the KPI's `EVENT_TYPE` in `REF_INTERACTION_CHANNEL` (REF_TYPE `KPI_METRIC`) (PEF for the PEF card, NEW_PATIENT for the patients card), from the data start to today, inside the period.
- **Due to date** = goals of finished months + this month's goal × working days elapsed ÷ working days in the month (weekdays minus `REF_HOLIDAY`). On Track when achieved ≥ due to date.
- Load one `FCT_BRAND_ACTIVITY` row per event (one PEF, one new script, one first paid script), not daily totals.

## 1. Daily facts

### `FCT_BRAND_ACTIVITY`

Brand patient funnel events (goal progress actuals).

- **Key:** ACTIVITY_ID  
- **Refresh:** Daily · **Load:** Upsert on key (or replace the brand's rows for the data window)  
- **Used by:** Goal KPI cards (achieved), Total on POVO split, new writers chart, data as-of date

| Column | Type | Required | Description |
|---|---|---|---|
| `ACTIVITY_ID` | STRING | yes | Activity key |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `TERRITORY_ID` | STRING |  | Territory |
| `HCP_ID` | STRING |  | Prescriber |
| `PATIENT_KEY` | STRING |  | Anonymised patient token; never PHI |
| `EVENT_DATE` | DATE |  | Date of the event |
| `EVENT_TYPE` | STRING |  | PEF (enrollment form), NRX (new script) or NEW_PATIENT (first paid script) |

### `FCT_INTERACTION`

Interactions with HCPs across all teams.

- **Key:** INTERACTION_ID  
- **Refresh:** Daily · **Load:** Upsert on key  
- **Used by:** Last call, reach and frequency, missed opportunities, call prep interaction history

| Column | Type | Required | Description |
|---|---|---|---|
| `INTERACTION_ID` | STRING | yes | Interaction key |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `HCP_ID` | STRING |  | HCP |
| `TERRITORY_ID` | STRING |  | Territory |
| `EMPLOYEE_ID` | STRING |  | The rep for channel rep; null for other teams |
| `INTERACTION_DATE` | DATE |  | Date of the interaction |
| `CHANNEL_CODE` | STRING |  | rep, adfa, opz, msl, spkr or pr (REF_INTERACTION_CHANNEL type CHANNEL) |
| `INTERACTION_TYPE` | STRING |  | Direct call, ADFA visit, Opz Sales call, MSL visit, Speaker program or PR visit |
| `BRAND_DISCUSSED` | BOOLEAN |  | True when the brand was discussed |
| `SUMMARY` | STRING |  | One-line summary of the interaction |

### `FCT_HCP_METRICS`

HCP volume and brand metrics by snapshot.

- **Key:** HCP_METRIC_ID  
- **Refresh:** Daily (new AS_OF_DATE snapshot) · **Load:** Append a snapshot; the app reads the latest per HCP  
- **Used by:** HS volume, JAK users, POVO patients, PEFs on targets, Must-Wins, accounts

| Column | Type | Required | Description |
|---|---|---|---|
| `HCP_METRIC_ID` | STRING | yes | BRAND_CODE/HCP_ID/AS_OF_DATE, e.g. POVO/H000123/2026-10-05 |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `HCP_ID` | STRING | yes | HCP |
| `TERRITORY_ID` | STRING |  | Territory of the HCP (carried here so no join to DIM_HCP is needed) |
| `AS_OF_DATE` | DATE | yes | Snapshot date; the app uses the latest per HCP |
| `INDICATION_PATIENTS_12M` | INT |  | Indication patients (POVO: HS) seen in the last 12 months |
| `INDICATION_VISITS_PER_MONTH` | INT |  | Average indication visits a month |
| `COMPETITOR_PATIENTS` | INT |  | Patients on the main competitor class (POVO: oral JAK); above 0 means a competitor user |
| `BRAND_PATIENTS` | INT |  | Brand patients; equals the NEW_PATIENT events for the HCP |
| `PROGRAM_ENROLLED_PATIENTS` | INT |  | Patients enrolled in the patient program (POVO: IncyteCARES enrollment forms) |

## 2. Goals

### `FCT_TERRITORY_GOAL`

Monthly territory goals.

- **Key:** GOAL_ID  
- **Refresh:** When goals are set or changed (at least monthly) · **Load:** Upsert on key  
- **Used by:** Goal KPI cards (goal, due to date, on track / at risk)

| Column | Type | Required | Description |
|---|---|---|---|
| `GOAL_ID` | STRING | yes | BRAND_CODE/TERRITORY_ID/YYYY-MM/METRIC_CODE, e.g. POVO/NE-POR/2026-10/PEF |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `TERRITORY_ID` | STRING | yes | Territory |
| `GOAL_YEAR` | INT | yes | Goal year |
| `GOAL_MONTH` | INT | yes | Goal month, 1 to 12 |
| `METRIC_CODE` | STRING | yes | PEF, NRX or NEW_PATIENTS (REF_INTERACTION_CHANNEL type KPI_METRIC) |
| `GOAL_VALUE` | INT |  | Goal for the month |

## 3. Call plan

### `DIM_CALL_PLAN_TARGET`

Brand targets and their call-plan attributes.

- **Key:** PLAN_TARGET_ID  
- **Refresh:** When the call plan changes (yearly, plus adjustments) · **Load:** Replace the brand's plan year  
- **Used by:** Target universe, deciles, tiers, segments, competitive focus, call plan table

| Column | Type | Required | Description |
|---|---|---|---|
| `PLAN_TARGET_ID` | STRING | yes | BRAND_CODE/PLAN_YEAR/TERRITORY_ID/HCP_ID |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `PLAN_YEAR` | INT | yes | Call plan year |
| `TERRITORY_ID` | STRING | yes | Territory |
| `HCP_ID` | STRING | yes | HCP |
| `DECILE` | INT |  | Weighted index decile, 1 to 10 |
| `TIER_CODE` | STRING |  | SH, MED or LOW (REF_INTERACTION_CHANNEL type TIER); null for decile 1 |
| `SEGMENT_CODE` | STRING |  | imm, conv or exp (REF_INTERACTION_CHANNEL type SEGMENT) |
| `COMPETITIVE_FOCUS` | STRING |  | cosentyx, bimzelx, humira, jak or conventional |
| `IS_IN_CALL_PLAN` | BOOLEAN |  | True for deciles 2 to 10 |
| `VOLUME_RANK` | INT |  | Rank by indication volume within the territory, 1 = highest |

## 4. Organisation and customers

### `DIM_EMPLOYEE`

Employees who can use the app (reps and managers), one row per person.

- **Key:** EMPLOYEE_ID  
- **Refresh:** Daily or on change · **Load:** Upsert on key  
- **Used by:** Sign-in, role, impersonation search

| Column | Type | Required | Description |
|---|---|---|---|
| `EMPLOYEE_ID` | STRING | yes | Employee ID, e.g. p250544 |
| `BRAND_CODE` | STRING | yes | Home brand of the employee; -> CFG_BRAND |
| `NETWORK_ID` | STRING |  | Network ID, e.g. 3351 |
| `USERNAME` | STRING |  | Login name matched against the Posit identity header, e.g. vturano |
| `EMAIL` | STRING |  | Work email, fallback match for the identity header |
| `FIRST_NAME` | STRING |  | First name |
| `LAST_NAME` | STRING |  | Last name |
| `FULL_NAME` | STRING |  | First and last name |
| `INITIALS` | STRING |  | Initials shown in the avatar |
| `BUSINESS_UNIT` | STRING |  | Business unit, e.g. COMMERCIAL |
| `ROLE_CODE` | STRING |  | REP or MANAGER; drives permissions |
| `ROLE_TITLE` | STRING |  | POVO Sales Representative or Manager, Field Sales Enablement |
| `ACCESS_LEVEL` | STRING |  | Access description shown in the impersonation card |
| `ACCESS_REGIONS` | STRING |  | Regions the employee can see, e.g. Northeast |
| `IS_ACTIVE` | BOOLEAN |  | False blocks access to every brand with 403 |

### `DIM_SALES_ASSIGNMENT`

Sales: the territory each employee covers for a brand (one row per employee and brand; replaces DIM_TERRITORY).

- **Key:** ASSIGNMENT_ID  
- **Refresh:** Daily or on change · **Load:** Replace the brand's rows  
- **Used by:** Which brands an employee can use and the territory that scopes their data; header

| Column | Type | Required | Description |
|---|---|---|---|
| `ASSIGNMENT_ID` | STRING | yes | BRAND_CODE/EMPLOYEE_ID, e.g. POVO/p250544 |
| `BRAND_CODE` | STRING | yes | Brand the employee sells; -> CFG_BRAND |
| `EMPLOYEE_ID` | STRING | yes | Employee (DIM_EMPLOYEE) |
| `TERRITORY_ID` | STRING | yes | Territory the employee covers for the brand; scopes every data query, e.g. NE-POR |
| `TERRITORY_NAME` | STRING |  | Territory display name, e.g. Portland, ME territory |
| `CITY` | STRING |  | Anchor city of the territory |
| `STATE` | STRING |  | Two-letter state code of the anchor city |
| `REGION` | STRING |  | Sales region, e.g. Northeast |
| `TIME_ZONE` | STRING |  | IANA time zone, e.g. America/New_York |
| `IS_ACTIVE` | BOOLEAN |  | False removes the brand from the employee's brand selector |

### `DIM_ACCOUNT`

Accounts (practices and sites).

- **Key:** ACCOUNT_ID  
- **Refresh:** Weekly or on change · **Load:** Replace the brand's rows  
- **Used by:** Accounts filter, claims-only accounts

| Column | Type | Required | Description |
|---|---|---|---|
| `ACCOUNT_ID` | STRING | yes | Account key |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `TERRITORY_ID` | STRING |  | Territory the account belongs to |
| `ACCOUNT_NAME` | STRING |  | Practice or site name |
| `CITY` | STRING |  | City |
| `STATE` | STRING |  | Two-letter state code |
| `ZIP` | STRING |  | Five-digit ZIP code, kept as text to preserve leading zeros |
| `CLAIMS_INDICATION_PATIENTS` | INT |  | Indication (e.g. HS) patients at the site from account-level claims, last 12 months |
| `CLAIMS_BRAND_PATIENTS` | INT |  | Brand patients at the site from account-level claims |
| `CLAIMS_MAIN_FOCUS` | STRING |  | Competitive focus code with the highest indication volume at the site |
| `IS_CLAIMS_ONLY` | BOOLEAN |  | True when claims show patients but no treating HCP is affiliated |

### `DIM_HCP`

Call targets: physicians and their affiliated NPs and PAs, with the territory they belong to.

- **Key:** HCP_ID  
- **Refresh:** Weekly or on change · **Load:** Replace the brand's rows  
- **Used by:** Targets, participants (NP/PA under a physician), the HCP's territory

| Column | Type | Required | Description |
|---|---|---|---|
| `HCP_ID` | STRING | yes | HCP key, e.g. H000123 |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `NPI` | STRING |  | National Provider Identifier (dummy, Luhn-valid) |
| `FIRST_NAME` | STRING |  | First name |
| `LAST_NAME` | STRING |  | Last name |
| `DEGREE` | STRING |  | MD, DO, NP or PA |
| `ROLE_TYPE` | STRING |  | HCP (physician), NP or PA |
| `SPECIALTY` | STRING |  | Dermatology, Rheumatology or General Surgery |
| `ACCOUNT_ID` | STRING |  | Primary account |
| `PARENT_HCP_ID` | STRING |  | Affiliated physician for an NP or PA; null for a physician |
| `TERRITORY_ID` | STRING |  | Territory the HCP belongs to |
| `TERRITORY_NAME` | STRING |  | Territory display name, e.g. Portland, ME territory |
| `REGION` | STRING |  | Sales region of the territory, e.g. Northeast |
| `CITY` | STRING |  | City of the primary account |
| `STATE` | STRING |  | State of the primary account |
| `ZIP` | STRING |  | ZIP of the primary account |

## 5. Reference lists

### `REF_INTERACTION_CHANNEL`

Master reference list: interaction channels, call-plan tiers, target segments, KPI card definitions and KPI rates, told apart by REF_TYPE (replaces REF_TIER, REF_SEGMENT, REF_KPI_METRIC and REF_KPI_PARAMETER).

- **Key:** REF_ID  
- **Refresh:** Rarely (KPI rates: monthly or on change) · **Load:** Replace the brand's rows  
- **Used by:** Interaction cards and chips (CHANNEL), tier chips and reach/frequency goals (TIER), segmentation card and tags (SEGMENT), which KPI cards show and what counts as achieved (KPI_METRIC), Paid / Bridge / Free Trial rates (KPI_PARAMETER)

| Column | Type | Required | Description |
|---|---|---|---|
| `REF_ID` | STRING | yes | BRAND_CODE/REF_TYPE/CODE, e.g. POVO/TIER/SH |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `REF_TYPE` | STRING | yes | CHANNEL, TIER, SEGMENT, KPI_METRIC or KPI_PARAMETER |
| `CODE` | STRING | yes | Channel (rep, adfa, opz, msl, spkr, pr), tier (SH, MED, LOW), segment (imm, conv, exp), KPI (PEF, NEW_PATIENTS) or parameter code |
| `NAME` | STRING |  | Channel card title (Direct call), tier name (Super High), segment full name, or KPI card title |
| `SHORT_NAME` | STRING |  | SEGMENT: short name, e.g. Immediate |
| `DESCRIPTION` | STRING |  | SEGMENT: description; KPI_PARAMETER: what the rate means |
| `TEAM_LABEL` | STRING |  | CHANNEL: team on the filter chip, e.g. POVO Sales |
| `COLOR_HEX` | STRING |  | SEGMENT: chart colour |
| `ARCHETYPE_NAME` | STRING |  | SEGMENT: patient archetype the rep discusses, e.g. Tara |
| `ARCHETYPE_DESC` | STRING |  | SEGMENT: archetype description |
| `DECILE_MIN` | INT |  | TIER: lowest decile in the tier |
| `DECILE_MAX` | INT |  | TIER: highest decile in the tier |
| `CALLS_PER_YEAR` | INT |  | TIER: planned calls a year per target |
| `REACH_GOAL_PCT` | INT |  | TIER: reach goal in percent |
| `EVENT_TYPE` | STRING |  | KPI_METRIC: FCT_BRAND_ACTIVITY.EVENT_TYPE counted as the actual (PEF, NEW_PATIENT) |
| `UNIT` | STRING |  | KPI_METRIC: unit shown after the numbers, e.g. PEFs |
| `PARAM_VALUE` | DOUBLE |  | KPI_PARAMETER: rate between 0 and 1 (PAID_PERSISTENCE, PENDING_ON_THERAPY, BRIDGE_SHARE) |
| `SORT_ORDER` | INT |  | Display order within the REF_TYPE |

### `REF_COMPETITIVE_FOCUS`

Competitive focus values.

- **Key:** FOCUS_ID  
- **Refresh:** Rarely · **Load:** Replace the brand's rows  
- **Used by:** Competitive focus tags and filter

| Column | Type | Required | Description |
|---|---|---|---|
| `FOCUS_ID` | STRING | yes | BRAND_CODE/FOCUS_CODE |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `FOCUS_CODE` | STRING | yes | cosentyx, bimzelx, humira, jak or conventional |
| `LABEL` | STRING |  | Display label |
| `COLOR_HEX` | STRING |  | Tag colour |
| `SORT_ORDER` | INT |  | Display order |

### `REF_HOLIDAY`

Company holidays; working days are weekdays minus these.

- **Key:** HOLIDAY_ID  
- **Refresh:** Yearly · **Load:** Replace the brand's rows  
- **Used by:** Working days (due to date, remaining days)

| Column | Type | Required | Description |
|---|---|---|---|
| `HOLIDAY_ID` | STRING | yes | BRAND_CODE/HOLIDAY_DATE |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `HOLIDAY_DATE` | DATE | yes | Observed holiday date |
| `HOLIDAY_NAME` | STRING |  | Holiday name |

## 6. Approved content (MLR)

### `REF_TALKING_POINT`

Approved talking points (copied from seed/content/talking_points.json).

- **Key:** POINT_ID  
- **Refresh:** On each MLR release · **Load:** Replace the brand's rows  
- **Used by:** Suggested messaging, objections and closings (call prep), next-call candidates

| Column | Type | Required | Description |
|---|---|---|---|
| `POINT_ID` | STRING | yes | Talking point key; unique across brands |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `CONTENT_VERSION` | STRING |  | Content version, part of the AI cache key |
| `CATEGORY` | STRING |  | messaging, objection or closing |
| `VARIANT` | STRING |  | initial, next_call, extra or peer |
| `PILLAR` | STRING |  | Pillar label for messaging, e.g. Efficacy |
| `AUDIENCE` | STRING |  | HCP, NP, PA or ALL |
| `SEGMENT_CODE` | STRING |  | imm, conv, exp or ALL |
| `WRITER_STATE` | STRING |  | writer, non_writer or ALL |
| `TEXT_TEMPLATE` | STRING |  | MLR-approved text with {snake_case} placeholders |
| `DETAIL_TEMPLATE` | STRING |  | Insight or response template |
| `NEXT_CALL_TEMPLATE` | STRING |  | Next-call variant template |
| `SORT_ORDER` | INT |  | Default order |
| `MLR_CODE` | STRING |  | MLR approval code |
| `IS_ACTIVE` | BOOLEAN |  | False hides the point |

### `REF_OBJECTION_RULE`

Which objections to show for a participant (copied from seed/content/objection_rules.json).

- **Key:** RULE_ID  
- **Refresh:** On each MLR release · **Load:** Replace the brand's rows  
- **Used by:** Which objections show per participant

| Column | Type | Required | Description |
|---|---|---|---|
| `RULE_ID` | STRING | yes | Rule key; unique across brands |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `AUDIENCE` | STRING |  | HCP, NP, PA or ALL |
| `SEGMENT_CODE` | STRING |  | imm, conv, exp or ALL |
| `MIN_DECILE` | INT |  | Lowest decile the rule applies to |
| `MAX_DECILE` | INT |  | Highest decile the rule applies to |
| `WRITER_STATE` | STRING |  | writer, non_writer or ALL |
| `OBJECTION_POINT_IDS` | STRING |  | Ordered comma-separated POINT_IDs |
| `PRIORITY` | INT |  | Lowest priority wins when several rules match |

### `REF_COMPLIANCE_RULE`

Compliance rules for post-call notes (copied from seed/content/compliance_rules.json).

- **Key:** COMPLIANCE_RULE_ID  
- **Refresh:** On each compliance release · **Load:** Replace the brand's rows  
- **Used by:** AI compliance check of post-call notes

| Column | Type | Required | Description |
|---|---|---|---|
| `COMPLIANCE_RULE_ID` | STRING | yes | BRAND_CODE/RULE_ID, e.g. POVO/off |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `RULE_ID` | STRING | yes | Rule code the compliance engine knows, e.g. off or claim |
| `CHIP_LABEL` | STRING |  | Short chip label |
| `TITLE` | STRING |  | Rule title |
| `SEVERITY` | STRING |  | high, med or low |
| `DEDUCTION` | INT |  | Points deducted from 100 when the rule fires |
| `PATTERN` | STRING |  | Python regular expression, case-insensitive |
| `SUPPRESS_PATTERN` | STRING |  | Regular expression that suppresses the rule; nullable |
| `WHY_TEXT` | STRING |  | Why the note was flagged |
| `FIX_TEXT` | STRING |  | How to fix it |
| `SORT_ORDER` | INT |  | Display order |
| `IS_ACTIVE` | BOOLEAN |  | False disables the rule |

### `REF_COMPLIANCE_TEXT`

Wording of the compliance rewrite (copied from seed/content/compliance_texts.json).

- **Key:** TEXT_ID  
- **Refresh:** On each compliance release · **Load:** Replace the brand's rows  
- **Used by:** Compliance rewrite wording

| Column | Type | Required | Description |
|---|---|---|---|
| `TEXT_ID` | STRING | yes | Text key, e.g. TPL_MESSAGING; unique across brands |
| `BRAND_CODE` | STRING | yes | Brand; -> CFG_BRAND |
| `CONTENT_VERSION` | STRING |  | Content version, e.g. 2026.2 |
| `KIND` | STRING |  | template, replacement, reword or cut_off |
| `TEXT_KEY` | STRING |  | Category (template), rule id (replacement), rule id (reword) or why/fix/placeholder (cut_off) |
| `PATTERN` | STRING |  | Python regular expression for a reword; nullable |
| `TEXT_TEMPLATE` | STRING |  | The text; {who} is the participant name |
| `SORT_ORDER` | INT |  | Order |
| `IS_ACTIVE` | BOOLEAN |  | False disables the text |

## Content tables today

The four approved-content tables (group 6) are loaded today from JSON files the backend owns (`databricks/seed/content/`). If the MLR-approved content will come from the data team's system instead, load these tables per brand and the app uses them as they are; the JSON stays only as a fallback for an empty table.
