-- POVO AI Guidance: grants for the app principal (template).
--
-- ${app_principal} is the user, group or service principal the backend
-- connects as (for a service principal, its application ID). deploy_schema.py
-- runs this file only with --with-grants and an app principal; otherwise hand
-- it to a workspace admin with the placeholders filled in.
--
-- The app reads bronze and writes app, nothing else: least privilege keeps a
-- backend bug from rewriting the reference data.

GRANT USE CATALOG ON CATALOG ${catalog} TO `${app_principal}`;

GRANT USE SCHEMA ON SCHEMA ${catalog}.${bronze_schema} TO `${app_principal}`;
GRANT SELECT ON SCHEMA ${catalog}.${bronze_schema} TO `${app_principal}`;

GRANT USE SCHEMA ON SCHEMA ${catalog}.${app_schema} TO `${app_principal}`;
GRANT SELECT ON SCHEMA ${catalog}.${app_schema} TO `${app_principal}`;
GRANT MODIFY ON SCHEMA ${catalog}.${app_schema} TO `${app_principal}`;
