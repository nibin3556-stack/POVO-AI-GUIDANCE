import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { attachRequestHeaders } from '../../config/axiosConfig';
import { BRAND_HEADER, BRAND_STORAGE_KEY, FEATURES } from '../../constants/constant';
import AppShell from '../../layouts/AppShell';
import AdminPage from '../../pages/AdminPage';
import { brandSelected } from '../../redux/session/sessionSlice';
import { meRep } from '../../test/fixtures';
import { mockApi, renderWithProviders } from '../../test/testUtils';
import type { AdminBrand, AdminFeature, Me } from '../../types/models';

const twoBrands: Me = { ...meRep, is_admin: true, brands: [{ code: 'POVO', name: 'POVO' }, { code: 'OPZ', name: 'Opzelura' }] };

const brand = (code: string, name: string, enabled: number): AdminBrand => ({
  code, name, description: null, is_active: true, sort_order: 1, enabled_features: enabled, feature_count: 3, updated_at: null, updated_by: null,
});

const feature = (code: AdminFeature['code'], name: string, on: boolean, requires: AdminFeature['requires'] = null): AdminFeature => ({
  code, name, description: `${name} description`, group: 'Territory Performance', requires, is_enabled: on, updated_at: null, updated_by: null,
});

describe('brands in the shell', () => {
  it('hides the tabs of features that are off', async () => {
    mockApi([{ url: '/me', respond: { ...meRep, features: [FEATURES.PRE_CALL_TAB, FEATURES.POST_CALL_TAB] } }]);
    renderWithProviders(<AppShell />);
    expect(await screen.findByText('Pre-Call Planning')).toBeInTheDocument();
    expect(screen.queryByText('Territory Performance')).toBeNull();
  });

  it('switches brand from the header and remembers it', async () => {
    mockApi([{ url: '/me', respond: twoBrands }]);
    const { store } = renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('combobox', { name: 'Select brand' }));
    expect(document.title).toBe('POVO Pulse');
    await userEvent.click(within(screen.getByRole('listbox')).getByText('Opzelura'));
    expect(store.getState().session.brandCode).toBe('OPZ');
    expect(localStorage.getItem(BRAND_STORAGE_KEY)).toBe('OPZ');
    const config = attachRequestHeaders({ headers: new AxiosHeaders() } as InternalAxiosRequestConfig);
    expect(config.headers.get(BRAND_HEADER)).toBe('OPZ');
    store.dispatch(brandSelected(null));
    expect(localStorage.getItem(BRAND_STORAGE_KEY)).toBeNull();
  });

  it('shows the configure link to admins only', async () => {
    mockApi([{ url: '/me', respond: twoBrands }]);
    renderWithProviders(<AppShell />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menuitem', { name: /Configure brand features/ })).toBeInTheDocument();
  });
});

