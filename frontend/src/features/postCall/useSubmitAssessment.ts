import { useFormikContext } from 'formik';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { ROUTES } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGenerateNextCallMutation } from '../../redux/api/callsApi';
import {
  assessCategorySelected,
  assessParticipantSelected,
  assessmentSubmitted,
  complianceFlagged,
} from '../../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../../redux/hooks';
import type { ApiError } from '../../types/api';
import type { Category, NextCallFlag } from '../../types/models';
import { additionalKey, itemKey, type AssessmentFormValues } from '../../utils/assessment';

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

interface SubmitDeps {
  callId: string;
  primaryId: string;
  /** "Dr. Winters": named in the confirmation. */
  physicianName: string;
  flush: () => Promise<void>;
}

/**
 * Submit: save, let the server re-check every note and build the next-call
 * plan, then return to Pre-Call Planning with no target open; a toast says
 * where the plan appears and the submitted target's row flashes.
 * 409 highlights the flagged notes; 422 means nothing was answered.
 */
export const useSubmitAssessment = (hcpId: string, { callId, primaryId, physicianName, flush }: SubmitDeps) => {
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
        toast.error(LABELS.postCall.flaggedByServer(flags.length), { id: 'submit' });
        return;
      }
      toast.error(error.status === 422 ? LABELS.postCall.nothingAnswered : error.message, { id: 'submit' });
    },
    [dispatch, primaryId, values],
  );

  const submit = useCallback(async () => {
    setRunning(true);
    try {
      await flush();
      await generate(callId).unwrap();
      // Leave the post-call route first, so it does not re-select the target.
      navigate(ROUTES.PRE_CALL);
      dispatch(assessmentSubmitted(hcpId));
      toast.success(LABELS.postCall.submitted(physicianName, LABELS.tabs.preCall), { id: 'submit', duration: 4200 });
    } catch (error) {
      setRunning(false);
      handleError(error as ApiError);
    }
  }, [callId, dispatch, flush, generate, handleError, hcpId, navigate, physicianName]);

  return { submit, running };
};
