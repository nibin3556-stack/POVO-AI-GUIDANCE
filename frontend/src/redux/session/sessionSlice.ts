import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { IMPERSONATION_STORAGE_KEY } from '../../constants/constant';

export interface ImpersonationTarget {
  employeeId: string;
  name: string;
}

export interface SessionState {
  impersonation: ImpersonationTarget | null;
}

const isTarget = (value: unknown): value is ImpersonationTarget =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ImpersonationTarget).employeeId === 'string' &&
  (value as ImpersonationTarget).employeeId.trim() !== '' &&
  typeof (value as ImpersonationTarget).name === 'string';

/** Reads the persisted impersonation (sessionStorage: it ends with the browser tab). */
export const loadImpersonation = (): ImpersonationTarget | null => {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isTarget(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const persistImpersonation = (value: ImpersonationTarget | null): void => {
  try {
    if (value) sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  } catch {
    /* sessionStorage unavailable: impersonation lasts until reload. */
  }
};

export const createSessionState = (): SessionState => ({ impersonation: loadImpersonation() });

const sessionSlice = createSlice({
  name: 'session',
  initialState: createSessionState,
  reducers: {
    impersonationStarted: (state, action: PayloadAction<ImpersonationTarget>) => {
      state.impersonation = action.payload;
    },
    impersonationEnded: (state) => {
      state.impersonation = null;
    },
  },
});

export const { impersonationStarted, impersonationEnded } = sessionSlice.actions;
export default sessionSlice.reducer;
