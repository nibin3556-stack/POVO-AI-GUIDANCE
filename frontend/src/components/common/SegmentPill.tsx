import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { useReference } from '../../hooks/useReference';
import { cx } from '../../utils/cx';

interface SegmentPillProps {
  code: string | null | undefined;
  className?: string;
}

/** HS treatment segment tag shown beside a name in call prep: outlined pill in the segment colour. */
const SegmentPill = ({ code, className }: SegmentPillProps) => {
  const ref = useReference();
  const segment = ref.segment(code);
  if (!segment || !code) return null;
  const color = ref.segmentColor(code);
  return (
    <span
      title={LABELS.callPrep.segmentPill(segment.full_name)}
      style={{ borderColor: color, color: `color-mix(in srgb, ${color} 72%, #0F1F33)` }}
      className={cx(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border-[1.5px] bg-white py-px pl-[7px] pr-[9px] align-middle text-[11.8px] font-semibold normal-case leading-[1.5] tracking-normal',
        className,
      )}
    >
      <i className="size-2 flex-none rounded-full" style={{ backgroundColor: color }} />
      {segment.full_name}
    </span>
  );
};

export default memo(SegmentPill);
