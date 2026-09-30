import { memo } from 'react';
import type { RoleType } from '../../constants/colors';
import { cx } from '../../utils/cx';

interface RoleChipProps {
  role: RoleType;
  /** Inverted colours for use on a dark (selected) pill. */
  inverted?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const FILLED: Record<RoleType, string> = {
  HCP: 'bg-navy text-white',
  PA: 'bg-purple2 text-white',
  NP: 'bg-npgreen text-white',
};

const INVERTED: Record<RoleType, string> = {
  HCP: 'bg-white text-blued',
  PA: 'bg-white text-purple2',
  NP: 'bg-white text-npgreen',
};

/** HCP / NP / PA role chip. */
const RoleChip = ({ role, inverted = false, size = 'md', className }: RoleChipProps) => (
  <span
    className={cx(
      'inline-flex flex-none items-center rounded-md font-bold leading-none tracking-[.3px]',
      size === 'sm' ? 'px-[5px] py-[2px] text-[9.8px]' : 'px-[7px] py-[3px] text-[10.6px]',
      inverted ? INVERTED[role] : FILLED[role],
      className,
    )}
  >
    {role}
  </span>
);

export default memo(RoleChip);
