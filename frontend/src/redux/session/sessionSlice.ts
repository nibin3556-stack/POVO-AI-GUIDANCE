import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { BRAND_STORAGE_KEY, IMPERSONATION_STORAGE_KEY } from '../../constants/constant';

export interface ImpersonationTarget {
  employeeId: string;
  name: string;
}

export interface SessionState {
  impersonation: ImpersonationTarget | null;
  /** The selected brand; null until the user picks one (the server uses their default). */
  brandCode: string | null;
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

/** The remembered brand (localStorage: it outlives the tab, unlike impersonation). */
export const loadBrand = (): string | null => {
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
};

export const persistBrand = (value: string | null): void => {
  try {
    if (value) localStorage.setItem(BRAND_STORAGE_KEY, value);
    else localStorage.removeItem(BRAND_STORAGE_KEY);
  } catch {
    /* localStorage unavailable: the brand lasts until reload. */
  }
};

export const createSessionState = (): SessionState => ({ impersonation: loadImpersonation(), brandCode: loadBrand() });

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
    /** Impersonation is per brand (the employee may not exist in the other one), so it ends here. */
    brandSelected: (state, action: PayloadAction<string | null>) => {
      state.brandCode = action.payload;
      state.impersonation = null;
    },
  },
});

export const { impersonationStarted, impersonationEnded, brandSelected } = sessionSlice.actions;
export default sessionSlice.reducer;
