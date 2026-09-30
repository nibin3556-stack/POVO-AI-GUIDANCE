import { Checkbox, FormControlLabel } from '@mui/material';
import { useField } from 'formik';
import { memo, type ReactNode } from 'react';

interface FormCheckboxProps {
  name: string;
  label: ReactNode;
  onToggle?: (checked: boolean) => void;
}

/** MUI Checkbox bound to a boolean Formik field. */
const FormCheckbox = ({ name, label, onToggle }: FormCheckboxProps) => {
  const [field, , helpers] = useField<boolean>({ name, type: 'checkbox' });
  return (
    <FormControlLabel
      label={label}
      control={
        <Checkbox
          checked={Boolean(field.value)}
          onChange={(_e, checked) => {
            void helpers.setValue(checked);
            onToggle?.(checked);
          }}
          size="small"
          color="success"
        />
      }
    />
  );
};

export default memo(FormCheckbox);
