import { memo } from 'react';
import { cx } from '../../utils/cx';

interface AvatarProps {
  initials: string;
  variant?: 'header' | 'dark' | 'square';
  size?: 'sm' | 'md';
}

const VARIANT = {
  header: 'rounded-full bg-white text-blued',
  dark: 'rounded-full bg-blued text-white',
  square: 'rounded-[9px] bg-navy text-white',
};

/** Initials avatar. */
const Avatar = ({ initials, variant = 'dark', size = 'md' }: AvatarProps) => (
  <span
    aria-hidden="true"
    className={cx(
      'flex flex-none items-center justify-center font-bold',
      size === 'sm' ? 'size-[30px] text-xs' : 'size-[38px] text-sm short:size-8',
      VARIANT[variant],
    )}
  >
    {initials}
  </span>
);

export default memo(Avatar);
