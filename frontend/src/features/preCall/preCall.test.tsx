import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import PreCallPage from '../../pages/PreCallPage';
import { accounts, callPrep, facets, mustWins, planTargets, profile } from '../../test/fixtures';
import { mockApi, renderWithProviders } from '../../test/testUtils';

const routes = [
  { url: '/targets/must-wins', respond: mustWins },
  { url: '/targets/facets', respond: facets },
  { url: '/targets', respond: planTargets, pagination: { page: 1, limit: 10, total_pages: 1, total_items: 2 } },
  { url: '/accounts', respond: accounts, pagination: { page: 1, limit: 200, total_pages: 1, total_items: 2 } },
  { url: /\/api\/v1\/accounts\/A1\/targets/, respond: planTargets },
  { url: /\/api\/v1\/targets\/[^/]+\/profile/, respond: profile },
  {
    method: 'post',
    url: '/call-prep',
    respond: (c: InternalAxiosRequestConfig) => {
      const body = c.data as { category: 'messaging' | 'objection' | 'closing' };
      return callPrep({ category: body.category });
    },
  },
];

describe('Pre-Call Planning', () => {
  it('lists Must-Wins and the Full Call Plan with a placeholder before selection', async () => {
    mockApi(routes);
    renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    expect(await screen.findByText('Dr. Sprague')).toBeInTheDocument();
    expect(await screen.findByText('Dr. Berg')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2 targets')).toBeInTheDocument();
    expect(screen.getByText('Select a target in Must-Wins or the Call Plan Targets to see the call prep')).toBeInTheDocument();
    expect(screen.getAllByText('Not called').length).toBeGreaterThan(0);
  });

  it('filters by competitive focus and sorts on the server', async () => {
    const spy = mockApi(routes);
    renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    await screen.findByText('Dr. Berg');
    await userEvent.click(screen.getByRole('button', { name: /Humira/ }));
    await userEvent.click(screen.getByRole('button', { name: /Decile/ }));
    await waitFor(() =>
      expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/targets' && (c.params as Record<string, string>).focus === 'humira' && (c.params as Record<string, string>).sort === 'decile:desc')).toBe(true),
    );
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
  });

  it('shows accounts, including the claims-only note', async () => {
    mockApi(routes);
    renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    await userEvent.click(await screen.findByRole('button', { name: /Accounts/ }));
    await userEvent.click(await screen.findByText('Portland Surgical Specialists'));
    expect(screen.getByText('24 HS patients')).toBeInTheDocument();
    expect(screen.getByText('No affiliations')).toBeInTheDocument();
  });

  it('selecting a target opens the call prep, and the AI reveals the points once', async () => {
    mockApi(routes);
    const { router, store } = renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    await userEvent.click(await screen.findByText('Dr. Berg'));
    expect(router.state.location.pathname).toBe('/pre-call/H10');
    const prep = await screen.findByTestId('call-prep');
    expect(await within(prep).findByText('Call Prep · Dr. Winters, John, MD')).toBeInTheDocument();
    expect(within(prep).getByText('HS patients, last 12 months')).toBeInTheDocument();
    await userEvent.click(within(prep).getByRole('button', { name: 'Suggested Messaging' }));
    expect(await within(prep).findByText('AI is preparing Suggested Messaging')).toBeInTheDocument();
    await waitFor(() => expect(store.getState().callSession.revealed['H2|messaging|0']).toBe(true), { timeout: 5000 });
    expect(within(prep).getByText('HiSCR50 primary endpoint met at Week 12')).toBeInTheDocument();
    expect(within(prep).getByText('↳ Insight:')).toBeInTheDocument();
    expect(within(prep).getByText('AI generated')).toBeInTheDocument();
  }, 10000);

  it('shows the AI activity box with its steps, not a spinner, while the points are prepared', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    mockApi([
      ...routes.filter((r) => r.url !== '/call-prep'),
      { method: 'post', url: '/call-prep', respond: () => gate.then(() => callPrep({ category: 'messaging' })) },
    ]);
    renderWithProviders(<PreCallPage />, { route: '/pre-call/H2', path: '/pre-call/:hcpId?' });
    const prep = await screen.findByTestId('call-prep');
    await userEvent.click(await within(prep).findByRole('button', { name: 'Suggested Messaging' }));
    expect(await within(prep).findByText('AI is preparing Suggested Messaging')).toBeInTheDocument();
    expect(within(prep).getByText("Analyzing Dr. Winters' profile, decile and HS volume")).toBeInTheDocument();
    expect(within(prep).queryByText('Loading…')).toBeNull();
    release();
    expect(await within(prep).findByText(/HiSCR50/, {}, { timeout: 5000 })).toBeInTheDocument();
  }, 10000);

  it('adds the PA as a meeting participant', async () => {
    mockApi(routes);
    const { store } = renderWithProviders(<PreCallPage />, { route: '/pre-call/H2', path: '/pre-call/:hcpId?' });
    const prep = await screen.findByTestId('call-prep');
    await userEvent.click(await within(prep).findByRole('button', { name: /Kristen Casey/ }));
    expect(store.getState().callSession.participantIds).toEqual(['H2', 'N11']);
    expect(within(prep).getAllByRole('tab', { name: /Kristen Casey/ }).length).toBeGreaterThan(0);
  });

  it('shows revision tags, the banner and the revised pill after the next call', async () => {
    const revised = callPrep({
      revision_no: 1,
      is_revised: true,
      revised_from_date: '2026-10-13',
      banner: { summary: '1 retained', next_best_action: 'Lead with efficacy' },
      points: [{ point_id: 'M1', rank: 1, pillar: 'Efficacy', text: 'New text', detail: null, detail_label: null, tags: ['Changed', '▲ was #2'], previous_text: 'Old text', previous_rank: 2 }],
    });
    mockApi([...routes.filter((r) => r.url !== '/call-prep'), { method: 'post', url: '/call-prep', respond: revised }]);
    renderWithProviders(<PreCallPage />, {
      route: '/pre-call/H2',
      path: '/pre-call/:hcpId?',
      preloadedState: undefined,
    });
    const prep = await screen.findByTestId('call-prep');
    await userEvent.click(await within(prep).findByRole('button', { name: 'Suggested Messaging' }));
    expect(await within(prep).findByText('Revised after the 10/13/2026 call')).toBeInTheDocument();
    expect(within(prep).getByText(/Updated from the 10\/13\/2026 post-call assessment: 1 retained/)).toBeInTheDocument();
    expect(within(prep).getByText('Lead with efficacy')).toBeInTheDocument();
    await waitFor(() => expect(within(prep).getByText('Changed')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(prep).getByText('Old text')).toBeInTheDocument();
  }, 10000);
});
