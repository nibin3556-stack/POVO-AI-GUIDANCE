import * as Yup from 'yup';

export interface BrandFormValues {
  brand_code: string;
  brand_name: string;
}

export const brandInitialValues: BrandFormValues = { brand_code: '', brand_name: '' };

/** Same rule as the backend: a letter first, then letters, digits or _ (2 to 20). */
export const brandSchema = Yup.object({
  brand_code: Yup.string()
    .trim()
    .required('Enter a brand code')
    .matches(/^[A-Za-z][A-Za-z0-9_]{1,19}$/, 'Use 2 to 20 letters, digits or _, starting with a letter'),
  brand_name: Yup.string().trim().required('Enter a brand name').max(80, 'Keep the name to 80 characters'),
});
