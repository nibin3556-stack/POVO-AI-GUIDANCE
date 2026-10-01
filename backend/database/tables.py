"""Fully qualified table names, and the column types of every table.

Names are built from DATABRICKS_CATALOG / DATABRICKS_SCHEMA /
DATABRICKS_APP_SCHEMA, so the same `catalog.schema.TABLE` SQL runs on the
Databricks warehouse and on the local DuckDB file (attached AS the catalog).

SQLite has no catalogs or schemas, so with DATA_SOURCE=sqlite the bare table
name is used. That is safe because the names are unique across the two
schemas (every app table starts with APP_), and it keeps the whole database
in one shareable file.

The column lists mirror ARCHITECTURE.md §4 (and databricks/ddl). They are used
by the local warehouse to create tables and cast CSV text to real types, and by
the Databricks MERGE builder to CAST parameters (a NULL parameter has no type
of its own on the warehouse).
"""
from core.config import get_settings

BRONZE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "DIM_TERRITORY": [("TERRITORY_ID", "STRING"), ("TERRITORY_NAME", "STRING"), ("CITY", "STRING"),
                      ("STATE", "STRING"), ("REGION", "STRING"), ("TIME_ZONE", "STRING")],
    "DIM_EMPLOYEE": [("EMPLOYEE_ID", "STRING"), ("NETWORK_ID", "STRING"), ("USERNAME", "STRING"),
                     ("EMAIL", "STRING"), ("FIRST_NAME", "STRING"), ("LAST_NAME", "STRING"),
                     ("FULL_NAME", "STRING"), ("INITIALS", "STRING"), ("BUSINESS_UNIT", "STRING"),
                     ("ROLE_CODE", "STRING"), ("ROLE_TITLE", "STRING"), ("ACCESS_LEVEL", "STRING"),
                     ("ACCESS_REGIONS", "STRING"), ("HOME_TERRITORY_ID", "STRING"), ("IS_ACTIVE", "BOOLEAN")],
    "DIM_ACCOUNT": [("ACCOUNT_ID", "STRING"), ("TERRITORY_ID", "STRING"), ("ACCOUNT_NAME", "STRING"),
                    ("CITY", "STRING"), ("STATE", "STRING"), ("ZIP", "STRING"),
                    ("CLAIMS_HS_PATIENTS", "INT"), ("CLAIMS_POVO_PATIENTS", "INT"),
                    ("CLAIMS_MAIN_FOCUS", "STRING"), ("IS_CLAIMS_ONLY", "BOOLEAN")],
    "DIM_HCP": [("HCP_ID", "STRING"), ("NPI", "STRING"), ("FIRST_NAME", "STRING"), ("LAST_NAME", "STRING"),
                ("DEGREE", "STRING"), ("ROLE_TYPE", "STRING"), ("SPECIALTY", "STRING"),
                ("ACCOUNT_ID", "STRING"), ("PARENT_HCP_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                ("CITY", "STRING"), ("STATE", "STRING"), ("ZIP", "STRING")],
    "FCT_HCP_METRICS": [("HCP_ID", "STRING"), ("AS_OF_DATE", "DATE"), ("HS_PATIENTS_12M", "INT"),
                        ("HS_VISITS_PER_MONTH", "INT"), ("JAK_PATIENTS", "INT"), ("POVO_PATIENTS", "INT"),
                        ("INCYTECARES_ENROLLED_PATIENTS", "INT")],
    "DIM_CALL_PLAN_TARGET": [("PLAN_YEAR", "INT"), ("TERRITORY_ID", "STRING"), ("HCP_ID", "STRING"),
                             ("DECILE", "INT"), ("TIER_CODE", "STRING"), ("SEGMENT_CODE", "STRING"),
                             ("COMPETITIVE_FOCUS", "STRING"), ("IS_IN_CALL_PLAN", "BOOLEAN"), ("HS_RANK", "INT")],
    "REF_TIER": [("TIER_CODE", "STRING"), ("TIER_NAME", "STRING"), ("DECILE_MIN", "INT"), ("DECILE_MAX", "INT"),
                 ("CALLS_PER_YEAR", "INT"), ("REACH_GOAL_PCT", "INT"), ("SORT_ORDER", "INT")],
    "REF_SEGMENT": [("SEGMENT_CODE", "STRING"), ("SHORT_NAME", "STRING"), ("FULL_NAME", "STRING"),
                    ("DESCRIPTION", "STRING"), ("COLOR_HEX", "STRING"), ("ARCHETYPE_NAME", "STRING"),
                    ("ARCHETYPE_DESC", "STRING"), ("SORT_ORDER", "INT")],
    "REF_KPI_METRIC": [("METRIC_CODE", "STRING"), ("EVENT_TYPE", "STRING"), ("TITLE", "STRING"), ("UNIT", "STRING"), ("SORT_ORDER", "INT")],
    "REF_INTERACTION_CHANNEL": [("CHANNEL_CODE", "STRING"), ("TYPE_LABEL", "STRING"), ("TEAM_LABEL", "STRING"),
                                ("SORT_ORDER", "INT")],
    "REF_COMPETITIVE_FOCUS": [("FOCUS_CODE", "STRING"), ("LABEL", "STRING"), ("COLOR_HEX", "STRING"),
                              ("SORT_ORDER", "INT")],
    "FCT_INTERACTION": [("INTERACTION_ID", "STRING"), ("HCP_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                        ("EMPLOYEE_ID", "STRING"), ("INTERACTION_DATE", "DATE"), ("CHANNEL_CODE", "STRING"),
                        ("INTERACTION_TYPE", "STRING"), ("POVO_DISCUSSED", "BOOLEAN"), ("SUMMARY", "STRING")],
    "FCT_POVO_ACTIVITY": [("ACTIVITY_ID", "STRING"), ("TERRITORY_ID", "STRING"), ("HCP_ID", "STRING"),
                          ("PATIENT_KEY", "STRING"), ("EVENT_DATE", "DATE"), ("EVENT_TYPE", "STRING")],
    "FCT_TERRITORY_GOAL": [("TERRITORY_ID", "STRING"), ("GOAL_YEAR", "INT"), ("GOAL_MONTH", "INT"),
                           ("METRIC_CODE", "STRING"), ("GOAL_VALUE", "INT")],
    "REF_US_HOLIDAY": [("HOLIDAY_DATE", "DATE"), ("HOLIDAY_NAME", "STRING")],
    "REF_TALKING_POINT": [("POINT_ID", "STRING"), ("CONTENT_VERSION", "STRING"), ("CATEGORY", "STRING"),
                          ("VARIANT", "STRING"), ("PILLAR", "STRING"), ("AUDIENCE", "STRING"),
                          ("SEGMENT_CODE", "STRING"), ("WRITER_STATE", "STRING"), ("TEXT_TEMPLATE", "STRING"),
                          ("DETAIL_TEMPLATE", "STRING"), ("NEXT_CALL_TEMPLATE", "STRING"), ("SORT_ORDER", "INT"),
                          ("MLR_CODE", "STRING"), ("IS_ACTIVE", "BOOLEAN")],
    "REF_OBJECTION_RULE": [("RULE_ID", "STRING"), ("AUDIENCE", "STRING"), ("SEGMENT_CODE", "STRING"),
                           ("MIN_DECILE", "INT"), ("MAX_DECILE", "INT"), ("WRITER_STATE", "STRING"),
                           ("OBJECTION_POINT_IDS", "STRING"), ("PRIORITY", "INT")],
    "REF_COMPLIANCE_RULE": [("RULE_ID", "STRING"), ("CHIP_LABEL", "STRING"), ("TITLE", "STRING"),
                            ("SEVERITY", "STRING"), ("DEDUCTION", "INT"), ("PATTERN", "STRING"),
                            ("SUPPRESS_PATTERN", "STRING"), ("WHY_TEXT", "STRING"), ("FIX_TEXT", "STRING"),
                            ("SORT_ORDER", "INT"), ("IS_ACTIVE", "BOOLEAN")],
}

APP_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "APP_CALL": [("CALL_ID", "STRING"), ("TERRITORY_ID", "STRING"), ("REP_EMPLOYEE_ID", "STRING"),
                 ("ACTED_BY_EMPLOYEE_ID", "STRING"), ("HCP_ID", "STRING"), ("CALL_DATE", "DATE"),
                 ("PARTICIPANT_IDS", "STRING"), ("STATUS", "STRING"), ("REVISION_NO", "INT"),
                 ("CREATED_AT", "TIMESTAMP"), ("UPDATED_AT", "TIMESTAMP")],
    "APP_CALL_POINT_ASSESSMENT": [("CALL_ID", "STRING"), ("PARTICIPANT_ID", "STRING"), ("CATEGORY", "STRING"),
                                  ("POINT_ID", "STRING"), ("POINT_RANK", "INT"), ("POINT_TEXT", "STRING"),
                                  ("WAS_RAISED", "BOOLEAN"), ("RECEPTION", "INT"), ("NOTE", "STRING"),
                                  ("COMPLIANCE_STATUS", "STRING"), ("COMPLIANCE_CHECK_ID", "STRING"),
                                  ("UPDATED_AT", "TIMESTAMP"), ("UPDATED_BY", "STRING")],
    "APP_COMPLIANCE_CHECK": [("CHECK_ID", "STRING"), ("CALL_ID", "STRING"), ("PARTICIPANT_ID", "STRING"),
                             ("CATEGORY", "STRING"), ("POINT_ID", "STRING"), ("NOTE_TEXT", "STRING"),
                             ("RESULT_LABEL", "STRING"), ("MAX_SEVERITY", "STRING"), ("SCORE", "INT"),
                             ("ISSUES_JSON", "STRING"), ("SUGGESTED_TEXT", "STRING"), ("ENGINE", "STRING"),
                             ("SUGGESTION_ACCEPTED", "BOOLEAN"), ("REP_EMPLOYEE_ID", "STRING"),
                             ("ACTED_BY_EMPLOYEE_ID", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_CALL_PREP_REVISION": [("REVISION_ID", "STRING"), ("CALL_ID", "STRING"), ("TERRITORY_ID", "STRING"),
                               ("HCP_ID", "STRING"), ("PARTICIPANT_ID", "STRING"), ("REVISION_NO", "INT"),
                               ("CALL_DATE", "DATE"), ("CATEGORY", "STRING"), ("POINTS_JSON", "STRING"),
                               ("SUMMARY_TEXT", "STRING"), ("NEXT_BEST_ACTION", "STRING"),
                               ("HISTORY_LINE", "STRING"), ("ENGINE", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_TERRITORY_GUIDANCE_SNAPSHOT": [("TERRITORY_ID", "STRING"), ("SNAPSHOT_DATE", "DATE"),
                                        ("PAYLOAD_JSON", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_AI_CACHE": [("CACHE_KEY", "STRING"), ("KIND", "STRING"), ("PAYLOAD_JSON", "STRING"),
                     ("CREATED_AT", "TIMESTAMP"), ("EXPIRES_AT", "TIMESTAMP")],
    "APP_AUDIT_LOG": [("AUDIT_ID", "STRING"), ("REQUEST_ID", "STRING"), ("ACTED_BY_EMPLOYEE_ID", "STRING"),
                      ("EFFECTIVE_EMPLOYEE_ID", "STRING"), ("ACTION", "STRING"), ("MODULE", "STRING"),
                      ("RECORD_ID", "STRING"), ("DETAIL_JSON", "STRING"), ("CREATED_AT", "TIMESTAMP")],
    "APP_JOB_RUN": [("RUN_ID", "STRING"), ("JOB_NAME", "STRING"), ("STARTED_AT", "TIMESTAMP"),
                    ("FINISHED_AT", "TIMESTAMP"), ("STATUS", "STRING"), ("DETAIL", "STRING")],
}

ALL_COLUMNS = {**BRONZE_COLUMNS, **APP_COLUMNS}


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
