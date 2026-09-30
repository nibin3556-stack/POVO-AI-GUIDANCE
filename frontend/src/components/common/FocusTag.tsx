import { memo } from 'react';

interface FocusTagProps {
  label: string;
  color: string;
  title?: string;
}

/** Competitive focus tag: a coloured dot and the label in a pill. */
const FocusTag = ({ label, color, title }: FocusTagProps) => (
  <span
    title={title ?? label}
    className="inline-flex max-w-full items-center gap-[5px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line2 bg-white py-px pl-1.5 pr-2 text-[11px] font-semibold text-ink2"
  >
    <i className="size-2 flex-none rounded-full" style={{ backgroundColor: color }} />
    <span className="overflow-hidden text-ellipsis">{label}</span>
  </span>
);

export default memo(FocusTag);
