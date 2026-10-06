import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IMPERSONATE_HEADER, IMPERSONATION_STORAGE_KEY } from '../../constants/constant';
import AppShell from '../../layouts/AppShell';
import { dana, meManager, meRep } from '../../test/fixtures';
import { apiError, mockApi, renderWithProviders } from '../../test/testUtils';
import axiosInstance from '../../config/axiosConfig';
import { attachRequestHeaders } from '../../config/axiosConfig';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const managerRoutes = [
  { url: '/me', respond: meManager },
  { url: '/employees/search', respond: (c: InternalAxiosRequestConfig) => ((c.params as { q: string }).q.toLowerCase().startsWith('dan') ? [dana] : []) },
  { method: 'post', url: '/impersonation', respond: dana },
  { method: 'delete', url: '/impersonation', respond: null },
];

describe('shell and impersonation', () => {
  it('shows the header with the real date and hides impersonation from reps', async () => {
    mockApi([{ url: '/me', respond: meRep }]);
    renderWithProviders(<AppShell />);
    expect(await screen.findByText('October 13, 2026')).toBeInTheDocument();
    expect(screen.getByText('POVO Sales Representative · Portland, ME territory · Northeast')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.queryByRole('menuitem', { name: /Impersonate user/ })).toBeNull();
    expect(screen.getByText('Post-Call Assessment')).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the not-set-up message on 403', async () => {
    mockApi([{ url: '/me', respond: apiError(403, 'Your account is not set up for POVO AI Guidance') }]);
    renderWithProviders(<AppShell />);
    expect(await screen.findByText('Your account is not set up for POVO AI Guidance')).toBeInTheDocument();
  });

  it('a manager looks up a rep and views the app as them', async () => {
    const spy = mockApi(managerRoutes);
    const { store } = renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Impersonate user/ }));
    await userEvent.type(screen.getByLabelText('Rep name, employee ID or network ID'), 'Dana');
    await userEvent.click(await screen.findByRole('option', { name: /Dana Whitaker/ }));
    await waitFor(() => expect(store.getState().session.impersonation).toEqual({ employeeId: 'p250611', name: 'Dana Whitaker' }));
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toContain('p250611');
    expect(spy.mock.calls.some(([c]) => c.method?.toLowerCase() === 'post' && c.url === '/api/v1/impersonation')).toBe(true);
    const next = attachRequestHeaders({ headers: new AxiosHeaders() } as InternalAxiosRequestConfig);
    expect(next.headers.get(IMPERSONATE_HEADER)).toBe('p250611');
    expect(axiosInstance).toBeDefined();
  });

  it('lists recently viewed reps, picks switch straight away, and no toast is shown', async () => {
    localStorage.setItem('povo.impersonation.recent.' + meManager.signed_in.employee_id, JSON.stringify([dana]));
    mockApi(managerRoutes);
    const { store } = renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Impersonate user/ }));
    expect(screen.getByText('Recent')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: /Dana Whitaker/ }));
    await waitFor(() => expect(store.getState().session.impersonation).toEqual({ employeeId: 'p250611', name: 'Dana Whitaker' }));
    expect(screen.queryByText(/Now viewing as/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    localStorage.clear();
  });

  it('a single Look up match switches directly and is remembered as recent', async () => {
    localStorage.clear();
    mockApi(managerRoutes);
    const { store } = renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Impersonate user/ }));
    expect(screen.queryByText('Recent')).toBeNull();
    await userEvent.type(screen.getByLabelText('Rep name, employee ID or network ID'), 'Dana');
    await userEvent.click(screen.getByRole('button', { name: /Look up/ }));
    await waitFor(() => expect(store.getState().session.impersonation?.employeeId).toBe('p250611'));
    expect(localStorage.getItem('povo.impersonation.recent.' + meManager.signed_in.employee_id)).toContain('p250611');
    localStorage.clear();
  });

  it('Look up with no match shows the error message', async () => {
    mockApi(managerRoutes);
    renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Impersonate user/ }));
    await userEvent.type(screen.getByLabelText('Rep name, employee ID or network ID'), 'zz9');
    await userEvent.click(screen.getByRole('button', { name: /Look up/ }));
    expect(await screen.findByText('No employee found for “zz9”. Check the name, Employee ID or Network ID and try again')).toBeInTheDocument();
  });

  it('the impersonation bar exits', async () => {
    const viewing = { ...meManager, effective: dana, is_impersonating: true };
    const spy = mockApi([{ url: '/me', respond: viewing }, ...managerRoutes.slice(1)]);
    const { store } = renderWithProviders(<AppShell />, { preloadedState: { session: { impersonation: { employeeId: 'p250611', name: 'Dana Whitaker' }, brandCode: null } } });
    expect(await screen.findByText(/Every figure on this page is theirs/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Exit impersonation/ })[0]!);
    await waitFor(() => expect(store.getState().session.impersonation).toBeNull());
    expect(spy.mock.calls.some(([c]) => c.method?.toLowerCase() === 'delete')).toBe(true);
  });
});
