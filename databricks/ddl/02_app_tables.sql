-- POVO AI Guidance: app tables (ARCHITECTURE.md section 4.2).
--
-- The app reads and writes these; the app principal is granted SELECT and
-- MODIFY on this schema only. Moments are TIMESTAMP in UTC, JSON payloads are
-- STRING. Delta does not enforce primary keys: the logical keys are named in
-- each table comment and the backend upserts with MERGE on them.
-- The seed loader never touches these tables.

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_CALL (
  CALL_ID STRING NOT NULL COMMENT 'Call key (uuid4)',
  TERRITORY_ID STRING COMMENT 'Territory of the effective rep',
  REP_EMPLOYEE_ID STRING COMMENT 'Effective rep (the impersonated rep while impersonating)',
  ACTED_BY_EMPLOYEE_ID STRING COMMENT 'Real signed-in user who made the change',
  HCP_ID STRING COMMENT 'Primary physician of the call',
  CALL_DATE DATE COMMENT 'Call date',
  PARTICIPANT_IDS STRING COMMENT 'JSON array of participant HCP_IDs',
  STATUS STRING COMMENT 'planned or assessed',
  REVISION_NO INT COMMENT 'Next-call revision number',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)',
  UPDATED_AT TIMESTAMP COMMENT 'Last updated (UTC)'
) USING DELTA
COMMENT 'Calls planned and assessed in the app. Logical key CALL_ID.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_CALL_POINT_ASSESSMENT (
  CALL_ID STRING NOT NULL COMMENT 'Call',
  PARTICIPANT_ID STRING NOT NULL COMMENT 'Participant HCP_ID',
  CATEGORY STRING NOT NULL COMMENT 'messaging, objection, closing or additional',
  POINT_ID STRING NOT NULL COMMENT 'Talking point, or additional for the free-text note',
  POINT_RANK INT COMMENT 'Rank of the point as shown in call prep',
  POINT_TEXT STRING COMMENT 'Point text as shown to the rep',
  WAS_RAISED BOOLEAN COMMENT 'True when the point was raised on the call',
  RECEPTION INT COMMENT '0 not well, 1 moderately, 2 well received; null when unset',
  NOTE STRING COMMENT 'Rep note (200 characters, 600 for additional)',
  COMPLIANCE_STATUS STRING COMMENT 'unchecked, passed or flagged',
  COMPLIANCE_CHECK_ID STRING COMMENT 'Latest compliance check for the note',
  UPDATED_AT TIMESTAMP COMMENT 'Last updated (UTC)',
  UPDATED_BY STRING COMMENT 'Employee who last updated the row'
) USING DELTA
COMMENT 'Post-call assessment of each point. Logical key CALL_ID + PARTICIPANT_ID + CATEGORY + POINT_ID.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_COMPLIANCE_CHECK (
  CHECK_ID STRING NOT NULL COMMENT 'Check key',
  CALL_ID STRING COMMENT 'Call; null for a check outside a saved call',
  PARTICIPANT_ID STRING COMMENT 'Participant HCP_ID',
  CATEGORY STRING COMMENT 'messaging, objection, closing or additional',
  POINT_ID STRING COMMENT 'Talking point',
  NOTE_TEXT STRING COMMENT 'Original note, retained for audit',
  RESULT_LABEL STRING COMMENT 'Compliant, Minor issue, Needs review or Non-compliant',
  MAX_SEVERITY STRING COMMENT 'high, med or low; null when compliant',
  SCORE INT COMMENT 'Compliance score, 0 to 100',
  ISSUES_JSON STRING COMMENT 'JSON array of issues found',
  SUGGESTED_TEXT STRING COMMENT 'Suggested compliant rewrite',
  ENGINE STRING COMMENT 'rules or rules+llm',
  SUGGESTION_ACCEPTED BOOLEAN COMMENT 'True when the rep used the suggestion',
  REP_EMPLOYEE_ID STRING COMMENT 'Effective rep',
  ACTED_BY_EMPLOYEE_ID STRING COMMENT 'Real signed-in user',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)'
) USING DELTA
COMMENT 'Compliance checks of post-call notes. Logical key CHECK_ID.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_CALL_PREP_REVISION (
  REVISION_ID STRING NOT NULL COMMENT 'Revision key',
  CALL_ID STRING COMMENT 'Assessed call the revision comes from',
  TERRITORY_ID STRING COMMENT 'Territory',
  HCP_ID STRING COMMENT 'Primary physician',
  PARTICIPANT_ID STRING COMMENT 'Participant HCP_ID',
  REVISION_NO INT COMMENT 'Revision number',
  CALL_DATE DATE COMMENT 'Date of the assessed call',
  CATEGORY STRING COMMENT 'messaging, objection or closing',
  POINTS_JSON STRING COMMENT 'Ordered point list with tags, previous rank and previous text',
  SUMMARY_TEXT STRING COMMENT 'Post-call summary shown in the banner',
  NEXT_BEST_ACTION STRING COMMENT 'Next best action',
  HISTORY_LINE STRING COMMENT 'Post-call history bullet',
  ENGINE STRING COMMENT 'rules or rules+llm',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)'
) USING DELTA
COMMENT 'Next-call call-prep revisions per participant and category. Logical key REVISION_ID.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_TERRITORY_GUIDANCE_SNAPSHOT (
  TERRITORY_ID STRING NOT NULL COMMENT 'Territory',
  SNAPSHOT_DATE DATE NOT NULL COMMENT 'Snapshot date',
  PAYLOAD_JSON STRING COMMENT 'Guidance payload as served by the API',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)'
) USING DELTA
COMMENT 'Nightly AI guidance per territory. Logical key TERRITORY_ID + SNAPSHOT_DATE.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_AI_CACHE (
  CACHE_KEY STRING NOT NULL COMMENT 'Cache key',
  KIND STRING COMMENT 'What was cached, e.g. call_prep',
  PAYLOAD_JSON STRING COMMENT 'Cached payload',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)',
  EXPIRES_AT TIMESTAMP COMMENT 'Expiry (UTC); purged by the nightly job'
) USING DELTA
COMMENT 'Cache of LLM results. Logical key CACHE_KEY.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_AUDIT_LOG (
  AUDIT_ID STRING NOT NULL COMMENT 'Audit key',
  REQUEST_ID STRING COMMENT 'Request ID (uuid4)',
  ACTED_BY_EMPLOYEE_ID STRING COMMENT 'Real signed-in user',
  EFFECTIVE_EMPLOYEE_ID STRING COMMENT 'Effective user (the impersonated rep while impersonating)',
  ACTION STRING COMMENT 'IMPERSONATE_START, IMPERSONATE_END, CALL_CREATE, ASSESSMENT_SAVE, COMPLIANCE_CHECK, SUGGESTION_ACCEPT, NEXT_CALL_GENERATE or JOB_RUN',
  MODULE STRING COMMENT 'Module that wrote the entry',
  RECORD_ID STRING COMMENT 'Record the action applies to',
  DETAIL_JSON STRING COMMENT 'Details; never secrets, never note text',
  CREATED_AT TIMESTAMP COMMENT 'Created (UTC)'
) USING DELTA
COMMENT 'Audit trail of user and job actions. Logical key AUDIT_ID.';

CREATE TABLE IF NOT EXISTS ${catalog}.${app_schema}.APP_JOB_RUN (
  RUN_ID STRING NOT NULL COMMENT 'Run key',
  JOB_NAME STRING COMMENT 'Job name, e.g. refresh-guidance',
  STARTED_AT TIMESTAMP COMMENT 'Started (UTC)',
  FINISHED_AT TIMESTAMP COMMENT 'Finished (UTC)',
  STATUS STRING COMMENT 'running, success or failed',
  DETAIL STRING COMMENT 'Result or error summary'
) USING DELTA
COMMENT 'Scheduled job runs. Logical key RUN_ID.';
