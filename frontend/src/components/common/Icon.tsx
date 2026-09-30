import { memo } from 'react';
import { cx } from '../../utils/cx';

interface IconProps {
  /** Material Symbols Rounded ligature name, e.g. "arrow_forward". */
  name: string;
  className?: string;
  label?: string;
}

/** A Material Symbols Rounded icon (self-hosted font). Decorative unless `label` is given. */
const Icon = ({ name, className, label }: IconProps) => (
  <span className={cx('ms', className)} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}>
    {name}
  </span>
);

export default memo(Icon);
