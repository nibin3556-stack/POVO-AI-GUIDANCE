import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it } from 'vitest';
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

/** A stand-in for the browser's speech recognition: it "hears" one sentence, then ends. */
class FakeRecognizer {
  static last: FakeRecognizer | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognizer.last = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {}
  say(text: string) {
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: text }], { isFinal: true }) } });
  }
}

afterEach(() => {
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

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
    expect(screen.getByText('Post-Call Assessment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    await raiseFirstPoint();
    expect(screen.getByText('1 of 9 selected for Dr. Winters')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 selected')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Not rated');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
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
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(store.getState().callSession.compliance['H2|messaging|M1']).toMatchObject({ status: 'flagged', chip: 'Claim' }));
    expect(await screen.findByText('Clear 1 compliance flag to submit the assessment')).toBeInTheDocument();
    expect(screen.getByText('1 compliance flag')).toBeInTheDocument();
  });

  it('submits and returns to Pre-Call Planning with the row to flash', async () => {
    mockApi(baseRoutes([{ method: 'post', url: /next-call/, respond: { call_id: 'C1', revision_no: 1, call_date: '2026-10-13', steps: [], participants: [], source: 'rules' } }]));
    const { router, store } = open();
    await raiseFirstPoint();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/pre-call'), { timeout: 5000 });
    expect(store.getState().callSession.justSubmittedHcpId).toBe('H2');
    expect(store.getState().callSession.selectedHcpId).toBeNull();
  }, 10000);

  it('an example note fills the field and is checked', async () => {
    const spy = mockApi(baseRoutes());
    open();
    const row = await raiseFirstPoint();
    const examples = within(row).getByTestId('example-notes');
    await userEvent.click(within(examples).getByRole('button', { name: 'HCP asked how lab monitoring works before a first POVO start' }));
    expect(screen.getByPlaceholderText('Notes')).toHaveValue('HCP asked how lab monitoring works before a first POVO start');
    await waitFor(() => expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/compliance/check')).toBe(true), { timeout: 3000 });
  }, 10000);

  it('a voice note is transcribed into the note, checked, and pauses Submit while it records', async () => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognizer;
    const spy = mockApi(baseRoutes());
    const { store } = open();
    const row = await raiseFirstPoint();
    await userEvent.click(within(row).getByRole('button', { name: 'Record a voice note' }));
    expect(store.getState().callSession.recordingKey).toBe('H2|messaging|M1');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByText('Submit is paused until the voice note and its compliance check finish')).toBeInTheDocument();
    act(() => FakeRecognizer.last?.say('hcp asked for the week 12 lesion data'));
    await waitFor(() => expect(screen.getByPlaceholderText('Listening…')).toHaveValue('Hcp asked for the week 12 lesion data'));
    await userEvent.click(within(row).getByRole('button', { name: 'Stop recording' }));
    expect(store.getState().callSession.recordingKey).toBeNull();
    await waitFor(() =>
      expect(spy.mock.calls.some(([c]) => c.url === '/api/v1/compliance/check' && body(c).note === 'Hcp asked for the week 12 lesion data')).toBe(true),
    { timeout: 3000 });
  }, 10000);

  it('a voice note without browser support explains why', async () => {
    mockApi(baseRoutes());
    open();
    const row = await raiseFirstPoint();
    expect(within(row).getByRole('button', { name: /Microsoft Edge or Google Chrome/ })).toBeInTheDocument();
  }, 10000);
});
