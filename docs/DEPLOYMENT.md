# Deploying POVO – AI Guidance to the Windows VM (Posit Connect)

The app runs as **two Posit Connect content items** on the same host: the FastAPI backend and the static React site. Both sit behind Okta SSO. n8n runs in Docker, and the data lives in Databricks.

Deploy in this order: Databricks, then n8n, then the backend, then the frontend.

## 0. Prerequisites

- Python 3.14 and Node 24 on the build machine.
- `rsconnect-python` (`pip install rsconnect-python`), plus a Posit Connect API key registered with `rsconnect add --server https://azu-dapcommr01.ds.incyte.com:3939 --name vm --api-key <key>`.
- A Databricks SQL Warehouse, plus a service principal or PAT for the app. That principal needs:
  - `USE CATALOG` on the catalog,
  - `SELECT` on the `bronze` schema,
  - `SELECT` and `MODIFY` on the `app` schema.
- An n8n instance that can reach the backend URL, with an **Azure OpenAI** credential.

## 1. Databricks

The catalog name is not final. Set `DATABRICKS_CATALOG` everywhere and nothing else changes.

```powershell
python -m venv databricks\.venv
databricks\.venv\Scripts\python -m pip install -r databricks\requirements.txt

# Connection details come from environment variables or backend\.env:
# DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID, DATABRICKS_CATALOG, DATABRICKS_SCHEMA, DATABRICKS_APP_SCHEMA
databricks\.venv\Scripts\python databricks\scripts\deploy_schema.py --dry-run      # review the SQL
databricks\.venv\Scripts\python databricks\scripts\deploy_schema.py                # add --skip-catalog if admins pre-create the catalog
databricks\.venv\Scripts\python databricks\seed\generate_seed_data.py              # dummy data as of today
databricks\.venv\Scripts\python databricks\scripts\load_seed_data.py               # bronze tables only; takes a few minutes
databricks\.venv\Scripts\python databricks\scripts\check_databricks.py --write-test
```

To grant permissions, either run `deploy_schema.py --with-grants --app-principal <principal>` or ask the workspace admin to run `databricks/ddl/03_grants.sql`.

**Re-seeding.** The dummy data stops at the `--as-of` date, and the app uses the real current date. Regenerate and reload the bronze tables whenever you need fresh-looking data. Re-seeding never touches the `app` tables.

## 2. n8n

1. On the n8n host, set the environment variables `POVO_BACKEND_URL` (the backend content URL) and `POVO_SERVICE_TOKEN` (the same value as the backend's), and set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
2. Import the four workflows. Either use the UI (**Import from file**) or run:
   ```
   node n8n/tools/deploy-to-n8n.js
   ```
   The script reads the n8n URL from `N8N_URL` and the API key from `N8N_API_KEY`.
3. Attach the "Azure OpenAI account" credential to the three LLM nodes. The deployment is `gpt-4.1`; change it if your Azure resource uses a different name.
4. Activate the workflows.
5. Smoke-test with `n8n/tools/test-webhooks.ps1`.

See [n8n/README.md](../n8n/README.md) for details.

The backend works **without n8n**: if the webhooks fail, every AI feature falls back to the deterministic POC rules. Set `AI_ENABLED=false` to turn the AI off on purpose.

## 3. Backend (Posit Connect FastAPI content)

```powershell
cd backend
rsconnect deploy fastapi --server vm --entrypoint main:app --title "POVO AI Guidance API" .
```

In Posit, go to **Content → Vars** and set:

| Variable | VM value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATA_SOURCE` | `databricks` |
| `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `DATABRICKS_WAREHOUSE_ID` | the app principal's values |
| `DATABRICKS_CATALOG` / `DATABRICKS_SCHEMA` / `DATABRICKS_APP_SCHEMA` | e.g. `povo_ai_guidance` / `bronze` / `app` |
| `AI_ENABLED` | `true` |
| `N8N_BASE_URL` | e.g. `http://10.234.1.4:5678` |
| `POVO_SERVICE_TOKEN` | a long random secret, the same value as in n8n |
| `APP_TIMEZONE` | `America/New_York` |

- The backend **refuses to start** in production if it has local data mode, missing Databricks settings, a default service token, or `IDENTITY_SOURCE=app`.
- Identity comes from the `RStudio-Connect-Credentials` header that Posit injects after the Okta sign-in. Set `IDENTITY_SOURCE=trinity`: the user (`p250048@incyte.com` → `p250048`) must be an active, non-terminated `EMP_USER_ID` in `bis_prod.bronze_trinity.DIM_EMPLOYEE`, and their territory comes from `DIM_SALES_FORCE_CURR` (see ARCHITECTURE.md §3). The Databricks token needs `SELECT` on those two tables.
- Set `TRINITY_BRAND_TEAMS` to the sales-force team(s) that sell each brand: `POVO:POVO` (TEAM_ID 33 in `DIM_SALES_FORCE_CURR`). Left blank, every team counts as `DEFAULT_BRAND_CODE`.
- Put network ids (not first-initial usernames) in `backend/config/admin_users.json`.
- Set the content's access to the POVO sales group, and give n8n access to the jobs endpoints: either allow the n8n host, or run the jobs through an API key per your Posit policy.
- To verify, open `<backend content URL>/health`.

## 4. Frontend (Posit Connect static content)

```powershell
cd frontend
npm ci
$env:VITE_API_URL = "https://azu-dapcommr01.ds.incyte.com:3939/content/<backend-guid>"
npm run build
rsconnect deploy html --server vm --title "POVO AI Guidance" dist
```

- `vite.config.ts` uses `base: './'`, so the site works under `/content/<guid>/`.
- The frontend and backend are on the same host and port, so they share an origin: no CORS is needed, and Posit passes the identity to both.
- Fonts are bundled with the build, so the VM needs no internet access.

## 5. Post-deploy check

1. Open the site as a rep. The header should show your name and territory, and the three tabs should load.
2. Open it as a manager, choose **Impersonate user**, and search for a rep. Every figure should switch to that rep's data.
3. Walk through Pre-Call → Post-Call:
   - Enter a note with an off-label phrase; it should be flagged.
   - Choose **Use Suggestion**; the flag should clear.
   - Choose **AI Suggestions for Next Call**; the revised call prep should show tags and a banner.
4. Check `app.APP_CALL`, `APP_CALL_POINT_ASSESSMENT`, `APP_COMPLIANCE_CHECK`, `APP_CALL_PREP_REVISION` and `APP_AUDIT_LOG` for the new rows.
5. Run the "Nightly Guidance Refresh" workflow manually and check `APP_TERRITORY_GUIDANCE_SNAPSHOT`.
