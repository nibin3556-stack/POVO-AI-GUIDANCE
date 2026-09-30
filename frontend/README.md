# POVO – AI Guidance: frontend

React 19 + TypeScript SPA for the POVO field-sales guidance tool. The visual and behavioural reference is the finalized POC at the repo root (`POVO_AI_Guidance_Step3_37.html`). Contracts and architecture are in `../docs/ARCHITECTURE.md` and `../docs/POC_FUNCTIONAL_SPEC.md`.

## Stack

- React 19, Vite 8, TypeScript 6 (strict, `noUncheckedIndexedAccess`)
- MUI 7 for components and the theme (`src/context/theme.ts`); Tailwind CSS 4 (`@tailwindcss/vite`) for layout and spacing. MUI styles sit in the `mui` CSS layer (`StyledEngineProvider enableCssLayer`) so Tailwind utilities win.
- Redux Toolkit + RTK Query over one shared axios instance (`src/config/axiosConfig.ts` → `src/redux/api/axiosBaseQuery.ts`)
- React Router 8 (hash router, lazy pages), Formik + Yup, recharts 3, react-hot-toast, dayjs
- Self-hosted fonts: `@fontsource-variable/heebo` and `material-symbols` (Rounded). The Posit VM cannot reach Google Fonts.
- Tests: Vitest 4 + jsdom + React Testing Library. API calls are mocked by spying on the shared axios instance (`src/test/testUtils.tsx`), not with msw.

## Setup

Node 24 and npm 11.

```bash
cd frontend
npm install
cp .env.example .env.local   # optional
```

| Variable | Dev | Production |
|---|---|---|
| `VITE_API_URL` | empty: requests stay same-origin and go through the Vite proxy | the backend content URL on Posit (build time) |
| `VITE_DEV_USER` | username the proxy injects as the Posit identity (default `vturano`; use `bdrake` for a manager) | not used |

## Scripts

```bash
npm run dev       # http://localhost:5175, proxies /api and /health to http://127.0.0.1:8030
npm run lint      # ESLint 10 flat config, zero warnings allowed
npx tsc -b        # type check
npm test          # Vitest (run once)
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve dist/ on 5175
```

The dev proxy injects `RStudio-Connect-Credentials: {"user": "<VITE_DEV_USER>"}` on every proxied request, which is what Posit Connect does in production. There is no login page and no token.

## How it talks to the backend

- Every request carries `X-Request-ID` (`crypto.randomUUID()`) and, while impersonating, `X-Impersonate-Employee-Id` (read live from the `session` slice, persisted to `sessionStorage`).
- The response interceptor unwraps the Mosaic envelope `{data, status, message, page, limit, total_pages, total_items}`; paginated endpoints return `{items, page, limit, total_pages, total_items}` to components. Errors are normalised to `ApiError {status, message, data, requestId}`; a 403 also raises a `povo:forbidden` window event (toast).
- Starting or ending impersonation resets the whole RTK Query cache and the call session (store listener).
- Tags: next-call invalidates `Call`, `CallPrep`, `Profile` (and target lists); an autosave invalidates only its own `Call`.

## Folders (`src/`)

```
config/axiosConfig.ts     interceptors, envelope unwrap, error normalisation
constants/                constant.ts, labels.ts (every UI string), colors.ts (spec tokens)
context/theme.ts          MUI theme mirroring the POC tokens
styles/index.css          Tailwind 4, @theme tokens, animations, height variants (short:/tall:)
redux/                    store, hooks, api/ (one file per module), session/, callSession/
types/                    api.ts, models.ts (the §5 contract)
hooks/                    useTimeline, useAiReveal, useComplianceCheck, useAutoSaveAssessment, …
schemas/                  Yup schemas (impersonation lookup, assessment)
components/common|forms|charts   reusable building blocks (all tested)
layouts/                  AppShell, Header, AccountMenu, ImpersonationBar, TabBar
features/                 impersonation, performance, preCall (+ CallPrep), postCall
pages/ routes/ utils/ test/
```

Routes: `#/performance`, `#/pre-call`, `#/pre-call/:hcpId`, `#/post-call/:hcpId`. The selected target and its meeting participants live in the `callSession` slice, so switching tabs keeps them.

## Deploying to Posit Connect (static content)

1. Build against the deployed API: `VITE_API_URL=https://<posit-host>/content/<backend-guid> npm run build`.
2. `vite.config.ts` uses `base: './'`, so the bundle works under `/content/<guid>/`; hash routing keeps the document path fixed.
3. Publish `dist/` as static content, for example `rsconnect deploy html --server <posit> --api-key <key> dist/` (or upload the folder in the Connect UI), behind the same Okta SSO as the API. When both items share host and port no CORS is needed; otherwise add the frontend origin to the backend `CORS_ORIGINS`.
4. The material-symbols Rounded font is large (≈5 MB) but served once and cached.
