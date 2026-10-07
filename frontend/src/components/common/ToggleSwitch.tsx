import { memo } from 'react';
import { cx } from '../../utils/cx';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name (the switch has no visible text of its own). */
  label: string;
  disabled?: boolean;
}

/** On/off switch: the thumb stays inside a grey (off) or blue (on) track and slides between the two ends. */
const ToggleSwitch = ({ checked, onChange, label, disabled }: ToggleSwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative inline-flex h-[22px] w-10 flex-none cursor-pointer items-center rounded-full border-0 p-0 transition-colors duration-200',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-default disabled:opacity-50',
      checked ? 'bg-blue' : 'bg-[#C3CBD6]',
    )}
  >
    <span
      aria-hidden
      className={cx(
        'absolute left-[3px] top-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(12,28,48,.3)] transition-transform duration-200',
        checked ? 'translate-x-[18px]' : 'translate-x-0',
      )}
    />
  </button>
);

export default memo(ToggleSwitch);
