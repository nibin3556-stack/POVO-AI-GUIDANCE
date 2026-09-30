import { Popover } from '@mui/material';
import { memo, useState, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import CheckMark from './CheckMark';
import Icon from './Icon';

export interface DropdownOption {
  value: string;
  label: ReactNode;
}

interface MultiSelectDropdownProps {
  label: string;
  options: DropdownOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

/** Checkbox multi-select dropdown (POC `.dd`): a button with a count badge, a floating option list. */
const MultiSelectDropdown = ({ label, options, selected, onToggle }: MultiSelectDropdownProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const count = selected.length;
  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  return (
    <>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={Boolean(anchor)}
        onClick={open}
        className={cx(
          'inline-flex items-center gap-[5px] rounded-lg border-[1.5px] py-[3px] pl-[9px] pr-[5px] text-[12.2px] font-semibold text-blued hover:border-blue',
          count || anchor ? 'border-blue bg-bluet' : 'border-bluet2 bg-white',
        )}
      >
        {label}
        {count > 0 && <b className="rounded-full bg-blue px-1.5 text-[11px] text-white">{count}</b>}
        <Icon name="expand_more" className="text-lg" />
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.6, p: 0.6, minWidth: 250, maxWidth: 340, maxHeight: 320 } } }}
      >
        <div role="listbox" aria-multiselectable="true" aria-label={label} className="flex flex-col">
          {options.map((option) => {
            const on = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onToggle(option.value)}
                className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[13px] font-medium leading-[1.3] text-ink2 hover:bg-bluet"
              >
                <CheckMark checked={on} />
                <span className="flex flex-wrap items-center gap-1.5">{option.label}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </>
  );
};

export default memo(MultiSelectDropdown);
