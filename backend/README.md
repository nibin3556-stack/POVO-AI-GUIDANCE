# POVO AI Guidance API (backend)

FastAPI service behind the POVO AI Guidance SPA. It owns every number on screen: KPI math, AI guidance,
charts, the Call Plan, Call Prep talking points, compliance checks on call notes and the next-call
revision. The contract is [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (§5 endpoints, §6 n8n), and the
behaviour is ported from the POC ([docs/POC_FUNCTIONAL_SPEC.md](../docs/POC_FUNCTIONAL_SPEC.md)).

## Setup

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt     # Windows (Linux/macOS: .venv/bin/python)
cp .env.example .env                                         # then edit
```

Python 3.12 or later (developed and tested on 3.14; `databricks-sql-connector==4.5.0` installs there).

## Run locally

```bash
python ../databricks/seed/generate_seed_data.py --out ../databricks/seed/output   # dummy data (once)
.venv/Scripts/python -m uvicorn main:app --port 8030 --reload
```

- `GET http://localhost:8030/health`, API docs at `/docs` (outside production).
- Without the Posit header, requests run as `DEV_FALLBACK_USERNAME` (`vturano`). Send
  `RStudio-Connect-Credentials: {"user":"<username>"}` to be someone else (the Vite proxy does this
  from `VITE_DEV_USER`).

## Tests

```bash
.venv/Scripts/python -m pytest
```

`tests/conftest.py` runs the real seed generator into a temp folder with `--as-of 2026-10-13`, points
a temp DuckDB at it, pins `POVO_TODAY_OVERRIDE=2026-10-13` and turns AI off (the n8n tests inject an
`httpx.MockTransport`). Coverage: identity, 403 and impersonation scoping, 404 for another territory or
another rep's call, the envelope, pagination cap and sort whitelist, KPI math against hand-computed
POC values, all 14 compliance rules with suppressions, score and labels, the rewrite, the revision
rules, next-call 409/422, jobs token, n8n unreachable, Guard failure and a valid AI answer.

## Local vs Databricks mode

| | `DATA_SOURCE=local` | `DATA_SOURCE=databricks` |
|---|---|---|
| Engine | DuckDB file (`LOCAL_DUCKDB_PATH`, default `backend/.localdata/povo.duckdb`) attached **as the catalog**, so the same `catalog.schema.TABLE` SQL runs | SQL Warehouse via `databricks-sql-connector` (native `:name` parameters, small connection pool) |
| Bronze | reloaded at startup from `SEED_OUTPUT_DIR/<TABLE>.csv` (typed casts; missing CSV = empty table) | `${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}` (read only) |
| App tables | created if missing, persist across restarts | `${DATABRICKS_CATALOG}.${DATABRICKS_APP_SCHEMA}` (MERGE upserts) |
| Allowed in production | no (refused at startup) | yes |

All SQL is portable (SELECT / INSERT / UPDATE / DELETE / MERGE) and filters by territory. Metrics are
computed in Python from per-territory data cached for `BRONZE_CACHE_SECONDS`.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enables the startup refusals, HSTS, no `/docs`, no dev identity |
| `DEBUG` | `false` | |
| `APP_NAME` | `POVO AI Guidance` | |
| `LOG_LEVEL` | `INFO` | log lines carry the request id; never note text or secrets |
| `CORS_ORIGINS` | `http://localhost:5175` | comma separated; not needed in production (same origin) |
| `APP_TIMEZONE` | `America/New_York` | "today" is the real date in this zone |
| `POVO_TODAY_OVERRIDE` | empty | `YYYY-MM-DD`, dev/tests only; refused in production |
| `DEV_FALLBACK_USERNAME` | `vturano` | only when `ENVIRONMENT != production` and no header |
| `POSIT_IDENTITY_HEADER` | `RStudio-Connect-Credentials` | |
| `DATA_SOURCE` | `local` | `local` or `databricks` |
| `LOCAL_DUCKDB_PATH` | `backend/.localdata/povo.duckdb` | |
| `SEED_OUTPUT_DIR` | `databricks/seed/output` | |
| `BRONZE_CACHE_SECONDS` | `600` | per-territory bronze cache and content cache |
| `DATABRICKS_HOST` | | workspace host (a pasted URL is accepted) |
| `DATABRICKS_TOKEN` | | secret |
| `DATABRICKS_WAREHOUSE_ID` | | id or `/sql/1.0/warehouses/<id>` |
| `DATABRICKS_CATALOG` | `povo_ai_guidance` | |
| `DATABRICKS_SCHEMA` | `bronze` | |
| `DATABRICKS_APP_SCHEMA` | `app` | |
| `AI_ENABLED` | `true` | `false` = deterministic POC rules only |
| `N8N_BASE_URL` | | empty = AI off |
| `N8N_CALL_PREP_PATH` | `/webhook/povo-call-prep` | |
| `N8N_COMPLIANCE_PATH` | `/webhook/povo-compliance-check` | |
| `N8N_NEXT_CALL_PATH` | `/webhook/povo-next-call` | |
| `N8N_TIMEOUT_SECONDS` | `60` | connect timeout is 5 s |
| `AI_CACHE_HOURS` | `24` | call-prep AI answers in `APP_AI_CACHE` |
| `POVO_SERVICE_TOKEN` | | `X-POVO-Service-Token` for `/api/v1/jobs/*`; required in production |

`.env` then `.env.local` are loaded from this folder (resolved from `core/config.py`, not the working
directory). Only `.env.example` is committed.

**Production refuses to start** when `DATA_SOURCE=local`, when any of `DATABRICKS_HOST` / `TOKEN` /
`WAREHOUSE_ID` is missing, when `POVO_SERVICE_TOKEN` is empty or a default, or when
`POVO_TODAY_OVERRIDE` is set.

## Layout

```
main.py                 app factory, middleware (request id, security headers, GZip, CORS), lifespan
core/                   config, identity (Posit header), request_id, security_headers, exception_handler, logging
database/               tables.py (names + column types), warehouse.py (Databricks | local DuckDB)
schema/                 request models + the response envelope
api/                    health, me, impersonation, performance, targets, accounts, call_prep, calls, compliance, jobs
helpers/                dependency (real/effective user), audit, dates, territory_data (cache), targets,
                        metrics/ (kpis, guidance, segmentation, deciles, writers),
                        content/ (library, render, select), compliance/ (engine, rewrite, service),
                        prep (profile + call prep), revision, n8n_client, listing
registry/               permissions_seed.py (REP, MANAGER)
tests/
```

The talking-point, objection and compliance content lives in
[`databricks/seed/content/`](../databricks/seed/content/README.md) (owned by this backend).

## Deploy on Posit Connect

```bash
rsconnect deploy fastapi --server <posit-url> --api-key <key> \
  --entrypoint main:app --title "POVO AI Guidance API" --python <python> .
```

- Deploy from the `backend/` folder; the entrypoint is `main:app`. Do not bundle `.env`, `.env.local`,
  `.venv` or `.localdata`.
- Use a Python version installed on the Connect server (3.12+).
- Set every variable in the content's **Vars** panel: at least `ENVIRONMENT=production`,
  `DATA_SOURCE=databricks`, the `DATABRICKS_*` values, `POVO_SERVICE_TOKEN`, `N8N_BASE_URL`, and
  `CORS_ORIGINS` (empty when the SPA is on the same host).
- Posit injects `RStudio-Connect-Credentials`; the API must only be reachable through Posit.
- Check `GET /health` after deploying. The n8n nightly workflow calls `/api/v1/jobs/refresh-guidance`
  and `/api/v1/jobs/purge-ai-cache` with the service token and an empty body.
