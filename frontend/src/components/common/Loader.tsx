import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';

interface LoaderProps {
  label?: string;
  className?: string;
  fill?: boolean;
}

/** Spinner with a caption (the POC `.imload`). */
const Loader = ({ label = LABELS.app.loading, className, fill = false }: LoaderProps) => (
  <div role="status" className={cx('flex items-center justify-center gap-[9px] p-3 text-[13.6px] font-medium text-ink3', fill && 'min-h-[160px] flex-1', className)}>
    <i className="size-4 animate-spin rounded-full border-[2.5px] border-bluet2 border-t-blue" aria-hidden="true" />
    {label}
  </div>
);

export default memo(Loader);