describe('admin page', () => {
  it('tells a non-admin they cannot configure', async () => {
    mockApi([{ url: '/admin/me', respond: { username: 'mcastellano', is_admin: false } }]);
    renderWithProviders(<AdminPage />);
    expect(await screen.findByText(/Only admin users can configure brands and features/)).toBeInTheDocument();
  });

  it('opens the add brand form and creates a brand', async () => {
    const sent: unknown[] = [];
    mockApi([
      { url: '/admin/me', respond: { username: 'vturano', is_admin: true } },
      { url: '/admin/brands', respond: [brand('POVO', 'POVO', 2)] },
      { url: /\/admin\/brands\/\w+\/features$/, respond: { brand: brand('POVO', 'POVO', 2), features: [] } },
      {
        method: 'post',
        url: '/admin/brands',
        respond: (c: InternalAxiosRequestConfig) => {
          sent.push(c.data);
          return brand('OPZ', 'Opzelura', 0);
        },
      },
    ]);
    renderWithProviders(<AdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Add brand' }));
    const form = screen.getByRole('form', { name: 'New brand' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Brand code' }), 'OPZ');
    await userEvent.type(within(form).getByRole('textbox', { name: 'Brand name' }), 'Opzelura');
    await userEvent.click(within(form).getByRole('button', { name: 'Create brand' }));
    await waitFor(() => expect(sent).toEqual([{ brand_code: 'OPZ', brand_name: 'Opzelura', is_active: true }]));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'New brand' })).toBeNull());
  });

  it('undoes changes one step at a time', async () => {
    const sent: unknown[] = [];
    mockApi([
      { url: '/admin/me', respond: { username: 'vturano', is_admin: true } },
      { url: '/admin/brands', respond: [brand('OPZ', 'Opzelura', 1)] },
      {
        url: /\/admin\/brands\/OPZ\/features$/,
        respond: {
          brand: brand('OPZ', 'Opzelura', 1),
          features: [feature('PERFORMANCE_TAB', 'Territory Performance', true), feature('AI_GUIDANCE', 'AI guidance', false, 'PERFORMANCE_TAB')],
        },
      },
      { method: 'put', url: /\/admin\/brands\/OPZ\/features$/, respond: (c: InternalAxiosRequestConfig) => sent.push(c.data) },
    ]);
    renderWithProviders(<AdminPage />);
    const editor = await screen.findByTestId('feature-editor');
    const undo = within(editor).getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    const perf = within(editor).getByRole('switch', { name: 'Territory Performance' });
    const ai = within(editor).getByRole('switch', { name: 'AI guidance' });
    await userEvent.click(perf);
    await userEvent.click(within(editor).getByRole('button', { name: 'Turn all on' }));
    expect(within(editor).getByText('Last change: Turn all on')).toBeInTheDocument();
    expect(perf).toHaveAttribute('aria-checked', 'true');
    expect(ai).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(undo);
    expect(within(editor).getByText('Last change: Turned off Territory Performance')).toBeInTheDocument();
    expect(perf).toHaveAttribute('aria-checked', 'false');
    expect(ai).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(perf).toHaveAttribute('aria-checked', 'true');
    expect(undo).toBeDisabled();
    // Back to what the server has: nothing to save.
    await new Promise((r) => setTimeout(r, 1000));
    expect(sent).toEqual([]);
  });

  it('autosaves only the switches that changed', async () => {
    const sent: unknown[] = [];
    mockApi([
      { url: '/admin/me', respond: { username: 'vturano', is_admin: true } },
      { url: '/admin/brands', respond: [brand('POVO', 'POVO', 2), brand('OPZ', 'Opzelura', 0)] },
      {
        url: /\/admin\/brands\/OPZ\/features$/,
        respond: {
          brand: brand('OPZ', 'Opzelura', 0),
          features: [feature('PERFORMANCE_TAB', 'Territory Performance', false), feature('AI_GUIDANCE', 'AI guidance', false, 'PERFORMANCE_TAB')],
        },
      },
      {
        url: /\/admin\/brands\/POVO\/features$/,
        respond: { brand: brand('POVO', 'POVO', 2), features: [feature('PERFORMANCE_TAB', 'Territory Performance', true)] },
      },
      {
        method: 'put',
        url: /\/admin\/brands\/OPZ\/features$/,
        respond: (c: InternalAxiosRequestConfig) => {
          sent.push(c.data);
          return { brand: brand('OPZ', 'Opzelura', 1), features: [] };
        },
      },
    ]);
    renderWithProviders(<AdminPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Opzelura/ }));
    const editor = await screen.findByTestId('feature-editor');
    expect(within(editor).getByText('Needs Territory Performance')).toBeInTheDocument();
    await userEvent.click(within(editor).getByRole('switch', { name: 'AI guidance' }));
    expect(within(editor).getByRole('switch', { name: 'AI guidance' })).toHaveAttribute('aria-checked', 'true');
    expect(within(editor).getByText('Saving…')).toBeInTheDocument();
    expect(within(editor).queryByRole('button', { name: 'Save' })).toBeNull();
    await waitFor(() => expect(sent).toEqual([{ features: { AI_GUIDANCE: true } }]), { timeout: 3000 });
  });
});
