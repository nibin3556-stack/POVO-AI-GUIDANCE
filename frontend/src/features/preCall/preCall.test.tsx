import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import PreCallPage from '../../pages/PreCallPage';
import { callPrep, facets, mustWins, planTargets, profile } from '../../test/fixtures';
import type { Category, DeliveredPoint } from '../../types/models';
import { initialCallSessionState } from '../../redux/callSession/callSessionSlice';
import { mockApi, renderWithProviders } from '../../test/testUtils';

const routes = [
  { url: '/targets/must-wins', respond: mustWins },
  { url: '/targets/facets', respond: facets },
  { url: '/targets', respond: planTargets, pagination: { page: 1, limit: 10, total_pages: 1, total_items: 2 } },
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
    expect(screen.getByText('Select a target in Must-Wins or the Call Plan Targets to see the Call Prep')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Segment' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(10);
    expect(screen.getAllByText('Not called').length).toBeGreaterThan(0);
  });

  it('filters by competitive focus and sorts on the server', async () => {
    const spy = mockApi(routes);
    renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    await screen.findByText('Dr. Berg');
    await userEvent.click(screen.getByRole('button', { name: /Humira/ }));
    await userEvent.click(within(screen.getByRole('columnheader', { name: /Decile/ })).getByRole('button'));
    await waitFor(() =>
      expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/targets' && (c.params as Record<string, string>).focus === 'humira' && (c.params as Record<string, string>).sort === 'decile:desc')).toBe(true),
    );
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
  });

  it('filters by account from the Account header and shows the PEFs column', async () => {
    const spy = mockApi(routes);
    renderWithProviders(<PreCallPage />, { route: '/pre-call', path: '/pre-call/:hcpId?' });
    await screen.findByText('Dr. Berg');
    expect(screen.getByRole('button', { name: /PEFs/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accounts/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filter by account' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: /Maine Medical Partners Dermatology/ }));
    await waitFor(() =>
      expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/targets' && (c.params as Record<string, string>).account_id === 'A1')).toBe(true),
    );
    expect(await screen.findByRole('button', { name: /Show all accounts/ })).toBeInTheDocument();
  });

  it('keeps an assessed target green in Must-Wins and Call Plan Targets, without flashing', async () => {
    mockApi(routes);
    renderWithProviders(<PreCallPage />, {
      route: '/pre-call',
      path: '/pre-call/:hcpId?',
      preloadedState: { callSession: { ...initialCallSessionState, justSubmittedHcpId: 'H10', assessedHcpIds: ['H10', 'H2'] } },
    });
    await screen.findByText('Dr. Berg');
    const row = document.querySelector('tr[data-row-key="H10"]');
    expect(row).toHaveAttribute('data-done', 'true');
    expect(row).not.toHaveClass('animate-just-done');
    expect(document.querySelector('button[data-row-key="H2"]')).toHaveAttribute('data-done', 'true');
    expect(document.querySelector('button[data-row-key="H3"]')).not.toHaveAttribute('data-done');
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
    // Generous wait: under a parallel test run the first render after the click can take over a second.
    expect(await within(prep).findByText('AI is preparing Suggested Messaging', undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(store.getState().callSession.revealed['H2|messaging|0']).toBe(true), { timeout: 5000 });
    expect(within(prep).getByText('HiSCR50 primary endpoint met at Week 12')).toBeInTheDocument();
    expect(within(prep).getByText('Efficacy:')).toBeInTheDocument();
    expect(within(prep).getByText('INSIGHT')).toBeInTheDocument();
    expect(within(prep).getByText('124 of 133 HS patients are not on POVO yet')).toBeInTheDocument();
    expect(within(prep).getByText('AI Generated')).toBeInTheDocument();
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

  it('after a submitted call: next-call tags and the Insight Summary, without the banner or the delivered history', async () => {
    const delivered = (over: Partial<DeliveredPoint>): DeliveredPoint => ({
      point_id: 'X',
      rank: 0,
      pillar: null,
      text: '',
      detail: null,
      detail_label: null,
      tags: [],
      previous_text: null,
      previous_rank: null,
      delivered_date: '2026-10-13',
      reception: null,
      label: '',
      is_open: false,
      ...over,
    });
    const revised = (category: Category) =>
      callPrep({
        category,
        revision_no: 1,
        is_revised: true,
        revised_from_date: '2026-10-13',
        banner: { summary: '2 delivered · 1 well received', next_best_action: 'Lead with efficacy' },
        points: [{ point_id: 'M1~F', rank: 1, pillar: 'Efficacy', text: 'New text', detail: null, detail_label: null, tags: ['Builds on well received'], previous_text: null, previous_rank: null }],
        delivered: {
          messaging: [delivered({ point_id: 'M1', pillar: 'Efficacy', text: 'Old text', reception: 2, label: 'Well Received' })],
          objection: [delivered({ point_id: 'O1', text: 'I worry about the boxed warning', label: 'Still Open', is_open: true })],
          closing: [],
        }[category],
      });
    const assessed = {
      ...profile,
      participants: profile.participants.map((p) =>
        p.hcp_id === 'H2'
          ? { ...p, interactions: [{ interaction_id: 'N1', date: '2026-10-13', channel_code: 'rep' as const, team_label: 'POVO Sales', type_label: 'Direct Call', summary: 'Call assessed', is_new: true }, ...p.interactions] }
          : p,
      ),
    };
    mockApi([
      ...routes.filter((r) => r.url !== '/call-prep' && String(r.url) !== String(/\/api\/v1\/targets\/[^/]+\/profile/)),
      { url: /\/api\/v1\/targets\/[^/]+\/profile/, respond: assessed },
      { method: 'post', url: '/call-prep', respond: (c: InternalAxiosRequestConfig) => revised((c.data as { category: Category }).category) },
    ]);
    renderWithProviders(<PreCallPage />, { route: '/pre-call/H2', path: '/pre-call/:hcpId?' });
    const prep = await screen.findByTestId('call-prep');
    const summary = await within(prep).findByTestId('insight-summary', {}, { timeout: 5000 });
    expect(within(summary).getByText('Last call Oct 13, 2026')).toBeInTheDocument();
    expect(within(summary).getByText('Dr. Winters responded well to the efficacy results; build on it next call')).toBeInTheDocument();
    expect(within(summary).getByText('JAK safety and monitoring is still a concern for Dr. Winters; address it first next call')).toBeInTheDocument();
    expect(within(summary).getByText('No closing was tried on the last call')).toBeInTheDocument();
    await userEvent.click(await within(prep).findByRole('button', { name: 'Suggested Messaging' }));
    expect(await within(prep).findByText('Revised after the 10/13/2026 call')).toBeInTheDocument();
    await waitFor(() => expect(within(prep).getByText('Builds on well received')).toBeInTheDocument(), { timeout: 5000 });
    expect(within(prep).queryByText(/Updated from the 10\/13\/2026 post-call assessment/)).toBeNull();
    expect(within(prep).queryByTestId('delivered-list')).toBeNull();
    expect(within(prep).queryByText('Old text')).toBeNull();
  }, 10000);
});
