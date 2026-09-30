import { memo } from 'react';
import { LABELS } from '../../constants/labels';
import { cx } from '../../utils/cx';
import Icon from './Icon';

interface EmptyStateProps {
  message?: string;
  icon?: string;
  variant?: 'plain' | 'hint';
  className?: string;
}

/** Empty state: a quiet line, or the dashed blue "hint" box from the POC. */
const EmptyState = ({ message = LABELS.common.empty, icon, variant = 'plain', className }: EmptyStateProps) => (
  <div
    className={cx(
      'flex items-center justify-center gap-2 text-center',
      variant === 'hint'
        ? 'rounded-[10px] border border-dashed border-bluet2 bg-bluet px-3.5 py-2.5 text-[13.6px] font-semibold text-blued'
        : 'p-5 text-[13px] font-medium text-ink3',
      className,
    )}
  >
    {icon && <Icon name={icon} className="text-[19px]" />}
    {message}
  </div>
);

export default memo(EmptyState);
