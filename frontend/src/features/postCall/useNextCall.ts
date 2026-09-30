import { useFormikContext } from 'formik';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { TIMING, preCallPath } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGenerateNextCallMutation } from '../../redux/api/callsApi';
import {
  assessCategorySelected,
  assessParticipantSelected,
  complianceFlagged,
  nextCallCompleted,
} from '../../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../../redux/hooks';
import type { ApiError } from '../../types/api';
import type { Category, NextCallFlag } from '../../types/models';
import { additionalKey, itemKey, type AssessmentFormValues } from '../../utils/assessment';
import { delay } from '../../utils/format';

export const NEXT_CALL_DURATION_MS = TIMING.NEXT_CALL_STEP_MS * 3 + TIMING.NEXT_CALL_FINISH_MS;

const readFlags = (error: ApiError): NextCallFlag[] => {
  const data = error.data as { flags?: NextCallFlag[] } | null;
  return Array.isArray(data?.flags) ? data.flags : [];
};

/** Maps the server's 409 flags onto the form keys, with the note that was flagged. */
export const flagsToEntries = (flags: NextCallFlag[], values: AssessmentFormValues, primaryId: string) =>
  flags.map((f) => {
    const key = f.category === 'additional' ? additionalKey(primaryId) : itemKey(f.participant_id, f.category, f.point_id);
    const note = f.category === 'additional' ? values.additional_note : (values.items[key]?.note ?? '');
    return { key, note: note.trim(), chip: f.chip };
  });

interface NextCallDeps {
  callId: string;
  primaryId: string;
  flush: () => Promise<void>;
}

/**
 * "AI Suggestions for Next Call": save, run the 3-step stepper while the server
 * re-checks every note and builds the revision, then return to Tab 2.
 * 409 highlights the flagged notes; 422 means nothing was answered.
 */
export const useNextCall = (hcpId: string, { callId, primaryId, flush }: NextCallDeps) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { values } = useFormikContext<AssessmentFormValues>();
  const [generate] = useGenerateNextCallMutation();
  const [running, setRunning] = useState(false);

  const handleError = useCallback(
    (error: ApiError) => {
      const flags = error.status === 409 ? readFlags(error) : [];
      if (flags.length) {
        dispatch(complianceFlagged(flagsToEntries(flags, values, primaryId)));
        const first = flags.find((f) => f.category !== 'additional');
        if (first) {
          dispatch(assessParticipantSelected(first.participant_id));
          dispatch(assessCategorySelected(first.category as Category));
        }
        toast.error(LABELS.postCall.flaggedByServer(flags.length), { id: 'next-call' });
        return;
      }
      toast.error(error.status === 422 ? LABELS.postCall.nothingAnswered : error.message, { id: 'next-call' });
    },
    [dispatch, primaryId, values],
  );

  const run = useCallback(async () => {
    setRunning(true);
    const started = Date.now();
    try {
      await flush();
      await generate(callId).unwrap();
      await delay(Math.max(0, NEXT_CALL_DURATION_MS - (Date.now() - started)));
      dispatch(nextCallCompleted());
      navigate(preCallPath(hcpId));
    } catch (error) {
      setRunning(false);
      handleError(error as ApiError);
    }
  }, [callId, dispatch, flush, generate, handleError, hcpId, navigate]);

  return { run, running };
};
