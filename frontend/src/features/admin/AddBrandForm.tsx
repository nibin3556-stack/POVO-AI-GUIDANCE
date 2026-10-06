import { Button } from '@mui/material';
import { Form, Formik, type FormikHelpers } from 'formik';
import { memo } from 'react';
import toast from 'react-hot-toast';
import FormInput from '../../components/forms/FormInput';
import { LABELS } from '../../constants/labels';
import { useSaveBrandMutation } from '../../redux/api/adminApi';
import { brandInitialValues, brandSchema, type BrandFormValues } from '../../schemas/brandSchema';
import type { ApiError } from '../../types/api';

interface AddBrandFormProps {
  onAdded: (code: string) => void;
}

const A = LABELS.admin;

/** Register a brand ahead of its data (or rename one): starts with every feature off. */
const AddBrandForm = ({ onAdded }: AddBrandFormProps) => {
  const [save, { isLoading }] = useSaveBrandMutation();
  const submit = async (values: BrandFormValues, helpers: FormikHelpers<BrandFormValues>) => {
    try {
      const brand = await save({ brand_code: values.brand_code.trim(), brand_name: values.brand_name.trim(), is_active: true }).unwrap();
      helpers.resetForm();
      toast.success(A.saved);
      onAdded(brand.code);
    } catch (e) {
      toast.error((e as ApiError).message || LABELS.app.genericError);
    }
  };
  return (
    <Formik initialValues={brandInitialValues} validationSchema={brandSchema} onSubmit={submit}>
      <Form noValidate className="flex flex-col gap-2 border-t border-dashed border-line2 pt-3">
        <b className="text-[12.4px] font-bold uppercase tracking-[.6px] text-navyd">{A.addBrand}</b>
        <FormInput name="brand_code" label={A.brandCode} ariaLabel={A.brandCode} maxLength={20} />
        <span className="-mt-1 text-[11.6px] font-medium text-ink3">{A.brandCodeHint}</span>
        <FormInput name="brand_name" label={A.brandName} ariaLabel={A.brandName} maxLength={80} />
        <span className="text-[11.6px] font-medium text-ink3">{A.newBrandNote}</span>
        <Button type="submit" variant="contained" disabled={isLoading} sx={{ alignSelf: 'flex-start' }}>
          {isLoading ? A.saving : A.addBrand}
        </Button>
      </Form>
    </Formik>
  );
};

export default memo(AddBrandForm);
