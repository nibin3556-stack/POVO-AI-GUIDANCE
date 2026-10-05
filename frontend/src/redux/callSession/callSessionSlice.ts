import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Category,
  ComplianceResult,
  FilterGroup,
  Grain,
  InteractionFilter,
  Period,
  TargetSort,
  TargetSortKey,
} from '../../types/models';
import { EMPTY_FILTERS, nextSort, toggleValue } from '../../utils/targets';

export type DecileView = 'table' | 'chart';

export interface ComplianceEntry {
  status: 'checking' | 'passed' | 'flagged';
  note: string;
  result: ComplianceResult | null;
  /** Chip from a server-side flag (409 on next-call) when no full report is held. */
  chip: string | null;
  /** The note text the modal already popped up for (it pops once per text). */
  alertedNote: string | null;
}

export interface ComplianceDialogState {
  key: string;
  context: string;
}

export interface CallSessionState {
  selectedHcpId: string | null;
  participantIds: string[];
  participantsFor: string | null;
  historyParticipantId: string | null;
  prepParticipantId: string | null;
  prepCategory: Category | null;
  interactionFilter: InteractionFilter;
  revealed: Record<string, true>;
  scrollToPrep: boolean;
  filters: Record<FilterGroup, string[]>;
  sort: TargetSort;
  page: number;
  period: Period;
  grain: Grain;
  decileView: DecileView;
  /** Delivered points the rep marked Reinforce, per `${participantId}|${category}`: added to the post-call list. */
  reinforced: Record<string, string[]>;
  /** The target whose assessment was just submitted: its row flashes in Pre-Call Planning. */
  justSubmittedHcpId: string | null;
  /** The note field a voice note is recording into (Submit waits for it). */
  recordingKey: string | null;
  assessParticipantId: string | null;
  assessCategory: Category;
  openPoints: Record<string, string | null>;
  compliance: Record<string, ComplianceEntry>;
  complianceDialog: ComplianceDialogState | null;
}

export const initialCallSessionState: CallSessionState = {
  selectedHcpId: null,
  participantIds: [],
  participantsFor: null,
  historyParticipantId: null,
  prepParticipantId: null,
  prepCategory: null,
  interactionFilter: 'all',
  revealed: {},
  scrollToPrep: false,
  filters: EMPTY_FILTERS,
  sort: { key: 'hs_patients', direction: 'desc' },
  page: 0,
  period: 'month',
  grain: 'month',
  decileView: 'table',
  reinforced: {},
  justSubmittedHcpId: null,
  recordingKey: null,
  assessParticipantId: null,
  assessCategory: 'messaging',
  openPoints: {},
  compliance: {},
  complianceDialog: null,
};

const resetCall = (state: CallSessionState) => {
  state.historyParticipantId = null;
  state.prepParticipantId = null;
  state.interactionFilter = 'all';
  state.assessParticipantId = null;
  state.assessCategory = 'messaging';
  state.openPoints = {};
  state.compliance = {};
  state.complianceDialog = null;
  state.recordingKey = null;
};

