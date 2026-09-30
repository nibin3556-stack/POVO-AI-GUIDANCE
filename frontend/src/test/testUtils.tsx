import { StyledEngineProvider, ThemeProvider } from '@mui/material';
import { render, type RenderOptions } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { Formik } from 'formik';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { vi } from 'vitest';
import axiosInstance from '../config/axiosConfig';
import { getTheme } from '../context/theme';
import { setupStore, type AppStore, type RootState } from '../redux/store';
import type { ApiError } from '../types/api';

const theme = getTheme();

export interface MockRoute {
  method?: string;
  /** Exact URL (without /api/v1) or a regex. */
  url: string | RegExp;
  /** Response data, or a function of the request. Throw an ApiError-shaped object to fail. */
  respond: unknown | ((config: InternalAxiosRequestConfig) => unknown);
  pagination?: { page: number; limit: number; total_pages: number; total_items: number };
}

export const apiError = (status: number, message: string, data: unknown = null): ApiError => ({ status, message, data, requestId: null });

const matches = (route: MockRoute, method: string, url: string) =>
  (route.method ?? 'get').toLowerCase() === method.toLowerCase() &&
  (typeof route.url === 'string' ? url === `/api/v1${route.url}` : route.url.test(url));

/**
 * Mocks the shared axios instance (no msw, no adapter): every RTK Query call
 * goes through `axiosInstance.request`, which is answered from `routes`.
 */
export const mockApi = (routes: MockRoute[]) =>
  vi.spyOn(axiosInstance, 'request').mockImplementation(async (config) => {
    const method = config.method ?? 'get';
    const url = config.url ?? '';
    const route = routes.find((r) => matches(r, method, url));
    if (!route) throw apiError(404, `No mock for ${method} ${url}`);
    const payload = typeof route.respond === 'function' ? (route.respond as (c: unknown) => unknown)(config) : route.respond;
    const value = await payload;
    if (value && typeof value === 'object' && 'requestId' in value && 'status' in value) throw value;
    return { data: { data: value, message: '', pagination: route.pagination ?? null }, status: 200, statusText: 'OK', headers: {}, config } as never;
  });

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
  preloadedState?: Partial<RootState>;
  route?: string;
  path?: string;
}

const Theme = ({ children }: { children: ReactNode }) => (
  <StyledEngineProvider>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </StyledEngineProvider>
);

/** Renders inside Redux, the MUI theme and a memory router (route params work). */
export const renderWithProviders = (ui: ReactElement, { store, preloadedState, route = '/', path = '*', ...options }: ProviderOptions = {}) => {
  const appStore = store ?? setupStore(preloadedState);
  const router = createMemoryRouter(
    [
      { path, element: ui },
      { path: '*', element: <div data-testid="elsewhere" /> },
    ],
    { initialEntries: [route] },
  );
  const result = render(
    <Provider store={appStore}>
      <Theme>
        <RouterProvider router={router} />
      </Theme>
    </Provider>,
    options,
  );
  return { ...result, store: appStore, router };
};

/** Renders a form field inside Formik (and the theme). */
export const renderInFormik = <T extends object>(ui: ReactElement, initialValues: T, onSubmit = vi.fn()) =>
  render(
    <Theme>
      <Formik initialValues={initialValues} onSubmit={onSubmit}>
        {(formik) => (
          <form onSubmit={formik.handleSubmit}>
            {ui}
            <output data-testid="values">{JSON.stringify(formik.values)}</output>
          </form>
        )}
      </Formik>
    </Theme>,
  );

export const renderWithTheme = (ui: ReactElement) => render(<Theme>{ui}</Theme>);
