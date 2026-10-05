import { Tooltip } from '@mui/material';
import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';

interface InfoTipProps {
  text: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** A small circled "i" with a definition on hover or keyboard focus (KPI cards, decile headers). */
const InfoTip = ({ text, size = 'md', className }: InfoTipProps) => (
  <Tooltip
    title={<span className="block whitespace-pre-line text-[12.5px] font-medium leading-[1.45]">{text}</span>}
    placement="bottom-start"
    enterDelay={120}
    describeChild
  >
    <span
      role="img"
      tabIndex={0}
      aria-label={`${LABELS.performance.infoAria}: ${text}`}
      className={cx(
        'inline-flex flex-none cursor-help items-center justify-center rounded-full border-[1.5px] border-blue font-semibold not-italic normal-case leading-none tracking-normal text-blue outline-none focus-visible:shadow-[0_0_0_3px_rgba(21,108,180,.25)]',
        size === 'sm' ? 'size-3.5 text-[9.6px]' : 'size-4 text-[11px]',
        className,
      )}
    >
      i
    </span>
  </Tooltip>
);

export default memo(InfoTip);
