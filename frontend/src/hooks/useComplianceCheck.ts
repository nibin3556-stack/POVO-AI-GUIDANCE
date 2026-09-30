import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useStore } from 'react-redux';
import { TIMING } from '../constants/constant';
import { LABELS } from '../constants/labels';
import { useCheckComplianceMutation } from '../redux/api/callsApi';
import {
  complianceChecked,
  complianceChecking,
  complianceCleared,
  complianceDialogOpened,
} from '../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../redux/hooks';
import type { RootState } from '../redux/store';
import type { AssessmentCategory } from '../types/models';
import { delay } from '../utils/format';

export interface CheckTarget {
  key: string;
  participant_id: string;
  category: AssessmentCategory;
  point_id: string;
  point_text: string;
  note: string;
  /** Shown in the report header, e.g. "Suggested Messaging note # 2 for Dr. Winters". */
  context: string;
}

export interface CheckOptions {
  /** Do not pop the report (e.g. after Use Suggestion). */
  silent?: boolean;
  /** Re-run even if this exact text was already checked; always pop the report. */
  force?: boolean;
}

/**
 * Runs the AI compliance check for one note: at least 600ms of spinner, then
 * the result. A flagged note pops the report once per text (like the POC).
 */
export const useComplianceCheck = (callId: string | null) => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [check] = useCheckComplianceMutation();

  return useCallback(
    async (target: CheckTarget, options: CheckOptions = {}) => {
      const note = target.note.trim();
      if (!note) {
        dispatch(complianceCleared(target.key));
        return;
      }
      const existing = store.getState().callSession.compliance[target.key];
      if (!options.force && existing && existing.note === note && existing.status !== 'checking') return;
      dispatch(complianceChecking({ key: target.key, note }));
      try {
        const [result] = await Promise.all([
          check({
            call_id: callId,
            participant_id: target.participant_id,
            category: target.category,
            point_id: target.point_id,
            point_text: target.point_text,
            note,
          }).unwrap(),
          delay(TIMING.COMPLIANCE_MIN_SPINNER_MS),
        ]);
        const current = store.getState().callSession.compliance[target.key];
        if (current?.note !== note) return; // the note changed while the check ran
        dispatch(complianceChecked({ key: target.key, note, result }));
        const alreadyShown = current.alertedNote === note && !options.force;
        if (result.status === 'flagged' && !options.silent && !alreadyShown) {
          dispatch(complianceDialogOpened({ key: target.key, context: target.context }));
        }
      } catch {
        dispatch(complianceCleared(target.key));
        toast.error(LABELS.postCall.checkFailed, { id: 'compliance-failed' });
      }
    },
    [callId, check, dispatch, store],
  );
};
