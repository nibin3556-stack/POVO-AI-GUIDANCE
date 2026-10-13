import { memo } from 'react';
import CheckMark from '../../components/common/CheckMark';
import RoleChip from '../../components/common/RoleChip';
import type { Target } from '../../types/models';
import { cx } from '../../utils/cx';
import { gluedName } from '../../utils/targets';

interface TargetNameProps {
  target: Pick<Target, 'role_type' | 'display_name'>;
  selected: boolean;
  index?: number;
  /** Assessed in this session: green checkbox and a dark green name. */
  done?: boolean;
}

/** Checkbox, optional rank, role chip and display name — the name cell of every target list. The name wraps rather than being cut off. */
const TargetName = ({ target, selected, index, done = false }: TargetNameProps) => (
  <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
    <CheckMark checked={selected} size="sm" tone={done ? 'green' : 'blue'} className={done && !selected ? 'border-green!' : undefined} />
    {index !== undefined && <span className="w-4 flex-none text-right text-[13.4px] font-semibold text-ink">{index}</span>}
    <RoleChip role={target.role_type} size="sm" />
    <span className={cx('min-w-0 whitespace-normal leading-[1.2] [overflow-wrap:anywhere]', done ? 'font-bold text-[#14532D]' : 'font-semibold text-ink')}>{gluedName(target.display_name)}</span>
  </span>
);

export default memo(TargetName);
