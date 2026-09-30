import { memo } from 'react';

interface SegmentTagProps {
  label: string;
  color: string;
}

/** Segment tag: a square swatch and the short name. */
const SegmentTag = ({ label, color }: SegmentTagProps) => (
  <span className="inline-flex items-center gap-[5px] whitespace-nowrap text-xs font-semibold text-ink2">
    <i className="size-[9px] flex-none rounded-[3px]" style={{ backgroundColor: color }} />
    {label}
  </span>
);

export default memo(SegmentTag);
