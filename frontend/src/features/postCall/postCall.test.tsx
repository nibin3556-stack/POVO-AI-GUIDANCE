import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import PostCallPage from '../../pages/PostCallPage';
import { call, callPrep, flaggedResult, passedResult, profile } from '../../test/fixtures';
import { apiError, mockApi, renderWithProviders, type MockRoute } from '../../test/testUtils';

const body = (c: Pick<InternalAxiosRequestConfig, "data">) => (typeof c.data === 'string' ? JSON.parse(c.data) : c.data) as Record<string, unknown>;

const baseRoutes = (overrides: MockRoute[] = []): MockRoute[] => [
  ...overrides,
  { url: /\/api\/v1\/targets\/[^/]+\/profile/, respond: profile },
  { method: 'post', url: '/calls', respond: call() },
  { method: 'post', url: '/call-prep', respond: (c: InternalAxiosRequestConfig) => callPrep({ category: body(c).category as 'messaging' }) },
  { method: 'put', url: /\/api\/v1\/calls\/C1\/assessments/, respond: call() },
  { method: 'post', url: '/compliance/check', respond: (c: InternalAxiosRequestConfig) => (String(body(c).note).includes('damn') ? flaggedResult : passedResult) },
  { method: 'post', url: /\/api\/v1\/compliance\/K1\/accept/, respond: null },
];

const open = () => renderWithProviders(<PostCallPage />, { route: '/post-call/H2', path: '/post-call/:hcpId' });

const raiseFirstPoint = async () => {
  const rows = await screen.findAllByTestId('point-row', {}, { timeout: 5000 });
  await userEvent.click(within(rows[0]!).getByRole('checkbox'));
  return rows[0]!;
};

describe('Post-Call Assessment', () => {
  it('opens the call, shows the points and counts answers', async () => {
    const spy = mockApi(baseRoutes());
    open();
    expect(await screen.findByText('HiSCR50 primary endpoint met at Week 12', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/calls' && JSON.stringify(body(c)) === JSON.stringify({ hcp_id: 'H2', participant_ids: ['H2'] }))).toBe(true);
    expect(screen.getByRole('button', { name: /AI Suggestions for Next Call/ })).toBeDisabled();
    await raiseFirstPoint();
    expect(screen.getByText('1 of 9 selected for Dr. Winters')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Not rated');
    expect(screen.getByRole('button', { name: /AI Suggestions for Next Call/ })).toBeEnabled();
  }, 10000);

  it('autosaves the changed rows after a pause', async () => {
    const spy = mockApi(baseRoutes());
    open();
    await raiseFirstPoint();
    await userEvent.click(screen.getByRole('button', { name: 'Well Received' }));
    await waitFor(() => expect(spy.mock.calls.some(([c]) => c.method?.toLowerCase() === 'put')).toBe(true), { timeout: 3000 });
    const put = spy.mock.calls.find(([c]) => c.method?.toLowerCase() === 'put')?.[0];
    const items = (body(put as InternalAxiosRequestConfig).items as Array<Record<string, unknown>>).filter((i) => i.category === 'messaging');
    expect(items[0]).toMatchObject({ point_id: 'M1', was_raised: true, reception: 2 });
  });

  it('flags a note, shows the report and applies the suggestion', async () => {
    const spy = mockApi(baseRoutes());
    const { store } = open();
    await raiseFirstPoint();
    const input = screen.getByPlaceholderText('Notes');
    await userEvent.type(input, 'damn good call with the HCP');
    fireEvent.blur(input);
    expect(await screen.findByRole('status', { name: 'AI compliance check in progress' })).toBeInTheDocument();
    expect(await screen.findByText('Non-compliant', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText('damn').length).toBeGreaterThan(0);
    expect(store.getState().callSession.compliance['H2|messaging|M1']?.status).toBe('flagged');
    await userEvent.click(screen.getByRole('button', { name: /Use Suggestion/ }));
    expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/compliance/K1/accept')).toBe(true);
    await waitFor(() => expect(screen.getByPlaceholderText('Notes')).toHaveValue(flaggedResult.suggested_text));
    await waitFor(() => expect(store.getState().callSession.compliance['H2|messaging|M1']?.status).toBe('passed'), { timeout: 3000 });
  }, 20000);

  it('highlights the flags returned by next-call (409)', async () => {
    mockApi(baseRoutes([{ method: 'post', url: /next-call/, respond: apiError(409, 'Flagged', { flags: [{ participant_id: 'H2', category: 'messaging', point_id: 'M1', chip: 'Claim' }] }) }]));
    const { store } = open();
    await raiseFirstPoint();
    await userEvent.click(screen.getByRole('button', { name: /AI Suggestions for Next Call/ }));
    await waitFor(() => expect(store.getState().callSession.compliance['H2|messaging|M1']).toMatchObject({ status: 'flagged', chip: 'Claim' }));
    expect(await screen.findByText('Clear 1 compliance flag to enable AI Suggestions for Next Call')).toBeInTheDocument();
    expect(screen.getByText('1 compliance flag')).toBeInTheDocument();
  });

  it('runs the stepper and returns to Pre-Call Planning on success', async () => {
    mockApi(baseRoutes([{ method: 'post', url: /next-call/, respond: { call_id: 'C1', revision_no: 1, call_date: '2026-10-13', steps: [], participants: [], source: 'rules' } }]));
    const { router, store } = open();
    await raiseFirstPoint();
    await userEvent.click(screen.getByRole('button', { name: /AI Suggestions for Next Call/ }));
    expect(await screen.findByText('AI is preparing suggestions for the next call')).toBeInTheDocument();
    expect(screen.getByText('Reading the post-call assessment')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/pre-call/H2'), { timeout: 5000 });
    expect(store.getState().callSession.scrollToPrep).toBe(true);
    expect(store.getState().callSession.prepCategory).toBe('messaging');
  }, 10000);
});
