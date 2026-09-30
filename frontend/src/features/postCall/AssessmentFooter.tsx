import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';

interface AssessmentFooterProps {
  answered: number;
  total: number;
  name: string;
  flags: number;
}

/** Progress dots, "n of 9 selected for {name}" and the compliance flag count. */
const AssessmentFooter = ({ answered, total, name, flags }: AssessmentFooterProps) => (
  <div className="flex items-center gap-3 border-t border-dashed border-line bg-[#FBFCFE] px-4 py-2.5">
    <span className="flex flex-1 gap-[5px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={`dot-${i}`} className={cx('h-[7px] flex-1 rounded-full', i < answered ? 'bg-linear-90 from-[#34A853] to-green' : 'bg-[#B9C7D6]')} />
      ))}
    </span>
    <span className={cx('inline-flex items-center gap-1.5 text-[13.4px] font-semibold', answered ? 'text-green' : 'text-ink3')}>{LABELS.postCall.footer(answered, total, name)}</span>
    {flags > 0 && (
      <span className="inline-flex items-center gap-1.5 text-[13.4px] font-semibold text-red2" role="status">
        <span className="size-3 animate-red-pulse rounded-full bg-red" />
        {LABELS.postCall.flags(flags)}
      </span>
    )}
  </div>
);

export default memo(AssessmentFooter);
