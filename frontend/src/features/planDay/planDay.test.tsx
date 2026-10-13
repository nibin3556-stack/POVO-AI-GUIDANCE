import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PerformancePage from '../../pages/PerformancePage';
import { sessionApi } from '../../redux/api/sessionApi';
import { deciles, guidance, kpis, meRep, newWriters, participant, profile, segmentation, target } from '../../test/fixtures';
import { mockApi, renderWithProviders } from '../../test/testUtils';
import type { DeliveredPoint } from '../../types/models';
import { summaryLine, topicOf } from '../../utils/insightSummary';
import { focusZips, matchZips, pickFocus, recentInteractions, repCallsSince, whyToday } from '../../utils/planDay';

const TODAY = '2026-10-13';
const tier = () => 'Super High';

const zipTargets = [
  target({ hcp_id: 'A', display_name: 'Dr. Able', zip: '04101', last_call_date: '2026-08-20', hs_patients: 40, povo_patients: 2, pef: 2 }),
  target({ hcp_id: 'B', display_name: 'Dr. Baker', zip: '04101', last_call_date: null, hs_patients: 90, povo_patients: 0, pef: 0 }),
  target({ hcp_id: 'C', display_name: 'Dr. Cole', zip: '04101', last_call_date: '2026-10-09', hs_patients: 60, povo_patients: 5, pef: 7 }),
  target({ hcp_id: 'D', display_name: 'Dr. Dunn', zip: '04101', last_call_date: '2026-10-09', hs_patients: 30, povo_patients: 30, pef: 30 }),
  target({ hcp_id: 'N', display_name: 'Nina Park', role_type: 'NP', zip: '04101', last_call_date: null }),
  target({ hcp_id: 'V', display_name: 'Dr. Vance', zip: '04101', segment_code: 'conv' }),
  target({ hcp_id: 'W', display_name: 'Dr. West', zip: '04330', city: 'Augusta', segment_code: 'conv' }),
];

describe('Plan Your Day rules', () => {
  it('lists territory ZIP codes with non-Conventional targets and matches by code or city', () => {
    const zips = focusZips(zipTargets);
    expect(zips).toEqual([{ zip: '04101', city: 'Portland', count: 5 }]);
    expect(matchZips(zips, '041')).toHaveLength(1);
    expect(matchZips(zips, 'port')).toHaveLength(1);
    expect(matchZips(zips, 'zzz')).toHaveLength(0);
  });

  it('ranks by the first Why Today signal and writes the next step', () => {
    const [a, b, c, d] = zipTargets as [ReturnType<typeof target>, ReturnType<typeof target>, ReturnType<typeof target>, ReturnType<typeof target>];
    expect(whyToday(a, 'Super High', TODAY)).toEqual({ rank: 1, tone: 'miss', why: 'No call in 54 days · D10 Super High', action: 'Reconnect this week, then ask for the next patient' });
    expect(whyToday(b, 'Super High', TODAY)).toMatchObject({ rank: 2, why: 'Not called since launch · D10 Super High', action: 'Book the first call' });
    expect(whyToday(c, 'Super High', TODAY)).toMatchObject({ rank: 4, why: '2 PEFs pending · D10 Super High', action: 'Confirm PEF status, then ask for the next patient' });
    expect(whyToday(c, 'Super High', TODAY, 2, 6)).toMatchObject({ rank: 4, action: 'Confirm PEF status, then add 4 calls to hit goal' });
    expect(whyToday(d, 'Super High', TODAY)).toMatchObject({ rank: 7, tone: 'opp', why: 'All 30 HS patients on POVO · D10 Super High', action: 'Keep the call frequency on plan' });
  });

  it('picks the Top 3 HCPs first, then NPs and PAs, and explains a ZIP code without picks', () => {
    const result = pickFocus(zipTargets, '04101', tier, TODAY);
    expect(result.kind === 'picks' && result.picks.map((p) => p.target.hcp_id)).toEqual(['A', 'B', 'C']);
    const fill = pickFocus(zipTargets.filter((t) => t.hcp_id === 'A' || t.hcp_id === 'N'), '04101', tier, TODAY);
    expect(fill.kind === 'picks' && fill.picks.map((p) => p.target.hcp_id)).toEqual(['A', 'N']);
    expect(pickFocus(zipTargets, '04330', tier, TODAY)).toEqual({ kind: 'onlyConventional', city: 'Augusta' });
    expect(pickFocus(zipTargets, '99999', tier, TODAY)).toEqual({ kind: 'unknown' });
  });

  it('counts engagement in the last 30 days and POVO Sales calls since the data start', () => {
    const p = participant();
    expect(recentInteractions(p.interactions, TODAY)).toBe(2);
    expect(repCallsSince(p.interactions, '2026-07-01', TODAY)).toBe(1);
  });
});

