import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import Icon from './Icon';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Amber error box with an optional retry (the POC `.imerr`). */
const ErrorState = ({ message = LABELS.app.genericError, onRetry, className }: ErrorStateProps) => (
  <div role="alert" className={cx('flex flex-wrap items-center gap-2 rounded-[9px] border border-warnbd bg-warnbg px-3 py-[9px] text-[13.4px] font-medium text-warndk', className)}>
    <Icon name="error" className="text-[19px]" />
    <span className="flex-1">{message}</span>
    {onRetry && (
      <button type="button" onClick={onRetry} className="rounded-lg border-[1.5px] border-warnbd bg-white px-3 py-1 text-[13px] font-semibold text-warndk hover:bg-warnbg">
        {LABELS.app.retry}
      </button>
    )}
  </div>
);

export default memo(ErrorState);
