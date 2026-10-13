export const APP_NAME = 'POVO Pulse';

/**
 * Backend base URL. Empty means same origin: the Vite dev proxy locally, or a
 * backend content item on the same Posit host:port in production. A trailing
 * slash on the pasted URL is dropped so paths never start with "//".
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
export const API_PREFIX = '/api/v1';

export const REQUEST_ID_HEADER = 'X-Request-ID';
export const IMPERSONATE_HEADER = 'X-Impersonate-Employee-Id';
export const IMPERSONATION_STORAGE_KEY = 'povo.impersonation';
/** The selected brand travels on every request; the server checks the user may use it. */
export const BRAND_HEADER = 'X-Brand-Code';
/** localStorage: the brand is remembered across tabs and visits (a per-viewer convenience). */
export const BRAND_STORAGE_KEY = 'povo.brand';

/** Window events raised by the axios interceptor for the shell. */
export const FORBIDDEN_EVENT = 'povo:forbidden';

export const PERMISSIONS = {
  VIEW: 'guidance.view',
  ASSESS: 'call.assess',
  IMPERSONATE: 'user.impersonate',
} as const;

/** Brand features (backend registry/features.py). /me lists the ones on for the selected brand. */
export const FEATURES = {
  PERFORMANCE_TAB: 'PERFORMANCE_TAB',
  PERFORMANCE_KPIS: 'PERFORMANCE_KPIS',
  AI_GUIDANCE: 'AI_GUIDANCE',
  SEGMENTATION: 'SEGMENTATION',
  DECILES: 'DECILES',
  NEW_WRITERS: 'NEW_WRITERS',
  PRE_CALL_TAB: 'PRE_CALL_TAB',
  MUST_WINS: 'MUST_WINS',
  AI_CALL_PREP: 'AI_CALL_PREP',
  POST_CALL_TAB: 'POST_CALL_TAB',
  COMPLIANCE_CHECK: 'COMPLIANCE_CHECK',
  EXAMPLE_NOTES: 'EXAMPLE_NOTES',
  VOICE_NOTES: 'VOICE_NOTES',
  AI_NEXT_CALL: 'AI_NEXT_CALL',
} as const;

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES];

export const TARGETS_PAGE_SIZE = 10;
export const DEFAULT_TARGET_SORT = 'hs_patients:desc';
export const EMPLOYEE_SEARCH_LIMIT = 8;
export const EMPLOYEE_SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;

export const ADDITIONAL_POINT_ID = 'additional';

/** Timings reproduced from the POC. */
export const TIMING = {
  AUTOSAVE_DEBOUNCE_MS: 800,
  COMPLIANCE_MIN_SPINNER_MS: 600,
  COMPLIANCE_STEP_MS: 340,
  COMPLIANCE_REPORT_DELAY_MS: 260,
  AI_STEP_MS: 560,
  AI_BOX_FADE_DELAY_MS: 300,
  AI_BOX_REMOVE_MS: 200,
  AI_POINT_MS: 420,
  AI_DONE_DELAY_MS: 400,
  SCROLL_DELAY_MS: 120,
  LOOKUP_MIN_MS: 350,
  /** Wait for the reception slider to settle before asking the AI for new example notes. */
  EXAMPLE_NOTES_DEBOUNCE_MS: 500,
} as const;

export const ROUTES = {
  PERFORMANCE: '/performance',
  PRE_CALL: '/pre-call',
  POST_CALL: '/post-call',
  ADMIN: '/admin',
} as const;

export const preCallPath = (hcpId?: string | null): string =>
  hcpId ? `${ROUTES.PRE_CALL}/${encodeURIComponent(hcpId)}` : ROUTES.PRE_CALL;

export const postCallPath = (hcpId: string): string => `${ROUTES.POST_CALL}/${encodeURIComponent(hcpId)}`;
