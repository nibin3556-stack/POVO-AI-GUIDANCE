import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { TIMING } from '../constants/constant';
import { LABELS } from '../constants/labels';
import { useSaveAssessmentsMutation } from '../redux/api/callsApi';
import { changedInputs, type AssessmentFormValues } from '../utils/assessment';

/**
 * Autosave for the assessment form: 800ms after the last change, PUT only the
 * rows that changed since the last successful save. `flush()` saves at once
 * (before a compliance re-check or the next-call CTA).
 */
export const useAutoSaveAssessment = (
  callId: string,
  primaryId: string,
  values: AssessmentFormValues,
  initial: AssessmentFormValues,
) => {
  const [save] = useSaveAssessmentsMutation();
  const saved = useRef(initial);
  const latest = useRef(values);

  useEffect(() => {
    latest.current = values;
  }, [values]);

  const flush = useCallback(async () => {
    const snapshot = latest.current;
    const items = changedInputs(saved.current, snapshot, primaryId);
    if (!items.length) return;
    try {
      await save({ callId, items }).unwrap();
      saved.current = snapshot;
    } catch {
      toast.error(LABELS.postCall.saveFailed, { id: 'autosave-failed' });
    }
  }, [callId, primaryId, save]);

  useEffect(() => {
    if (values === saved.current) return undefined;
    const timer = setTimeout(() => void flush(), TIMING.AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [values, flush]);

  return flush;
};
