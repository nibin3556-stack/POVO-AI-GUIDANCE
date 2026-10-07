# POVO – AI Guidance

A field-sales guidance app for POVO (HS) reps. It has three steps:

1. **Territory Performance**: goals, segmentation and AI guidance.
2. **Pre-Call Planning**: Must-Wins, the call plan, and AI call prep.
3. **Post-Call Assessment**: ratings, an AI compliance check on notes, and AI next-call suggestions.

It was built from the POC [POVO_AI_Guidance_Step3_37.html](POVO_AI_Guidance_Step3_37.html) and updated to v2, [POVO_AI_Guidance_Step3_63_Alt 2.html](POVO_AI_Guidance_Step3_63_Alt%202.html). Both stay at the repo root as the reference.

| Path | What it is |
|---|---|
| [frontend/](frontend/) | React 19 + TypeScript + Vite 8, MUI 7, Tailwind 4, Redux Toolkit / RTK Query, Formik + Yup, recharts. Dev port **5175**. |
| [backend/](backend/) | FastAPI (Python 3.14). Owns every number, enforces identity, impersonation and territory scope, calls n8n, and writes to Delta. Dev port **8030**. |
| [n8n/](n8n/) | Three Azure OpenAI webhook workflows (call prep, compliance, next call) and a nightly guidance refresh. |
| [databricks/](databricks/) | DDL (`bronze` read-only, `app` writable), a deterministic dummy-data generator (8 territories), and deploy/load/check scripts. |
| [docs/](docs/) | [ARCHITECTURE.md](docs/ARCHITECTURE.md) (the contracts), [POC_FUNCTIONAL_SPEC.md](docs/POC_FUNCTIONAL_SPEC.md), [DEPLOYMENT.md](docs/DEPLOYMENT.md) (Posit Connect on the Windows VM) |

## Run locally (no Databricks needed)

```powershell
# 1. Dummy data
python databricks/seed/generate_seed_data.py

# 2. Backend (DATA_SOURCE=local uses DuckDB over the generated CSVs)
cd backend
python -m venv .venv; .venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m uvicorn main:app --port 8030

# 3. Frontend
cd ..\frontend
npm install
copy .env.example .env
npm run dev        # http://localhost:5175, signed in as VITE_DEV_USER (default vturano)

# 4. Optional: n8n for the AI features. Without it, the app falls back to the rules.
cd ..
copy .env.example .env   # set POVO_SERVICE_TOKEN
docker compose up -d     # http://localhost:5680, then import the n8n/ workflows
```

**Dev users:**

- `vturano` is the Portland rep.
- `bdrake` is a manager and can impersonate other users (impersonation is for the admin users in `backend/config/admin_users.json` only).

To switch user, change `VITE_DEV_USER` and restart `npm run dev`.

After changing the generator or the content JSON, refresh a SQLite dev database with `python databricks/seed/generate_seed_data.py` then `backend\.venv\Scripts\python backend\scripts\load_sqlite_bronze.py` (stop the backend first).

**Voice notes** use the browser's speech recognition (Microsoft Edge or Google Chrome). Other browsers show the microphone disabled with an explanation; typed and example notes always work.

## Tests

```powershell
backend\.venv\Scripts\python -m pytest backend
databricks\.venv\Scripts\python -m pytest databricks/tests
cd frontend; npm run lint; npm test; npm run build
node n8n/tools/validate-workflows.js
```

## Not built yet (waiting on client confirmation)

- The OCE "Call Prep Review Completed" gate.
- Adverse-event alerts to Pharmacovigilance.
- A manager roll-up view.
- The final Databricks catalog name. It is configurable; the default is `povo_ai_guidance`.
