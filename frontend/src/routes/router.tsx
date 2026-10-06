import type { ComponentType } from 'react';
import { Navigate, createHashRouter, type RouteObject } from 'react-router';
import { FEATURES, ROUTES, type FeatureCode } from '../constants/constant';
import AppShell from '../layouts/AppShell';
import FeatureGate from './FeatureGate';

/** Pages are code-split: each route loads its page on first visit, behind its brand feature. */
const lazyPage = (load: () => Promise<{ default: ComponentType }>, feature?: FeatureCode) => async () => {
  const Page = (await load()).default;
  if (!feature) return { Component: Page };
  const Gated = () => (
    <FeatureGate feature={feature}>
      <Page />
    </FeatureGate>
  );
  return { Component: Gated };
};

/** Tabs map to routes (hash router: Posit serves the SPA from a fixed document path). */
export const routes: RouteObject[] = [
  // Outside the shell: an admin may configure a brand they are not an employee of.
  { path: ROUTES.ADMIN, lazy: lazyPage(() => import('../pages/AdminPage')) },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <FeatureGate /> },
      { path: 'performance', lazy: lazyPage(() => import('../pages/PerformancePage'), FEATURES.PERFORMANCE_TAB) },
      { path: 'pre-call', lazy: lazyPage(() => import('../pages/PreCallPage'), FEATURES.PRE_CALL_TAB) },
      { path: 'pre-call/:hcpId', lazy: lazyPage(() => import('../pages/PreCallPage'), FEATURES.PRE_CALL_TAB) },
      { path: 'post-call/:hcpId', lazy: lazyPage(() => import('../pages/PostCallPage'), FEATURES.POST_CALL_TAB) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];

export const createAppRouter = () => createHashRouter(routes);
