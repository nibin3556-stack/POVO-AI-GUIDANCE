import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';

export const selectImpersonation = (state: RootState) => state.session.impersonation;

export const selectImpersonatedEmployeeId = createSelector(selectImpersonation, (imp) => imp?.employeeId ?? null);

export const selectIsImpersonating = createSelector(selectImpersonation, (imp) => imp !== null);
