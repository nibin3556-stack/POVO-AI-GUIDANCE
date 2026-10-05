import { useFormikContext } from 'formik';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { ADDITIONAL_POINT_ID, preCallPath } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useReference } from '../../hooks/useReference';
import { useGenerateNextCallMutation } from '../../redux/api/callsApi';
import {
  assessCategorySelected,
  assessParticipantSelected,
  assessmentSubmitted,
  complianceDialogOpened,
  complianceFlagged,
  pointOpened,
} from '../../redux/callSession/callSessionSlice';
import { useAppDispatch } from '../../redux/hooks';
import type { ApiError } from '../../types/api';
import type { Category, NextCallFlag, Participant } from '../../types/models';
import { additionalKey, itemKey, type AssessmentFormValues } from '../../utils/assessment';

const CATEGORY_ORDER: Category[] = ['messaging', 'objection', 'closing'];

const readFlags = (error: ApiError): NextCallFlag[] => {
  const data = error.data as { flags?: NextCallFlag[] } | null;
  return Array.isArray(data?.flags) ? data.flags : [];
};

/** Maps the server's 409 flags onto the form keys, with the flagged note and its full report. */
export const flagsToEntries = (flags: NextCallFlag[], values: AssessmentFormValues, primaryId: string) =>
  flags.map((f) => {
    const key = f.category === 'additional' ? additionalKey(primaryId) : itemKey(f.participant_id, f.category, f.point_id);
    const formNote = f.category === 'additional' ? values.additional_note : (values.items[key]?.note ?? '');
    return { key, note: (f.note ?? formNote).trim(), chip: f.chip, result: f.result ?? null };
  });

/**
 * Where Call Preparation opens after Submit: the first participant (in pill
 * order) and category with a point raised on this call, so its "Delivered on
 * earlier calls" panel is on screen. Null when only Additional Notes were written.
 */
export const firstAssessed = (values: AssessmentFormValues, participants: Participant[]): { participantId: string; category: Category } | null => {
  const raised = Object.values(values.items).filter((i) => i.was_raised);
  for (const p of participants) {
    for (const category of CATEGORY_ORDER) {
      if (raised.some((i) => i.participant_id === p.hcp_id && i.category === category)) return { participantId: p.hcp_id, category };
    }
  }
  return null;
};

interface SubmitDeps {
  callId: string;
  primaryId: string;
  participants: Participant[];
  /** "Dr. Winters": named in the confirmation. */
  physicianName: string;
  flush: () => Promise<void>;
}

/**
 * Submit: save, let the server re-check every note and build the next-call
 * plan, then return to Pre-Call Planning with the same target selected: Call
 * Preparation opens on what was just assessed (its Delivered on earlier calls),
 * the history shows the new call with its notes, and the target's row flashes.
 * 409 jumps to the first flagged note and opens its report (it travels with the
 * flag); 422 means nothing was answered.
 */
export const useSubmitAssessment = (hcpId: string, { callId, primaryId, participants, physicianName, flush }: SubmitDeps) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const ref = useReference();
  const { values } = useFormikContext<AssessmentFormValues>();
  const [generate] = useGenerateNextCallMutation();
  const [running, setRunning] = useState(false);

  const handleError = useCallback(
    (error: ApiError) => {
      const flags = error.status === 409 ? readFlags(error) : [];
      if (flags.length) {
        const entries = flagsToEntries(flags, values, primaryId);
        dispatch(complianceFlagged(entries));
        const first = flags[0]!;
        const entry = entries[0]!;
        dispatch(assessParticipantSelected(first.category === 'additional' ? primaryId : first.participant_id));
        let context: string = LABELS.postCall.additionalContext;
        if (first.category !== 'additional') {
          const name = participants.find((p) => p.hcp_id === first.participant_id)?.display_name ?? '';
          const rank = values.items[entry.key]?.point_rank ?? 1;
          context = LABELS.postCall.pointContext(ref.categoryLabel(first.category as Category), Math.max(rank, 1), name);
          dispatch(assessCategorySelected(first.category as Category));
          dispatch(pointOpened({ scope: `${first.participant_id}|${first.category}`, pointId: first.point_id === ADDITIONAL_POINT_ID ? null : first.point_id }));
        }
        if (entry.result) dispatch(complianceDialogOpened({ key: entry.key, context }));
        toast.error(LABELS.postCall.flaggedByServer(flags.length), { id: 'submit' });
        return;
      }
      toast.error(error.status === 422 ? LABELS.postCall.nothingAnswered : error.message, { id: 'submit' });
    },
    [dispatch, participants, primaryId, ref, values],
  );

  const submit = useCallback(async () => {
    setRunning(true);
    try {
      await flush();
      await generate(callId).unwrap();
      const open = firstAssessed(values, participants);
      dispatch(assessmentSubmitted({ hcpId, participantId: open?.participantId ?? primaryId, category: open?.category ?? null }));
      navigate(preCallPath(hcpId));
      toast.success(LABELS.postCall.submitted(physicianName), { id: 'submit', duration: 4200 });
    } catch (error) {
      setRunning(false);
      handleError(error as ApiError);
    }
  }, [callId, dispatch, flush, generate, handleError, hcpId, navigate, participants, physicianName, primaryId, values]);

  return { submit, running };
};
