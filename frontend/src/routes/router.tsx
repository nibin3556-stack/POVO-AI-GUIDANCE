import type { ComponentType } from 'react';
import { Navigate, createHashRouter, type RouteObject } from 'react-router';
import { ROUTES } from '../constants/constant';
import AppShell from '../layouts/AppShell';

/** Pages are code-split: each route loads its page on first visit. */
const lazyPage = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

/** Tabs map to routes (hash router: Posit serves the SPA from a fixed document path). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.PERFORMANCE} replace /> },
      { path: 'performance', lazy: lazyPage(() => import('../pages/PerformancePage')) },
      { path: 'pre-call', lazy: lazyPage(() => import('../pages/PreCallPage')) },
      { path: 'pre-call/:hcpId', lazy: lazyPage(() => import('../pages/PreCallPage')) },
      { path: 'post-call/:hcpId', lazy: lazyPage(() => import('../pages/PostCallPage')) },
      { path: '*', element: <Navigate to={ROUTES.PERFORMANCE} replace /> },
    ],
  },
];

export const createAppRouter = () => createHashRouter(routes);
