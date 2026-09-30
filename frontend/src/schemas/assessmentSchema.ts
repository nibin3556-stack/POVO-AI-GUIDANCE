import * as Yup from 'yup';
import { LABELS } from '../constants/labels';
import type { Reference } from '../types/models';
import type { AssessmentFormValues, AssessmentItemValues } from '../utils/assessment';

type Limits = Reference['limits'];

/** A note capped at the backend's limit (GET /api/v1/reference `limits`). */
export const noteField = (max: number) => Yup.string().max(max, LABELS.postCall.noteTooLong(max));

export const buildAssessmentItemSchema = (limits: Limits): Yup.ObjectSchema<AssessmentItemValues> =>
  Yup.object({
    participant_id: Yup.string().required(),
    category: Yup.mixed<AssessmentItemValues['category']>().oneOf(['messaging', 'objection', 'closing']).required(),
    point_id: Yup.string().required(),
    point_rank: Yup.number().integer().min(0).required(),
    point_text: Yup.string().defined(),
    was_raised: Yup.boolean().required(),
    reception: Yup.mixed<0 | 1 | 2>().oneOf([0, 1, 2]).nullable().defined(),
    note: noteField(limits.note_max_length).defined(),
  });

/** Items are a record keyed by participant|category|point, so each key is validated lazily. */
export const buildAssessmentSchema = (limits: Limits): Yup.ObjectSchema<AssessmentFormValues> => {
  const item = buildAssessmentItemSchema(limits);
  return Yup.object({
    items: Yup.lazy((items: Record<string, unknown> | undefined) =>
      Yup.object(Object.fromEntries(Object.keys(items ?? {}).map((key) => [key, item]))),
    ),
    additional_note: noteField(limits.additional_note_max_length).defined(),
  }) as unknown as Yup.ObjectSchema<AssessmentFormValues>;
};
