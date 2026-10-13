import { createSelector } from '@reduxjs/toolkit';
import { TARGETS_PAGE_SIZE } from '../../constants/constant';
import type { TargetQuery } from '../../types/models';
import { countActiveFilters, sortParam } from '../../utils/targets';
import type { RootState } from '../store';

export const selectCallSession = (state: RootState) => state.callSession;
export const selectSelectedHcpId = (state: RootState) => state.callSession.selectedHcpId;
export const selectParticipantIds = (state: RootState) => state.callSession.participantIds;
export const selectParticipantsFor = (state: RootState) => state.callSession.participantsFor;
export const selectPrepCategory = (state: RootState) => state.callSession.prepCategory;
export const selectRevealed = (state: RootState) => state.callSession.revealed;
export const selectFilters = (state: RootState) => state.callSession.filters;
export const selectSort = (state: RootState) => state.callSession.sort;
export const selectPage = (state: RootState) => state.callSession.page;
export const selectAssessedHcpIds = (state: RootState) => state.callSession.assessedHcpIds;
export const selectCompliance = (state: RootState) => state.callSession.compliance;
export const selectComplianceDialog = (state: RootState) => state.callSession.complianceDialog;
export const selectAssessCategory = (state: RootState) => state.callSession.assessCategory;
export const selectOpenPoints = (state: RootState) => state.callSession.openPoints;

export const selectTargetQuery = createSelector(
  [selectFilters, selectSort, selectPage],
  (filters, sort, page): TargetQuery => ({ filters, page: page + 1, limit: TARGETS_PAGE_SIZE, sort: sortParam(sort) }),
);

export const selectActiveFilterCount = createSelector(selectFilters, (filters) => countActiveFilters(filters));

/** Participants in Tab 2/3 order: the primary HCP first. */
export const selectActiveParticipantId = createSelector(
  [selectParticipantIds, (state: RootState) => state.callSession.assessParticipantId],
  (ids, chosen) => (chosen && ids.includes(chosen) ? chosen : (ids[0] ?? null)),
);

export const selectFlagCount = createSelector(
  selectCompliance,
  (entries) => Object.values(entries).filter((e) => e.status === 'flagged').length,
);

export const selectFlaggedKeys = createSelector(selectCompliance, (entries) =>
  Object.entries(entries)
    .filter(([, e]) => e.status === 'flagged')
    .map(([key]) => key),
);

export const selectComplianceEntry = (key: string) => (state: RootState) => state.callSession.compliance[key];
