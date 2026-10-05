import { InputAdornment, TextField, type TextFieldProps } from '@mui/material';
import { useField } from 'formik';
import { memo, type FocusEvent, type KeyboardEvent, type Ref } from 'react';
import { COLORS } from '../../constants/colors';
import Icon from '../common/Icon';

export interface FormInputProps {
  name: string;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  /** Material Symbols icon shown at the start (e.g. "edit_note"). */
  startIcon?: string;
  /** Enter submits a single-line field to this callback instead of the form. */
  onEnter?: (value: string) => void;
  onBlur?: (value: string) => void;
  /** Red "flagged by compliance" look. */
  flagged?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  ariaLabel?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  size?: TextFieldProps['size'];
  /** Replaces the placeholder for a moment (e.g. "Listening…" while a voice note records). */
  placeholderOverride?: string;
}

const flaggedSx = {
  '& .MuiOutlinedInput-root': { backgroundColor: '#FEF2F2', color: '#7F1D1D' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: `${COLORS.red} !important` },
};

/** MUI TextField bound to Formik (`useField`): error text shows once touched. */
const FormInput = ({ name, label, placeholder, maxLength, startIcon, onEnter, onBlur, flagged, inputRef, ariaLabel, autoFocus, autoComplete = 'off', size = 'small', placeholderOverride }: FormInputProps) => {
  const [field, meta] = useField<string>(name);
  const hasError = meta.touched && Boolean(meta.error);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !onEnter) return;
    event.preventDefault();
    onEnter(field.value ?? '');
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    field.onBlur(event);
    onBlur?.(event.target.value);
  };

  return (
    <TextField
      {...field}
      value={field.value ?? ''}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      label={label}
      placeholder={placeholderOverride ?? placeholder}
      error={hasError}
      helperText={hasError ? meta.error : undefined}
      fullWidth
      size={size}
      autoFocus={autoFocus}
      inputRef={inputRef}
      autoComplete={autoComplete}
      sx={flagged ? flaggedSx : undefined}
      slotProps={{
        htmlInput: { maxLength, 'aria-label': ariaLabel ?? label ?? placeholder },
        input: startIcon
          ? {
              startAdornment: (
                <InputAdornment position="start">
                  <Icon name={startIcon} className="text-[20px] text-[#5B6B80]" />
                </InputAdornment>
              ),
            }
          : undefined,
      }}
    />
  );
};

export default memo(FormInput);
