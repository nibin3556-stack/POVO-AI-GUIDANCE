import { memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

export type ChipVariant = 'good' | 'risk' | 'days' | 'warn' | 'new' | 'newSolid' | 'purple' | 'neutral' | 'danger';

const VARIANTS: Record<ChipVariant, string> = {
  good: 'border-greenbd bg-greenbg text-green',
  risk: 'border-warnbd bg-warnbg text-warndk',
  days: 'border-bluet2 bg-[#EEF4FA] text-blued',
  warn: 'border-warnbd bg-warnbg text-warn',
  new: 'border-greenbd bg-greenbg text-green uppercase tracking-[.5px] text-[10.4px] animate-chip-pulse',
  newSolid: 'border-green bg-green text-white uppercase tracking-[.5px] text-[10.4px] animate-chip-pulse',
  purple: 'border-purplebd bg-purplet text-purple2',
  neutral: 'border-line2 bg-[#EEF2F7] text-ink3',
  danger: 'border-red bg-red text-white',
};

interface StatusChipProps {
  variant: ChipVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}

/** Pill chip used for On Track / At Risk, "ends MM/DD/YYYY", "Not called", "New" and similar. */
const StatusChip = ({ variant, children, className, title }: StatusChipProps) => (
  <span
    title={title}
    className={cx(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-px text-[11.8px] font-semibold leading-[1.4]',
      VARIANTS[variant],
      className,
    )}
  >
    {children}
  </span>
);

export default memo(StatusChip);
