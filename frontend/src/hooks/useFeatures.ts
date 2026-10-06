import { useMemo } from 'react';
import { FEATURES, ROUTES, type FeatureCode } from '../constants/constant';
import { sessionApi } from '../redux/api/sessionApi';

export interface Features {
  has: (code: FeatureCode) => boolean;
  /** The first tab the brand has on, or null when it has none (the shell shows a message). */
  homeRoute: string | null;
}

/**
 * The selected brand's features, read from the cached GET /me (the shell fetches it and
 * renders nothing before /me answers, so inside the app /me is always there;
 * a component rendered on its own, without /me, sees every feature). The
 * server enforces the same list, so hiding is a convenience, never the only guard.
 */
export const useFeatures = (): Features => {
  // Cache only: components never fetch /me themselves.
  const { data: me } = sessionApi.endpoints.getMe.useQueryState();
  return useMemo(() => {
    const on = me ? new Set<FeatureCode>(me.features) : null;
    const has = (code: FeatureCode) => on === null || on.has(code);
    const homeRoute = has(FEATURES.PERFORMANCE_TAB) ? ROUTES.PERFORMANCE : has(FEATURES.PRE_CALL_TAB) ? ROUTES.PRE_CALL : null;
    return { has, homeRoute };
  }, [me]);
};
