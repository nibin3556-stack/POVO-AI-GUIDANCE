import * as Yup from 'yup';
import { EMPLOYEE_SEARCH_MIN_CHARS } from '../constants/constant';
import { LABELS } from '../constants/labels';

export interface LookupValues {
  q: string;
}

export const lookupInitialValues: LookupValues = { q: '' };

/** A rep name, Employee ID or Network ID: at least 2 characters. */
export const lookupQueryField = Yup.string()
  .trim()
  .required(LABELS.impersonate.required)
  .min(EMPLOYEE_SEARCH_MIN_CHARS, LABELS.impersonate.minChars);

export const impersonationLookupSchema = Yup.object({ q: lookupQueryField });
