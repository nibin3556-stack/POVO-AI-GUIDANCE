import { memo, type ReactNode } from 'react';
import { cx } from '../../utils/cx';
import HcpsText from './HcpsText';

interface EyebrowProps {
  text: string;
  className?: string;
  children?: ReactNode;
}

/** Small uppercase letter-spaced label (the POC `.k` labels). Keeps "HCPs" lowercase. */
const Eyebrow = ({ text, className, children }: EyebrowProps) => (
  <span className={cx('text-[11.6px] font-bold uppercase tracking-[.6px] text-ink3', className)}>
    <HcpsText text={text} />
    {children}
  </span>
);

export default memo(Eyebrow);