const callSessionSlice = createSlice({
  name: 'callSession',
  initialState: initialCallSessionState,
  reducers: {
    targetSelected: (state, action: PayloadAction<{ hcpId: string; scroll?: boolean }>) => {
      if (state.selectedHcpId === action.payload.hcpId) {
        state.scrollToPrep = state.scrollToPrep || Boolean(action.payload.scroll);
        return;
      }
      state.selectedHcpId = action.payload.hcpId;
      state.participantIds = [];
      state.participantsFor = null;
      state.prepCategory = null;
      state.scrollToPrep = Boolean(action.payload.scroll);
      state.reinforced = {};
      resetCall(state);
    },
    participantsInitialised: (state, action: PayloadAction<{ hcpId: string; ids: string[] }>) => {
      state.participantIds = action.payload.ids;
      state.participantsFor = action.payload.hcpId;
    },
    participantToggled: (state, action: PayloadAction<{ id: string; order: string[] }>) => {
      const { id, order } = action.payload;
      const next = toggleValue(state.participantIds, id);
      state.participantIds = order.filter((p) => next.includes(p));
      resetCall(state);
    },
    historyParticipantSelected: (state, action: PayloadAction<string>) => {
      state.historyParticipantId = action.payload;
      state.interactionFilter = 'all';
    },
    prepParticipantSelected: (state, action: PayloadAction<string>) => {
      state.prepParticipantId = action.payload;
    },
    prepCategorySelected: (state, action: PayloadAction<Category>) => {
      state.prepCategory = action.payload;
    },
    interactionFilterSelected: (state, action: PayloadAction<InteractionFilter>) => {
      state.interactionFilter = action.payload;
    },
    revealCompleted: (state, action: PayloadAction<string>) => {
      state.revealed[action.payload] = true;
    },
    scrollHandled: (state) => {
      state.scrollToPrep = false;
    },
    filterToggled: (state, action: PayloadAction<{ group: FilterGroup; value: string }>) => {
      const { group, value } = action.payload;
      state.filters[group] = toggleValue(state.filters[group], value);
      state.page = 0;
    },
    rolesSet: (state, action: PayloadAction<string[]>) => {
      state.filters.role = action.payload;
      state.page = 0;
    },
    filtersCleared: (state) => {
      state.filters = { ...EMPTY_FILTERS, role: state.filters.role };
      state.page = 0;
    },
    accountsCleared: (state) => {
      state.filters.account = [];
      state.page = 0;
    },
    sortSelected: (state, action: PayloadAction<TargetSortKey>) => {
      state.sort = nextSort(state.sort, action.payload);
      state.page = 0;
    },
    pageSelected: (state, action: PayloadAction<number>) => {
      state.page = Math.max(0, action.payload);
    },
    periodSelected: (state, action: PayloadAction<Period>) => {
      state.period = action.payload;
    },
    grainSelected: (state, action: PayloadAction<Grain>) => {
      state.grain = action.payload;
    },
    decileViewSelected: (state, action: PayloadAction<DecileView>) => {
      state.decileView = action.payload;
    },
    reinforceToggled: (state, action: PayloadAction<{ scope: string; pointId: string }>) => {
      const { scope, pointId } = action.payload;
      state.reinforced[scope] = toggleValue(state.reinforced[scope] ?? [], pointId);
    },
    recordingChanged: (state, action: PayloadAction<string | null>) => {
      state.recordingKey = action.payload;
    },
    assessParticipantSelected: (state, action: PayloadAction<string>) => {
      state.assessParticipantId = action.payload;
    },
    assessCategorySelected: (state, action: PayloadAction<Category>) => {
      state.assessCategory = action.payload;
    },
    pointOpened: (state, action: PayloadAction<{ scope: string; pointId: string | null }>) => {
      state.openPoints[action.payload.scope] = action.payload.pointId;
    },
    complianceChecking: (state, action: PayloadAction<{ key: string; note: string }>) => {
      const prev = state.compliance[action.payload.key];
      state.compliance[action.payload.key] = {
        status: 'checking',
        note: action.payload.note,
        result: null,
        chip: null,
        alertedNote: prev?.alertedNote ?? null,
      };
    },
    complianceChecked: (state, action: PayloadAction<{ key: string; note: string; result: ComplianceResult }>) => {
      const { key, note, result } = action.payload;
      const prev = state.compliance[key];
      state.compliance[key] = {
        status: result.status,
        note,
        result,
        chip: result.issues[0]?.chip ?? null,
        alertedNote: prev?.alertedNote ?? null,
      };
    },
    complianceCleared: (state, action: PayloadAction<string>) => {
      delete state.compliance[action.payload];
    },
    /** Flags from Submit (409). Each carries its full report when the server sends it, so the report opens without a new check. */
    complianceFlagged: (state, action: PayloadAction<{ key: string; note: string; chip: string; result?: ComplianceResult | null }[]>) => {
      action.payload.forEach(({ key, note, chip, result }) => {
        state.compliance[key] = { status: 'flagged', note, result: result ?? null, chip, alertedNote: null };
      });
    },
    complianceDialogOpened: (state, action: PayloadAction<ComplianceDialogState>) => {
      state.complianceDialog = action.payload;
      const entry = state.compliance[action.payload.key];
      if (entry) entry.alertedNote = entry.note;
    },
    complianceDialogClosed: (state) => {
      state.complianceDialog = null;
    },
    /**
     * Submit done: back to Pre-Call Planning with the same target selected. Call
     * Preparation and the history open on what was just assessed (so "Delivered
     * on earlier calls" and the new call's notes are on screen); the row flashes.
     */
    assessmentSubmitted: (state, action: PayloadAction<{ hcpId: string; participantId: string; category: Category | null }>) => {
      const { hcpId, participantId, category } = action.payload;
      resetCall(state);
      state.selectedHcpId = hcpId;
      state.prepParticipantId = participantId;
      state.historyParticipantId = participantId;
      if (category) state.prepCategory = category;
      state.scrollToPrep = true;
      state.reinforced = {};
      state.justSubmittedHcpId = hcpId;
    },
    submittedFlashDone: (state) => {
      state.justSubmittedHcpId = null;
    },
    callSessionReset: () => initialCallSessionState,
  },
});

export const {
  targetSelected,
  participantsInitialised,
  participantToggled,
  historyParticipantSelected,
  prepParticipantSelected,
  prepCategorySelected,
  interactionFilterSelected,
  revealCompleted,
  scrollHandled,
  filterToggled,
  filtersCleared,
  accountsCleared,
  rolesSet,
  sortSelected,
  pageSelected,
  periodSelected,
  grainSelected,
  decileViewSelected,
  reinforceToggled,
  recordingChanged,
  assessParticipantSelected,
  assessCategorySelected,
  pointOpened,
  complianceChecking,
  complianceChecked,
  complianceCleared,
  complianceFlagged,
  complianceDialogOpened,
  complianceDialogClosed,
  assessmentSubmitted,
  submittedFlashDone,
  callSessionReset,
} = callSessionSlice.actions;

export default callSessionSlice.reducer;
