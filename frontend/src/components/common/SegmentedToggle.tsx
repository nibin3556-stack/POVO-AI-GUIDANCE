import { memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

export interface ToggleOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Small count badge after the label. */
  count?: number;
  disabled?: boolean;
}

export type ToggleVariant = 'segment' | 'tabs' | 'grid' | 'purple';

interface SegmentedToggleProps<T extends string> {
  options: ToggleOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: ToggleVariant;
  className?: string;
  /** Per-option class when selected (e.g. category colours). */
  activeClassName?: (value: T) => string | undefined;
}

const WRAP: Record<ToggleVariant, string> = {
  segment: 'inline-flex overflow-hidden rounded-[9px] border-[1.5px] border-bluet2 bg-white',
  tabs: 'inline-flex gap-1 rounded-[10px] border border-bluet2 bg-[#EEF3F9] p-[3px]',
  grid: 'grid grid-cols-3 gap-2',
  purple: 'inline-flex overflow-hidden rounded-[9px] border-[1.5px] border-purplebd',
};

const BUTTON: Record<ToggleVariant, [string, string]> = {
  segment: [
    'border-r border-bluet2 bg-white px-[13px] py-[3px] text-[12.8px] font-semibold text-blued last:border-r-0 hover:bg-bluet',
    'border-r border-bluet2 bg-blue px-[13px] py-[3px] text-[12.8px] font-semibold text-white last:border-r-0',
  ],
  tabs: [
    'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-[3px] text-[12.8px] font-semibold text-blued hover:bg-[#DCEAF7]',
    'inline-flex items-center gap-1.5 rounded-[7px] bg-blued px-3 py-[3px] text-[12.8px] font-semibold text-white',
  ],
  grid: [
    'flex min-w-0 items-center justify-center gap-[7px] rounded-[9px] border-[1.5px] border-bluet2 bg-bluet px-2 py-[9px] text-center text-[13.2px] font-semibold leading-tight text-blued short:py-[7px] max-bp1400:text-[13px]',
    'flex min-w-0 items-center justify-center gap-[7px] rounded-[9px] border-[1.5px] border-blued bg-blued px-2 py-[9px] text-center text-[13.2px] font-semibold leading-tight text-white short:py-[7px] max-bp1400:text-[13px]',
  ],
  purple: [
    'inline-flex items-center gap-1.5 border-r border-purplebd bg-white px-3 py-1 text-[13.4px] font-semibold text-purple2 last:border-r-0 hover:bg-[#F5F2FE]',
    'inline-flex items-center gap-1.5 border-r border-purplebd bg-purple2 px-3 py-1 text-[13.4px] font-semibold text-white last:border-r-0',
  ],
};

/** Toggle group used for periods, sub-tabs, categories and the weekly/monthly switch. */
function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = 'segment',
  className,
  activeClassName,
}: SegmentedToggleProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx(WRAP[variant], className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => !active && onChange(option.value)}
            className={cx(BUTTON[variant][active ? 1 : 0], active && activeClassName?.(option.value), 'whitespace-nowrap disabled:opacity-50')}
          >
            {option.label}
            {option.count !== undefined && (
              <em
                className={cx(
                  'rounded-full border px-[7px] py-px text-[11.4px] font-bold not-italic',
                  active ? 'border-transparent bg-white/20 text-white' : 'border-bluet2 bg-white text-blued',
                )}
              >
                {option.count}
              </em>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default memo(SegmentedToggle) as typeof SegmentedToggle;
