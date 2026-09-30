import { memo } from 'react';
import CheckMark from '../../components/common/CheckMark';
import RoleChip from '../../components/common/RoleChip';
import type { Target } from '../../types/models';

interface TargetNameProps {
  target: Pick<Target, 'role_type' | 'display_name'>;
  selected: boolean;
  index?: number;
}

/** Checkbox, optional rank, role chip and display name — the name cell of every target list. */
const TargetName = ({ target, selected, index }: TargetNameProps) => (
  <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
    <CheckMark checked={selected} size="sm" />
    {index !== undefined && <span className="w-4 flex-none text-right text-[13.4px] font-semibold text-ink">{index}</span>}
    <RoleChip role={target.role_type} size="sm" />
    <span className="overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-ink">{target.display_name}</span>
  </span>
);

export default memo(TargetName);
