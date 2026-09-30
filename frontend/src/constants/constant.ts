export const APP_NAME = 'POVO – AI Guidance';

/**
 * Backend base URL. Empty means same origin: the Vite dev proxy locally, or a
 * backend content item on the same Posit host:port in production.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? '';
export const API_PREFIX = '/api/v1';

export const REQUEST_ID_HEADER = 'X-Request-ID';
export const IMPERSONATE_HEADER = 'X-Impersonate-Employee-Id';
export const IMPERSONATION_STORAGE_KEY = 'povo.impersonation';

/** Window events raised by the axios interceptor for the shell. */
export const FORBIDDEN_EVENT = 'povo:forbidden';

export const PERMISSIONS = {
  VIEW: 'guidance.view',
  ASSESS: 'call.assess',
  IMPERSONATE: 'user.impersonate',
} as const;

export const TARGETS_PAGE_SIZE = 10;
export const ACCOUNTS_PAGE_SIZE = 200;
export const DEFAULT_TARGET_SORT = 'hs_patients:desc';
export const EMPLOYEE_SEARCH_LIMIT = 8;
export const EMPLOYEE_SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 250;

/** Talking points shown per category (the spec: top 3 only). */
export const POINTS_PER_CATEGORY = 3;
export const NOTE_MAX_LENGTH = 200;
export const ADDITIONAL_NOTE_MAX_LENGTH = 600;
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
  NEXT_CALL_STEP_MS: 800,
  NEXT_CALL_FINISH_MS: 350,
  SCROLL_DELAY_MS: 120,
  LOOKUP_MIN_MS: 350,
} as const;

export const CATEGORIES = ['messaging', 'objection', 'closing'] as const;

export const INTERACTION_CHANNELS = ['rep', 'adfa', 'opz', 'msl', 'spkr', 'pr'] as const;

export const ROUTES = {
  PERFORMANCE: '/performance',
  PRE_CALL: '/pre-call',
  POST_CALL: '/post-call',
} as const;

export const preCallPath = (hcpId?: string | null): string =>
  hcpId ? `${ROUTES.PRE_CALL}/${encodeURIComponent(hcpId)}` : ROUTES.PRE_CALL;

export const postCallPath = (hcpId: string): string => `${ROUTES.POST_CALL}/${encodeURIComponent(hcpId)}`;
