import { TextField } from '@mui/material';
import { useField } from 'formik';
import { memo, type FocusEvent } from 'react';
import { COLORS } from '../../constants/colors';

interface FormTextAreaProps {
  name: string;
  placeholder?: string;
  maxLength?: number;
  minRows?: number;
  ariaLabel: string;
  onBlur?: (value: string) => void;
  tone?: 'default' | 'flagged' | 'passed';
}

const TONE_SX = {
  default: {},
  flagged: {
    '& .MuiOutlinedInput-root': { backgroundColor: '#FEF2F2', color: '#7F1D1D' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.red} !important` },
  },
  passed: { '& .MuiOutlinedInput-notchedOutline': { borderColor: '#86D3A0' } },
};

/** Multi-line MUI TextField bound to Formik. */
const FormTextArea = ({ name, placeholder, maxLength, minRows = 3, ariaLabel, onBlur, tone = 'default' }: FormTextAreaProps) => {
  const [field, meta] = useField<string>(name);
  const hasError = meta.touched && Boolean(meta.error);
  const handleBlur = (event: FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    field.onBlur(event);
    onBlur?.(event.target.value);
  };
  return (
    <TextField
      {...field}
      value={field.value ?? ''}
      onBlur={handleBlur}
      multiline
      minRows={minRows}
      fullWidth
      placeholder={placeholder}
      error={hasError}
      helperText={hasError ? meta.error : undefined}
      sx={{ '& .MuiOutlinedInput-root': { backgroundColor: '#FCFDFE', fontSize: 14.3 }, ...TONE_SX[tone] }}
      slotProps={{ htmlInput: { maxLength, 'aria-label': ariaLabel } }}
    />
  );
};

export default memo(FormTextArea);
