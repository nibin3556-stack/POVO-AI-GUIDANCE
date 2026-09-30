import * as Yup from 'yup';
import { ADDITIONAL_NOTE_MAX_LENGTH, NOTE_MAX_LENGTH } from '../constants/constant';
import { LABELS } from '../constants/labels';
import type { AssessmentFormValues, AssessmentItemValues } from '../utils/assessment';

export const noteField = Yup.string().max(NOTE_MAX_LENGTH, LABELS.postCall.noteTooLong(NOTE_MAX_LENGTH));

export const additionalNoteField = Yup.string().max(ADDITIONAL_NOTE_MAX_LENGTH, LABELS.postCall.noteTooLong(ADDITIONAL_NOTE_MAX_LENGTH));

export const assessmentItemSchema: Yup.ObjectSchema<AssessmentItemValues> = Yup.object({
  participant_id: Yup.string().required(),
  category: Yup.mixed<AssessmentItemValues['category']>().oneOf(['messaging', 'objection', 'closing']).required(),
  point_id: Yup.string().required(),
  point_rank: Yup.number().integer().min(0).required(),
  point_text: Yup.string().defined(),
  was_raised: Yup.boolean().required(),
  reception: Yup.mixed<0 | 1 | 2>().oneOf([0, 1, 2]).nullable().defined(),
  note: noteField.defined(),
});

/** Items are a record keyed by participant|category|point, so each key is validated lazily. */
export const assessmentSchema = Yup.object({
  items: Yup.lazy((items: Record<string, unknown> | undefined) =>
    Yup.object(Object.fromEntries(Object.keys(items ?? {}).map((key) => [key, assessmentItemSchema]))),
  ),
  additional_note: additionalNoteField.defined(),
}) as unknown as Yup.ObjectSchema<AssessmentFormValues>;
