import { memo } from 'react';
import RoleChip from '../../../components/common/RoleChip';
import type { Participant } from '../../../types/models';
import { cx } from '../../../utils/cx';

interface RoleTabsProps {
  participants: Participant[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}

/** One pill per participant (role chip + name); the active one is filled dark blue. */
const RoleTabs = ({ participants, activeId, onSelect, ariaLabel }: RoleTabsProps) => (
  <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-[7px]">
    {participants.map((p) => {
      const on = p.hcp_id === activeId;
      return (
        <button
          key={p.hcp_id}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onSelect(p.hcp_id)}
          className={cx(
            'inline-flex items-center gap-2 rounded-full border-[1.5px] py-[5px] pl-1.5 pr-[13px] text-[13.7px] font-semibold leading-none transition-colors short:py-1',
            on ? 'border-blued bg-blued text-white' : 'border-line bg-white text-ink2 hover:border-blued hover:bg-[#EEF4FA]',
          )}
        >
          <RoleChip role={p.role_type} inverted={on} />
          {p.display_name}
        </button>
      );
    })}
  </div>
);

export default memo(RoleTabs);
