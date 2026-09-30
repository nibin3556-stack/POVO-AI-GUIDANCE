import { Popover } from '@mui/material';
import { memo, useState } from 'react';
import CheckMark from '../../components/common/CheckMark';
import RoleChip from '../../components/common/RoleChip';
import { LABELS } from '../../constants/labels';
import type { Facet } from '../../types/models';
import { cx } from '../../utils/cx';
import { useReference } from '../../hooks/useReference';
import { nextRoles } from '../../utils/targets';

interface RoleFilterMenuProps {
  selected: string[];
  counts: Facet[] | undefined;
  onChange: (roles: string[]) => void;
}

/** The funnel in the Name header: show or hide HCPs, NPs and PAs (with counts). */
const RoleFilterMenu = ({ selected, counts, onChange }: RoleFilterMenuProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { roleCodes } = useReference();
  const partial = selected.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        title={LABELS.preCall.filterByRole}
        aria-label={LABELS.preCall.filterByRole}
        className={cx('ml-[5px] inline-flex size-[22px] items-center justify-center rounded-md align-middle', partial ? 'bg-blue text-white' : 'text-blue hover:bg-bluet')}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path fill="currentColor" d="M3 5h18l-7 8.2V19l-4 2v-7.8z" />
        </svg>
      </button>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { p: 0.75, minWidth: 170 } } }}>
        <div className="px-2 pb-[5px] pt-[3px] text-[11px] font-bold uppercase tracking-[.5px] text-ink3">{LABELS.preCall.showRoles}</div>
        {roleCodes.map((role) => {
          const on = !partial || selected.includes(role);
          return (
            <button
              key={role}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => onChange(nextRoles(selected, role, roleCodes))}
              className="flex w-full items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left text-[13px] font-semibold text-ink2 hover:bg-bluet"
            >
              <CheckMark checked={on} size="sm" />
              <RoleChip role={role} />
              <span className="ml-auto text-[12.4px] font-bold text-ink3">{counts?.find((c) => c.code === role)?.count ?? 0}</span>
            </button>
          );
        })}
      </Popover>
    </>
  );
};

export default memo(RoleFilterMenu);
