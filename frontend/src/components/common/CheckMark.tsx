import { memo } from 'react';
import { cx } from '../../utils/cx';

interface CheckMarkProps {
  checked: boolean;
  tone?: 'blue' | 'green';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = { sm: 'size-[15px] rounded-[4px] text-[12px]', md: 'size-4 rounded-[4px] text-[13px]', lg: 'size-[19px] rounded-[5px] text-[15px]' };

/** The POC's square checkbox visual (the clickable element is its parent). */
const CheckMark = ({ checked, tone = 'blue', size = 'md', className }: CheckMarkProps) => (
  <span
    aria-hidden="true"
    className={cx(
      'relative inline-flex flex-none items-center justify-center border-[1.8px] font-bold',
      SIZE[size],
      checked ? (tone === 'green' ? 'border-green bg-green text-white' : 'border-blue bg-blue text-white') : 'border-[#6B7C90] bg-white',
      className,
    )}
  >
    {checked && <span className="ms leading-none">check</span>}
  </span>
);

export default memo(CheckMark);
