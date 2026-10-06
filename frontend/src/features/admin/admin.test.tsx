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
    expect(await screen.findByText('POVO – AI Guidance')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Select brand' }));
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

  it('saves only the switches that changed', async () => {
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
    expect(within(editor).getByText('1 unsaved change')).toBeInTheDocument();
    await userEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ features: { AI_GUIDANCE: true } }]));
  });
});
