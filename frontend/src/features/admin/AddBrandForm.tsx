import { Form, Formik, type FormikHelpers } from 'formik';
import { memo, useState } from 'react';
import toast from 'react-hot-toast';
import AppButton from '../../components/common/AppButton';
import Icon from '../../components/common/Icon';
import FormInput from '../../components/forms/FormInput';
import { LABELS } from '../../constants/labels';
import { useSaveBrandMutation } from '../../redux/api/adminApi';
import { brandInitialValues, brandSchema, type BrandFormValues } from '../../schemas/brandSchema';
import type { ApiError } from '../../types/api';

interface AddBrandFormProps {
  onAdded: (code: string) => void;
}

const A = LABELS.admin;

/** Darker field borders: the panel is tinted, so the default light outline would disappear. */
const FIELDS = '[&_.MuiOutlinedInput-notchedOutline]:border-[#9FB3C8] [&_.Mui-focused_.MuiOutlinedInput-notchedOutline]:border-blue';

/** Register a brand ahead of its data (or rename one): starts with every feature off. Collapsed to a button until asked for. */
const AddBrandForm = ({ onAdded }: AddBrandFormProps) => {
  const [open, setOpen] = useState(false);
  const [save, { isLoading }] = useSaveBrandMutation();
  const submit = async (values: BrandFormValues, helpers: FormikHelpers<BrandFormValues>) => {
    try {
      const brand = await save({ brand_code: values.brand_code.trim(), brand_name: values.brand_name.trim(), is_active: true }).unwrap();
      helpers.resetForm();
      setOpen(false);
      toast.success(A.brandAdded(brand.name));
      onAdded(brand.code);
    } catch (e) {
      toast.error((e as ApiError).message || LABELS.app.genericError);
    }
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border-[1.5px] border-dashed border-[#9FB3C8] bg-white px-3 py-2 text-[13.4px] font-semibold text-blued transition-colors hover:border-blue hover:bg-bluet"
      >
        <Icon name="add" className="text-lg" />
        {A.addBrand}
      </button>
    );

  return (
    <Formik initialValues={brandInitialValues} validationSchema={brandSchema} onSubmit={submit}>
      {({ resetForm }) => (
        <Form noValidate aria-label={A.newBrand} className={`flex flex-col gap-3 rounded-[11px] border-[1.5px] border-[#9EC2E4] bg-[#F4F9FD] p-3 ${FIELDS}`}>
          <header className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue text-white">
              <Icon name="add_business" className="text-[17px]" />
            </span>
            <b className="text-[14px] font-bold text-navyd">{A.newBrand}</b>
          </header>
          <div className="flex flex-col gap-1">
            <span className="text-[12.4px] font-semibold text-ink2">{A.brandCode}</span>
            <FormInput name="brand_code" placeholder={A.brandCodePlaceholder} ariaLabel={A.brandCode} maxLength={20} autoFocus />
            <span className="text-[11.6px] font-medium text-ink3">{A.brandCodeHint}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[12.4px] font-semibold text-ink2">{A.brandName}</span>
            <FormInput name="brand_name" placeholder={A.brandNamePlaceholder} ariaLabel={A.brandName} maxLength={80} />
          </div>
          <p className="m-0 flex gap-1.5 text-[11.6px] font-medium leading-[1.4] text-ink3">
            <Icon name="info" className="text-[15px]" />
            {A.newBrandNote}
          </p>
          <div className="flex justify-end gap-2">
            <AppButton
              icon="close"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              disabled={isLoading}
            >
              {A.cancel}
            </AppButton>
            <AppButton type="submit" variant="primary" icon="check" disabled={isLoading}>
              {isLoading ? A.adding : A.createBrand}
            </AppButton>
          </div>
        </Form>
      )}
    </Formik>
  );
};

export default memo(AddBrandForm);
