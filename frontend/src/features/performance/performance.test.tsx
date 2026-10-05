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
  it('shows the two KPI cards, the patient split, AI guidance and chart captions', async () => {
    mockApi(routes);
    renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    expect(await screen.findByText('Patient Enrollment Forms')).toBeInTheDocument();
    expect(screen.getByText('Total Patients Receiving POVO')).toBeInTheDocument();
    expect(screen.getAllByText('(October)')).toHaveLength(2);
    expect(screen.getByText('On Track')).toBeInTheDocument();
    expect(screen.getByText('At Risk')).toBeInTheDocument();
    const split = screen.getByTestId('patient-split');
    expect(within(split).getByText('Total on POVO')).toBeInTheDocument();
    expect(within(split).getByText('40')).toBeInTheDocument();
    expect(within(split).getByText('Paid NRx')).toBeInTheDocument();
    expect(within(split).getByText('78%')).toBeInTheDocument();
    expect(within(split).getByText('Bridge and Free Trial as of 10/13/2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '9 of 17 achieved, 53% of goal' })).toBeInTheDocument();
    expect(await screen.findByText('Dr. Boland')).toBeInTheDocument();
    expect(screen.getByText('3 Super High')).toBeInTheDocument();
    expect(await screen.findByText('Target – HS Treatment Segmentation')).toBeInTheDocument();
    expect(await screen.findByText('▼ 59 of 83 POVO Targets yet to write POVO')).toBeInTheDocument();
    await screen.findByText(/Super High HCP/);
    expect(document.body).toHaveTextContent('▼ 2 of 12 Super High HCPs yet to write POVO');
    expect(await screen.findByText('7 new POVO writers · Jul 1 – Oct 13, 2026')).toBeInTheDocument();
  });

  it('shows the decile table by default and switches to the chart', async () => {
    mockApi(routes);
    const { store } = renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    const table = await screen.findByTestId('decile-table');
    expect(within(table).getByText('100%')).toBeInTheDocument();
    expect(within(table).getByText('6.7')).toBeInTheDocument();
    expect(within(table).getAllByText('Achieved vs Goal')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Chart' }));
    expect(store.getState().callSession.decileView).toBe('chart');
    expect(screen.queryByTestId('decile-table')).toBeNull();
  });

  it('names every physician tied for the most POVO patients', async () => {
    mockApi([
      ...routes.filter((r) => r.url !== '/performance/guidance'),
      {
        url: '/performance/guidance',
        respond: { ...guidance, strong: { ...guidance.strong, top_writer: { hcp_id: 'H2', display_name: 'Dr. Winters', povo_patients: 4, ties: ['Dr. Winters', 'Dr. Berg', 'Dr. Sprague'] } } },
      },
    ]);
    renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    expect(await screen.findByText(/and 2 others · 4 POVO patients each/)).toBeInTheDocument();
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
