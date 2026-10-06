import { describe, expect, it } from 'vitest';
import { IMPERSONATION_STORAGE_KEY } from '../constants/constant';
import { flaggedResult, meRep } from '../test/fixtures';
import { sessionApi } from './api/sessionApi';
import {
  selectActiveFilterCount,
  selectActiveParticipantId,
  selectFlagCount,
  selectFlaggedKeys,
  selectTargetQuery,
} from './callSession/callSessionSelectors';
import reducer, {
  accountsCleared,
  assessmentSubmitted,
  complianceChecked,
  complianceChecking,
  complianceDialogOpened,
  complianceFlagged,
  filterToggled,
  filtersCleared,
  initialCallSessionState,
  pageSelected,
  recordingChanged,
  reinforceToggled,
  submittedFlashDone,
  participantToggled,
  participantsInitialised,
  revealCompleted,
  sortSelected,
  targetSelected,
} from './callSession/callSessionSlice';
import { selectImpersonatedEmployeeId, selectIsImpersonating } from './session/sessionSelectors';
import sessionReducer, { impersonationEnded, impersonationStarted, loadImpersonation } from './session/sessionSlice';
import { setupStore, type RootState } from './store';

describe('session slice', () => {
  it('starts and ends impersonation', () => {
    const started = sessionReducer({ impersonation: null, brandCode: null }, impersonationStarted({ employeeId: 'p250611', name: 'Dana Whitaker' }));
    expect(started.impersonation?.employeeId).toBe('p250611');
    expect(sessionReducer(started, impersonationEnded()).impersonation).toBeNull();
  });
  it('loads a valid persisted value and ignores junk', () => {
    sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify({ employeeId: 'p1', name: 'X' }));
    expect(loadImpersonation()).toEqual({ employeeId: 'p1', name: 'X' });
    sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, '{bad');
    expect(loadImpersonation()).toBeNull();
  });
  it('persists, resets the call session and the api cache on change', async () => {
    const store = setupStore();
    store.dispatch(targetSelected({ hcpId: 'H2' }));
    await store.dispatch(sessionApi.util.upsertQueryData('getMe', undefined, meRep));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);
    store.dispatch(impersonationStarted({ employeeId: 'p250611', name: 'Dana' }));
    expect(JSON.parse(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY) ?? 'null')).toEqual({ employeeId: 'p250611', name: 'Dana' });
    expect(store.getState().callSession.selectedHcpId).toBeNull();
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
    expect(selectImpersonatedEmployeeId(store.getState())).toBe('p250611');
    expect(selectIsImpersonating(store.getState())).toBe(true);
    store.dispatch(impersonationEnded());
    expect(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)).toBeNull();
  });
});

describe('callSession slice', () => {
  it('selects a target and resets the call state', () => {
    let s = reducer(initialCallSessionState, targetSelected({ hcpId: 'H2', scroll: true }));
    s = reducer(s, participantsInitialised({ hcpId: 'H2', ids: ['H2'] }));
    expect(s.scrollToPrep).toBe(true);
    s = reducer(s, participantToggled({ id: 'N11', order: ['H2', 'N11'] }));
    expect(s.participantIds).toEqual(['H2', 'N11']);
    s = reducer(s, participantToggled({ id: 'N11', order: ['H2', 'N11'] }));
    expect(s.participantIds).toEqual(['H2']);
    s = reducer(s, targetSelected({ hcpId: 'H3' }));
    expect(s.participantsFor).toBeNull();
  });
  it('handles filters, sort, pages and accounts', () => {
    let s = reducer(initialCallSessionState, pageSelected(3));
    s = reducer(s, filterToggled({ group: 'focus', value: 'jak' }));
    expect(s.filters.focus).toEqual(['jak']);
    expect(s.page).toBe(0);
    s = reducer(s, sortSelected('hs_patients'));
    expect(s.sort).toEqual({ key: 'hs_patients', direction: 'asc' });
    s = reducer(s, filtersCleared());
    expect(s.filters.focus).toEqual([]);
    s = reducer(s, filterToggled({ group: 'account', value: 'A1' }));
    expect(s.filters.account).toEqual(['A1']);
    expect(reducer(s, accountsCleared()).filters.account).toEqual([]);
  });
  it('tracks compliance, the dialog and reveals', () => {
    let s = reducer(initialCallSessionState, complianceChecking({ key: 'k', note: 'n' }));
    expect(s.compliance.k?.status).toBe('checking');
    s = reducer(s, complianceChecked({ key: 'k', note: 'n', result: flaggedResult }));
    expect(s.compliance.k?.status).toBe('flagged');
    s = reducer(s, complianceDialogOpened({ key: 'k', context: 'ctx' }));
    expect(s.compliance.k?.alertedNote).toBe('n');
    s = reducer(s, complianceFlagged([{ key: 'j', note: 'x', chip: 'Claim' }]));
    expect(s.compliance.j?.chip).toBe('Claim');
    expect(s.compliance.j?.result).toBeNull();
    s = reducer(s, revealCompleted('H2|messaging|0'));
    expect(s.revealed['H2|messaging|0']).toBe(true);
    s = reducer(s, targetSelected({ hcpId: 'H2' }));
    s = reducer(s, reinforceToggled({ scope: 'H2|messaging', pointId: 'M1' }));
    expect(s.reinforced['H2|messaging']).toEqual(['M1']);
    s = reducer(s, recordingChanged('k'));
    expect(s.recordingKey).toBe('k');
    s = reducer(s, assessmentSubmitted({ hcpId: 'H2', participantId: 'P1', category: 'closing' }));
    expect(s.compliance).toEqual({});
    expect(s.selectedHcpId).toBe('H2');
    expect(s.prepParticipantId).toBe('P1');
    expect(s.historyParticipantId).toBe('P1');
    expect(s.prepCategory).toBe('closing');
    expect(s.scrollToPrep).toBe(true);
    expect(s.reinforced).toEqual({});
    expect(s.recordingKey).toBeNull();
    expect(s.justSubmittedHcpId).toBe('H2');
    expect(s.revealed['H2|messaging|0']).toBe(true);
    expect(reducer(s, submittedFlashDone()).justSubmittedHcpId).toBeNull();
  });
  it('derives state with memoised selectors', () => {
    const base = setupStore().getState();
    const state: RootState = {
      ...base,
      callSession: {
        ...initialCallSessionState,
        page: 1,
        participantIds: ['H2', 'N11'],
        assessParticipantId: 'N11',
        filters: { ...initialCallSessionState.filters, segment: ['imm'] },
        compliance: { a: { status: 'flagged', note: '', result: null, chip: null, alertedNote: null }, b: { status: 'passed', note: '', result: null, chip: null, alertedNote: null } },
      },
    };
    expect(selectTargetQuery(state)).toMatchObject({ page: 2, limit: 10, sort: 'hs_patients:desc' });
    expect(selectTargetQuery(state)).toBe(selectTargetQuery(state));
    expect(selectActiveFilterCount(state)).toBe(1);
    expect(selectActiveParticipantId(state)).toBe('N11');
    expect(selectFlagCount(state)).toBe(1);
    expect(selectFlaggedKeys(state)).toEqual(['a']);
  });
});
