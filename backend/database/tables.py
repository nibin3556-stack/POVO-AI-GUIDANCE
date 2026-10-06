"""Fully qualified table names, the column types, and the keys of every table.

Names are built from DATABRICKS_CATALOG / DATABRICKS_SCHEMA /
DATABRICKS_APP_SCHEMA, so the same `catalog.schema.TABLE` SQL runs on the
Databricks warehouse and on the local DuckDB file (attached AS the catalog).

SQLite has no catalogs or schemas, so with DATA_SOURCE=sqlite the bare table
name is used. That is safe because the names are unique across the two
schemas (every app table starts with APP_ or CFG_), and it keeps the whole
database in one shareable file.

Keys (multi-brand):

  * Every table has ONE primary-key column (PRIMARY_KEYS). BRAND_CODE is never
    part of a primary key.
  * Every table carries BRAND_CODE as a FOREIGN KEY to CFG_BRAND.BRAND_CODE,
    the brand master. Enforced by SQLite, declared (informational) on
    Databricks. The audit log and job runs may hold NULL (all brands).
  * Where the natural key spans several columns, the primary key is a
    deterministic text ID built from them (`key_id`), so an upsert of the same
    row always hits the same key.

The column lists mirror databricks/ddl. They are used by the local warehouses
to create tables and cast CSV text to real types, and by the Databricks MERGE
builder to CAST parameters (a NULL parameter has no type of its own on the
warehouse).
"""
from core.config import get_settings

BRAND = ("BRAND_CODE", "STRING")

