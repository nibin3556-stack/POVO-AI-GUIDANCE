import { memo } from 'react';
import { cx } from '../../utils/cx';

interface FilterPillProps {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onToggle: () => void;
}

/** Competitive focus filter pill: colour dot, label, count; filled with the colour when on. */
const FilterPill = ({ label, count, color, active, onToggle }: FilterPillProps) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onToggle}
    style={{ borderColor: active ? color : undefined, backgroundColor: active ? color : undefined }}
    className={cx(
      'inline-flex items-center gap-1.5 rounded-full border-[1.5px] py-0.5 pl-[7px] pr-[9px] text-xs font-semibold transition-colors',
      active ? 'text-white' : 'border-line bg-white text-ink2 hover:border-ink3',
    )}
  >
    <i className="size-[9px] rounded-full" style={{ backgroundColor: active ? '#fff' : color }} />
    {label}
    <em className={cx('text-[11px] font-bold not-italic', active ? 'text-white' : 'text-ink3')}>{count}</em>
  </button>
);

export default memo(FilterPill);