describe('Insight Summary rules', () => {
  const point = (over: Partial<DeliveredPoint>): DeliveredPoint => ({
    point_id: 'X', rank: 0, pillar: null, text: '', detail: null, detail_label: null, tags: [], previous_text: null, previous_rank: null,
    delivered_date: TODAY, reception: null, label: '', is_open: false, ...over,
  });

  it('names the topic of a point in plain words', () => {
    expect(topicOf('messaging', point({ pillar: 'Proven efficacy in a pill', text: 'Both doses met the primary endpoint' }))).toBe('the efficacy results');
    expect(topicOf('closing', point({ text: 'Something else' }))).toBe('the next step');
  });

  it('states one conclusion per section', () => {
    expect(summaryLine('messaging', [], 'Dr. Winters')).toBe('No messages were covered on the last call');
    expect(
      summaryLine('messaging', [point({ text: 'Once daily pill', reception: 2 }), point({ text: 'JAK1 approach', reception: 0 })], 'Dr. Winters'),
    ).toBe('Dr. Winters responded well to once-daily oral dosing but is not convinced by the JAK1 approach yet');
    expect(
      summaryLine('objection', [point({ text: 'Boxed warning', is_open: true, label: 'Still Open' }), point({ text: 'Antibiotics work', label: 'Resolved' })], 'Dr. Winters'),
    ).toBe('Concerns about staying on antibiotics were resolved, but JAK safety and monitoring is still open; address it first next call');
    expect(summaryLine('closing', [point({ text: 'Which patient comes to mind?', reception: 1 })], 'Dr. Winters')).toBe(
      'Dr. Winters is open to naming patients for POVO but has not committed yet',
    );
  });
});

describe('Plan Your Day pop-up', () => {
  const routes = [
    { url: '/performance/kpis', respond: kpis },
    { url: '/performance/guidance', respond: guidance },
    { url: '/performance/segmentation', respond: segmentation },
    { url: '/performance/deciles', respond: deciles },
    { url: '/performance/new-writers', respond: newWriters },
    { url: '/targets/must-wins', respond: { territory_name: 'Portland, ME territory', hs_volume: [zipTargets[0]], hs_jak: [] } },
    { url: '/targets', respond: zipTargets.slice(1), pagination: { page: 1, limit: 200, total_pages: 1, total_items: 6 } },
    { url: /\/api\/v1\/targets\/[^/]+\/profile/, respond: profile },
  ];

  it('opens from the POVO Pulse panel, shows the Top 3 for a ZIP code and opens the picked Call Prep', async () => {
    mockApi(routes);
    const { store, router } = renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    store.dispatch(sessionApi.util.upsertQueryEntries([{ endpointName: 'getMe', arg: undefined, value: meRep }]));
    await userEvent.click(await screen.findByRole('button', { name: /Click Here to Plan Your Day/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Tuesday, October 13, 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('Type a ZIP Code to Focus On Today')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('ZIP code'), '041');
    await userEvent.click(await within(dialog).findByRole('option', { name: /04101/ }));
    expect(await within(dialog).findByText('AI is preparing the Top 3 HCPs for ZIP code 04101')).toBeInTheDocument();
    const cards = await within(dialog).findAllByTestId('focus-card', {}, { timeout: 5000 });
    expect(cards).toHaveLength(3);
    expect(within(cards[0] as HTMLElement).getByText('No call in 54 days · D10 Super High')).toBeInTheDocument();
    expect(within(cards[0] as HTMLElement).getByText('Prescribing Behavior')).toBeInTheDocument();
    await waitFor(() => expect(within(cards[0] as HTMLElement).getByText('2 in the last 30 days')).toBeInTheDocument());
    await userEvent.click(cards[1] as HTMLElement);
    await waitFor(() => expect(router.state.location.pathname).toBe('/pre-call/B'));
    expect(store.getState().callSession.selectedHcpId).toBe('B');
  }, 15000);

  it('explains a ZIP code with only Conventional targets', async () => {
    mockApi([
      ...routes.filter((r) => r.url !== '/targets'),
      { url: '/targets', respond: zipTargets.slice(1), pagination: { page: 1, limit: 200, total_pages: 1, total_items: 6 } },
    ]);
    const { store } = renderWithProviders(<PerformancePage />, { route: '/performance', path: '/performance' });
    store.dispatch(sessionApi.util.upsertQueryEntries([{ endpointName: 'getMe', arg: undefined, value: meRep }]));
    await userEvent.click(await screen.findByRole('button', { name: /Click Here to Plan Your Day/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('ZIP code'), '04330{Enter}');
    expect(await within(dialog).findByText(/Augusta 04330 has only Conventional targets today/)).toBeInTheDocument();
  });
});