BRONZE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "DIM_EMPLOYEE": [("EMPLOYEE_ID", "STRING"), BRAND, ("NETWORK_ID", "STRING"), ("USERNAME", "STRING"),
                     ("EMAIL", "STRING"), ("FIRST_NAME", "STRING"), ("LAST_NAME", "STRING"),
                     ("FULL_NAME", "STRING"), ("INITIALS", "STRING"), ("BUSINESS_UNIT", "STRING"),
                     ("ROLE_CODE", "STRING"), ("ROLE_TITLE", "STRING"), ("ACCESS_LEVEL", "STRING"),
                     ("ACCESS_REGIONS", "STRING"), ("IS_ACTIVE", "BOOLEAN")],
    # Sales: which territory an employee covers for a brand (replaces DIM_TERRITORY).
    "DIM_SALES_ASSIGNMENT": [("ASSIGNMENT_ID", "STRING"), BRAND, ("EMPLOYEE_ID", "STRING"),
                             ("TERRITORY_ID", "STRING"), ("TERRITORY_NAME", "STRING"), ("CITY", "STRING"),
                             ("STATE", "STRING"), ("REGION", "STRING"), ("TIME_ZONE", "STRING"),
                             ("IS_ACTIVE", "BOOLEAN")],
    "DIM_ACCOUNT": [("ACCOUNT_ID", "STRING"), BRAND, ("TERRITORY_ID", "STRING"), ("ACCOUNT_NAME", "STRING"),
                    ("CITY", "STRING"), ("STATE", "STRING"), ("ZIP", "STRING"),
                    ("CLAIMS_INDICATION_PATIENTS", "INT"), ("CLAIMS_BRAND_PATIENTS", "INT"),
                    ("CLAIMS_MAIN_FOCUS", "STRING"), ("IS_CLAIMS_ONLY", "BOOLEAN")],
    "DIM_HCP": [("HCP_ID", "STRING"), BRAND, ("NPI", "STRING"), ("FIRST_NAME", "STRING"), ("LAST_NAME", "STRING"),
                ("DEGREE", "STRING"), ("ROLE_TYPE", "STRING"), ("SPECIALTY", "STRING"),
                ("ACCOUNT_ID", "STRING"), ("PARENT_HCP_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                ("TERRITORY_NAME", "STRING"), ("REGION", "STRING"),
                ("CITY", "STRING"), ("STATE", "STRING"), ("ZIP", "STRING")],
    "FCT_HCP_METRICS": [("HCP_METRIC_ID", "STRING"), BRAND, ("HCP_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                        ("AS_OF_DATE", "DATE"), ("INDICATION_PATIENTS_12M", "INT"),
                        ("INDICATION_VISITS_PER_MONTH", "INT"), ("COMPETITOR_PATIENTS", "INT"),
                        ("BRAND_PATIENTS", "INT"), ("PROGRAM_ENROLLED_PATIENTS", "INT")],
    "DIM_CALL_PLAN_TARGET": [("PLAN_TARGET_ID", "STRING"), BRAND, ("PLAN_YEAR", "INT"), ("TERRITORY_ID", "STRING"),
                             ("HCP_ID", "STRING"), ("DECILE", "INT"), ("TIER_CODE", "STRING"),
                             ("SEGMENT_CODE", "STRING"), ("COMPETITIVE_FOCUS", "STRING"),
                             ("IS_IN_CALL_PLAN", "BOOLEAN"), ("VOLUME_RANK", "INT")],
    # Master reference list: interaction channels, tiers, segments, KPI metrics and KPI parameters,
    # told apart by REF_TYPE. Each type uses only its own columns (the others stay NULL).
    "REF_INTERACTION_CHANNEL": [("REF_ID", "STRING"), BRAND, ("REF_TYPE", "STRING"), ("CODE", "STRING"),
                                ("NAME", "STRING"), ("SHORT_NAME", "STRING"), ("DESCRIPTION", "STRING"),
                                ("TEAM_LABEL", "STRING"), ("COLOR_HEX", "STRING"), ("ARCHETYPE_NAME", "STRING"),
                                ("ARCHETYPE_DESC", "STRING"), ("DECILE_MIN", "INT"), ("DECILE_MAX", "INT"),
                                ("CALLS_PER_YEAR", "INT"), ("REACH_GOAL_PCT", "INT"), ("EVENT_TYPE", "STRING"),
                                ("UNIT", "STRING"), ("PARAM_VALUE", "DOUBLE"), ("SORT_ORDER", "INT")],
    "REF_COMPETITIVE_FOCUS": [("FOCUS_ID", "STRING"), BRAND, ("FOCUS_CODE", "STRING"), ("LABEL", "STRING"),
                              ("COLOR_HEX", "STRING"), ("SORT_ORDER", "INT")],
    "FCT_INTERACTION": [("INTERACTION_ID", "STRING"), BRAND, ("HCP_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                        ("EMPLOYEE_ID", "STRING"), ("INTERACTION_DATE", "DATE"), ("CHANNEL_CODE", "STRING"),
                        ("INTERACTION_TYPE", "STRING"), ("BRAND_DISCUSSED", "BOOLEAN"), ("SUMMARY", "STRING")],
    "FCT_BRAND_ACTIVITY": [("ACTIVITY_ID", "STRING"), BRAND, ("TERRITORY_ID", "STRING"), ("HCP_ID", "STRING"),
                           ("PATIENT_KEY", "STRING"), ("EVENT_DATE", "DATE"), ("EVENT_TYPE", "STRING")],
    "FCT_TERRITORY_GOAL": [("GOAL_ID", "STRING"), BRAND, ("TERRITORY_ID", "STRING"), ("GOAL_YEAR", "INT"),
                           ("GOAL_MONTH", "INT"), ("METRIC_CODE", "STRING"), ("GOAL_VALUE", "INT")],
    "REF_HOLIDAY": [("HOLIDAY_ID", "STRING"), BRAND, ("HOLIDAY_DATE", "DATE"), ("HOLIDAY_NAME", "STRING")],
    "REF_TALKING_POINT": [("POINT_ID", "STRING"), BRAND, ("CONTENT_VERSION", "STRING"), ("CATEGORY", "STRING"),
                          ("VARIANT", "STRING"), ("PILLAR", "STRING"), ("AUDIENCE", "STRING"),
                          ("SEGMENT_CODE", "STRING"), ("WRITER_STATE", "STRING"), ("TEXT_TEMPLATE", "STRING"),
                          ("DETAIL_TEMPLATE", "STRING"), ("NEXT_CALL_TEMPLATE", "STRING"), ("SORT_ORDER", "INT"),
                          ("MLR_CODE", "STRING"), ("IS_ACTIVE", "BOOLEAN")],
    "REF_OBJECTION_RULE": [("RULE_ID", "STRING"), BRAND, ("AUDIENCE", "STRING"), ("SEGMENT_CODE", "STRING"),
                           ("MIN_DECILE", "INT"), ("MAX_DECILE", "INT"), ("WRITER_STATE", "STRING"),
                           ("OBJECTION_POINT_IDS", "STRING"), ("PRIORITY", "INT")],
    "REF_COMPLIANCE_RULE": [("COMPLIANCE_RULE_ID", "STRING"), BRAND, ("RULE_ID", "STRING"), ("CHIP_LABEL", "STRING"),
                            ("TITLE", "STRING"), ("SEVERITY", "STRING"), ("DEDUCTION", "INT"), ("PATTERN", "STRING"),
                            ("SUPPRESS_PATTERN", "STRING"), ("WHY_TEXT", "STRING"), ("FIX_TEXT", "STRING"),
                            ("SORT_ORDER", "INT"), ("IS_ACTIVE", "BOOLEAN")],
    "REF_COMPLIANCE_TEXT": [("TEXT_ID", "STRING"), BRAND, ("CONTENT_VERSION", "STRING"), ("KIND", "STRING"),
                            ("TEXT_KEY", "STRING"), ("PATTERN", "STRING"), ("TEXT_TEMPLATE", "STRING"),
                            ("SORT_ORDER", "INT"), ("IS_ACTIVE", "BOOLEAN")],
}

APP_COLUMNS: dict[str, list[tuple[str, str]]] = {
    # The brand master: every other table's BRAND_CODE references it. Written by the admin endpoints.
    "CFG_BRAND": [BRAND, ("BRAND_NAME", "STRING"), ("DESCRIPTION", "STRING"), ("IS_ACTIVE", "BOOLEAN"),
                  ("SORT_ORDER", "INT"), ("UPDATED_AT", "TIMESTAMP"), ("UPDATED_BY", "STRING")],
    "CFG_BRAND_FEATURE": [("BRAND_FEATURE_ID", "STRING"), BRAND, ("FEATURE_CODE", "STRING"),
                          ("IS_ENABLED", "BOOLEAN"), ("UPDATED_AT", "TIMESTAMP"), ("UPDATED_BY", "STRING")],
    "APP_CALL": [("CALL_ID", "STRING"), BRAND, ("TERRITORY_ID", "STRING"), ("REP_EMPLOYEE_ID", "STRING"),
                 ("ACTED_BY_EMPLOYEE_ID", "STRING"), ("HCP_ID", "STRING"), ("CALL_DATE", "DATE"),
                 ("PARTICIPANT_IDS", "STRING"), ("STATUS", "STRING"), ("REVISION_NO", "INT"),
                 ("CREATED_AT", "TIMESTAMP"), ("UPDATED_AT", "TIMESTAMP")],
    "APP_CALL_POINT_ASSESSMENT": [("ASSESSMENT_ID", "STRING"), BRAND, ("CALL_ID", "STRING"),
                                  ("PARTICIPANT_ID", "STRING"), ("CATEGORY", "STRING"), ("POINT_ID", "STRING"),
                                  ("POINT_RANK", "INT"), ("POINT_TEXT", "STRING"), ("WAS_RAISED", "BOOLEAN"),
                                  ("RECEPTION", "INT"), ("NOTE", "STRING"), ("COMPLIANCE_STATUS", "STRING"),
                                  ("COMPLIANCE_CHECK_ID", "STRING"), ("UPDATED_AT", "TIMESTAMP"),
                                  ("UPDATED_BY", "STRING")],
    "APP_COMPLIANCE_CHECK": [("CHECK_ID", "STRING"), BRAND, ("CALL_ID", "STRING"), ("PARTICIPANT_ID", "STRING"),
                             ("CATEGORY", "STRING"), ("POINT_ID", "STRING"), ("NOTE_TEXT", "STRING"),
                             ("RESULT_LABEL", "STRING"), ("MAX_SEVERITY", "STRING"), ("SCORE", "INT"),
                             ("ISSUES_JSON", "STRING"), ("SUGGESTED_TEXT", "STRING"), ("ENGINE", "STRING"),
                             ("SUGGESTION_ACCEPTED", "BOOLEAN"), ("REP_EMPLOYEE_ID", "STRING"),
                             ("ACTED_BY_EMPLOYEE_ID", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_CALL_PREP_REVISION": [("REVISION_ID", "STRING"), BRAND, ("CALL_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                               ("HCP_ID", "STRING"), ("PARTICIPANT_ID", "STRING"), ("REVISION_NO", "INT"),
                               ("CALL_DATE", "DATE"), ("CATEGORY", "STRING"), ("POINTS_JSON", "STRING"),
                               ("SUMMARY_TEXT", "STRING"), ("NEXT_BEST_ACTION", "STRING"),
                               ("HISTORY_LINE", "STRING"), ("ENGINE", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_TERRITORY_GUIDANCE_SNAPSHOT": [("SNAPSHOT_ID", "STRING"), BRAND, ("TERRITORY_ID", "STRING"),
                                        ("SNAPSHOT_DATE", "DATE"), ("PAYLOAD_JSON", "STRING"),
                                        ("CREATED_AT", "TIMESTAMP")],
    "APP_AI_CACHE": [("CACHE_KEY", "STRING"), BRAND, ("KIND", "STRING"), ("PAYLOAD_JSON", "STRING"),
                     ("CREATED_AT", "TIMESTAMP"), ("EXPIRES_AT", "TIMESTAMP")],
    "APP_AUDIT_LOG": [("AUDIT_ID", "STRING"), BRAND, ("REQUEST_ID", "STRING"), ("ACTED_BY_EMPLOYEE_ID", "STRING"),
                      ("EFFECTIVE_EMPLOYEE_ID", "STRING"), ("ACTION", "STRING"), ("MODULE", "STRING"),
                      ("RECORD_ID", "STRING"), ("DETAIL_JSON", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_JOB_RUN": [("RUN_ID", "STRING"), BRAND, ("JOB_NAME", "STRING"), ("STARTED_AT", "TIMESTAMP"),
                    ("FINISHED_AT", "TIMESTAMP"), ("STATUS", "STRING"), ("DETAIL", "STRING")],
}

ALL_COLUMNS = {**BRONZE_COLUMNS, **APP_COLUMNS}

#: The single primary-key column of every table: the first column, never BRAND_CODE
#: (except for CFG_BRAND, whose key IS the brand code).
PRIMARY_KEYS: dict[str, str] = {table: cols[0][0] for table, cols in ALL_COLUMNS.items()}

#: Tables whose BRAND_CODE may be NULL (an entry that spans every brand).
NULLABLE_BRAND = ("APP_AUDIT_LOG", "APP_JOB_RUN")

#: REF_INTERACTION_CHANNEL.REF_TYPE values.
REF_CHANNEL, REF_TIER, REF_SEGMENT, REF_KPI_METRIC, REF_KPI_PARAMETER = (
    "CHANNEL", "TIER", "SEGMENT", "KPI_METRIC", "KPI_PARAMETER")


def key_id(*parts) -> str:
    """Deterministic single-column key from the natural key parts, e.g. 'POVO|NE-POR|2026-10|PEF'."""
    return "|".join("" if p is None else str(p) for p in parts)


def bronze(table: str) -> str:
    s = get_settings()
    if s.data_source == "sqlite":
        return table
    return f"{s.databricks_catalog}.{s.databricks_schema}.{table}"


def app(table: str) -> str:
    s = get_settings()
    if s.data_source == "sqlite":
        return table
    return f"{s.databricks_catalog}.{s.databricks_app_schema}.{table}"


def column_types(table: str) -> dict[str, str]:
    return dict(ALL_COLUMNS[table])
