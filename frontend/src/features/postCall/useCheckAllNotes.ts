import { useFormikContext } from 'formik';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from 'react-redux';
import { ADDITIONAL_POINT_ID } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import type { CheckTarget } from '../../hooks/useComplianceCheck';
import { useReference } from '../../hooks/useReference';
import {
  assessCategorySelected,
  assessParticipantSelected,
  complianceDialogOpened,
  pointOpened,
} from '../../redux/callSession/callSessionSlice';
import type { ComplianceEntry } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../../redux/hooks';
import type { RootState } from '../../redux/store';
import type { Category } from '../../types/models';
import { additionalKey, type AssessmentFormValues } from '../../utils/assessment';
import { useAssessment } from './AssessmentContext';

const P = LABELS.postCall;

/** Already AI-checked for exactly this text: nothing to re-run. A rules-only result (AI was unavailable) is re-run. */
const isFresh = (entry: ComplianceEntry | undefined, note: string): boolean =>
  Boolean(entry && entry.status !== 'checking' && entry.note === note && entry.result && entry.result.engine !== 'rules');

/**
 * "AI checks every note for compliance": runs the AI check on every written
 * note of this call (all participants, all categories, Additional Notes) in
 * one go, quietly, then reports the outcome. A flag jumps the form to the
 * first flagged note and opens its report.
 */
export const useCheckAllNotes = () => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const ref = useReference();
  const { primaryId, participants, runCheck, flush } = useAssessment();
  const { values } = useFormikContext<AssessmentFormValues>();
  const [running, setRunning] = useState(0);

  const run = useCallback(async () => {
    const names = new Map(participants.map((p) => [p.hcp_id, p.display_name]));
    const targets: CheckTarget[] = Object.entries(values.items)
      .filter(([, item]) => names.has(item.participant_id) && item.note.trim())
      .map(([key, item]) => ({
        key,
        participant_id: item.participant_id,
        category: item.category,
        point_id: item.point_id,
        point_text: item.point_text,
        note: item.note,
        context: P.pointContext(ref.categoryLabel(item.category), Math.max(item.point_rank, 1), names.get(item.participant_id) ?? ''),
      }));
    if (values.additional_note.trim()) {
      targets.push({
        key: additionalKey(primaryId),
        participant_id: primaryId,
        category: 'additional',
        point_id: ADDITIONAL_POINT_ID,
        point_text: '',
        note: values.additional_note,
        context: P.additionalContext,
      });
    }
    if (!targets.length) {
      toast(P.checkAllEmpty, { id: 'check-all' });
      return;
    }

    const stale = targets.filter((t) => !isFresh(store.getState().callSession.compliance[t.key], t.note.trim()));
    setRunning(targets.length);
    try {
      // Save first: the server attaches each result to the stored note with the same text.
      await flush();
      await Promise.all(stale.map((t) => runCheck(t, { force: true, silent: true })));
    } finally {
      setRunning(0);
    }

    const state = store.getState().callSession.compliance;
    const done = targets.filter((t) => state[t.key]?.note === t.note.trim() && state[t.key]?.status !== 'checking');
    if (done.length < targets.length) return; // a check failed: its own toast already says so
    const flagged = done.filter((t) => state[t.key]?.status === 'flagged');
    const first = flagged[0];
    if (!first) {
      toast.success(P.checkAllPassed(done.length), { id: 'check-all' });
      return;
    }
    toast.error(P.checkAllFlagged(done.length, flagged.length), { id: 'check-all' });
    dispatch(assessParticipantSelected(first.participant_id));
    if (first.category !== 'additional') {
      dispatch(assessCategorySelected(first.category as Category));
      dispatch(pointOpened({ scope: `${first.participant_id}|${first.category}`, pointId: first.point_id }));
    }
    dispatch(complianceDialogOpened({ key: first.key, context: first.context }));
  }, [dispatch, flush, participants, primaryId, ref, runCheck, store, values]);

  return { run, running };
};
