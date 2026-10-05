import { ADDITIONAL_POINT_ID } from '../constants/constant';
import type { AssessmentInput, Call, Category, Reception, TalkingPoint } from '../types/models';

export interface AssessmentItemValues {
  participant_id: string;
  category: Category;
  point_id: string;
  point_rank: number;
  point_text: string;
  was_raised: boolean;
  reception: Reception | null;
  note: string;
}

export interface AssessmentFormValues {
  items: Record<string, AssessmentItemValues>;
  additional_note: string;
}

export const itemKey = (participantId: string, category: string, pointId: string): string =>
  `${participantId}|${category}|${pointId}`;

export const additionalKey = (primaryId: string): string => itemKey(primaryId, 'additional', ADDITIONAL_POINT_ID);

export const newItem = (participantId: string, category: Category, point: TalkingPoint): AssessmentItemValues => ({
  participant_id: participantId,
  category,
  point_id: point.point_id,
  point_rank: point.rank,
  point_text: point.text,
  was_raised: false,
  reception: null,
  note: '',
});

/** Server call → Formik initial values. The additional note is stored under the primary HCP. */
export const callToFormValues = (call: Call | undefined): AssessmentFormValues => {
  const values: AssessmentFormValues = { items: {}, additional_note: '' };
  call?.assessments.forEach((a) => {
    if (a.category === 'additional') {
      values.additional_note = a.note;
      return;
    }
    values.items[itemKey(a.participant_id, a.category, a.point_id)] = {
      participant_id: a.participant_id,
      category: a.category,
      point_id: a.point_id,
      point_rank: a.point_rank,
      point_text: a.point_text,
      was_raised: a.was_raised,
      reception: a.reception,
      note: a.note,
    };
  });
  return values;
};

const additionalInput = (primaryId: string, note: string): AssessmentInput => ({
  participant_id: primaryId,
  category: 'additional',
  point_id: ADDITIONAL_POINT_ID,
  point_rank: 0,
  point_text: '',
  was_raised: note.trim().length > 0,
  reception: null,
  note,
});

export const toInputs = (values: AssessmentFormValues, primaryId: string): AssessmentInput[] => [
  ...Object.values(values.items),
  additionalInput(primaryId, values.additional_note),
];

/** Only the rows that changed since the last save, for the autosave PUT. */
export const changedInputs = (
  previous: AssessmentFormValues,
  next: AssessmentFormValues,
  primaryId: string,
): AssessmentInput[] => {
  const changed: AssessmentInput[] = Object.entries(next.items)
    .filter(([key, item]) => JSON.stringify(previous.items[key]) !== JSON.stringify(item))
    .map(([, item]) => item);
  if (previous.additional_note !== next.additional_note) changed.push(additionalInput(primaryId, next.additional_note));
  return changed;
};

export const countAnswered = (values: AssessmentFormValues, participantId: string, category?: Category): number =>
  Object.values(values.items).filter(
    (i) => i.participant_id === participantId && i.was_raised && (!category || i.category === category),
  ).length;

export const anyAnswered = (values: AssessmentFormValues): boolean => Object.values(values.items).some((i) => i.was_raised);
