import { memo } from 'react';

import { cx } from '../../utils/cx';

interface SegmentTagProps {
  label: string;
  color: string;
  /** The full name wraps (Call Plan Targets Segment column) instead of staying on one line. */
  wrap?: boolean;
}

/** Segment tag: a square swatch and the short name. */
const SegmentTag = ({ label, color, wrap = false }: SegmentTagProps) => (
  <span className={cx('inline-flex gap-[5px] font-semibold text-ink2', wrap ? 'items-start whitespace-normal leading-[1.25]' : 'items-center whitespace-nowrap text-xs')}>
    <i className={cx('size-[9px] flex-none rounded-[3px]', wrap && 'mt-[3px]')} style={{ backgroundColor: color }} />
    {label}
  </span>
);

export default memo(SegmentTag);
