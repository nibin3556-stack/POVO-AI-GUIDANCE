import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PerformancePage from '../../pages/PerformancePage';
import { deciles, guidance, kpis, newWriters, segmentation } from '../../test/fixtures';
import { apiError, mockApi, renderWithProviders } from '../../test/testUtils';

const routes = [
  { url: '/performance/kpis', respond: kpis },
  { url: '/performance/guidance', respond: guidance },
  { url: '/performance/segmentation', respond: segmentation },
  { url: '/performance/deciles', respond: deciles },
  { url: '/performance/new-writers', respond: newWriters },
];

describe('Territory Performance', () => {
  it('shows the KPI cards, AI guidance and chart captions', async () => {
    mockApi(routes);
    renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    expect(await screen.findByText('Patient Enrollment Forms')).toBeInTheDocument();
    expect(screen.getAllByText('(October)')).toHaveLength(3);
    expect(screen.getByText('On Track')).toBeInTheDocument();
    expect(screen.getAllByText('At Risk')).toHaveLength(2);
    expect(await screen.findByText('Dr. Boland')).toBeInTheDocument();
    expect(screen.getByText('3 Super High')).toBeInTheDocument();
    expect(await screen.findByText('▼ 98 of 142 POVO Targets yet to write POVO')).toBeInTheDocument();
    await screen.findByText(/Super High HCP/);
    expect(document.body).toHaveTextContent('▼ 2 of 12 Super High HCPs yet to write POVO');
    expect(await screen.findByText('44 new POVO writers · Jan–Oct 2026')).toBeInTheDocument();
  });

  it('reloads KPIs for another period', async () => {
    const spy = mockApi(routes);
    renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    await screen.findByText('Patient Enrollment Forms');
    await userEvent.click(screen.getByRole('button', { name: 'Year to Date' }));
    expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/performance/kpis' && (c.params as { period: string }).period === 'ytd')).toBe(true);
  });

  it('a recommended focus target opens Pre-Call Planning', async () => {
    mockApi(routes);
    const { store, router } = renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    const focus = await screen.findByText('Recommended focus');
    await userEvent.click(within(focus.parentElement as HTMLElement).getByRole('button', { name: /Dr. Winters/ }));
    expect(router.state.location.pathname).toBe('/pre-call/H2');
    expect(store.getState().callSession.selectedHcpId).toBe('H2');
  });

  it('shows an error with retry when a chart fails', async () => {
    mockApi([...routes.filter((r) => r.url !== '/performance/deciles'), { url: '/performance/deciles', respond: apiError(500, 'Deciles unavailable') }]);
    renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    expect(await screen.findByText('Deciles unavailable')).toBeInTheDocument();
  });
});
