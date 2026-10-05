import { Popover } from '@mui/material';
import { memo, useState } from 'react';
import CheckMark from '../../components/common/CheckMark';
import Icon from '../../components/common/Icon';
import { LABELS } from '../../constants/labels';
import type { Facet } from '../../types/models';
import { cx } from '../../utils/cx';

interface AccountFilterMenuProps {
  selected: string[];
  accounts: Facet[] | undefined;
  onToggle: (accountId: string) => void;
  onClear: () => void;
}

const L = LABELS.preCall;

/** The funnel in the Account header: pick one or more accounts (with target counts); stays open while picking. */
const AccountFilterMenu = ({ selected, accounts, onToggle, onClear }: AccountFilterMenuProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const active = selected.length > 0;
  // Claims-only accounts have no targets in the call plan, so they are not offered.
  const options = (accounts ?? []).filter((a) => a.count > 0);
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        title={L.filterByAccount}
        aria-label={L.filterByAccount}
        aria-haspopup="menu"
        className={cx('ml-[5px] inline-flex size-[22px] items-center justify-center rounded-md align-middle', active ? 'bg-blue text-white' : 'text-blue hover:bg-bluet')}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path fill="currentColor" d="M3 5h18l-7 8.2V19l-4 2v-7.8z" />
        </svg>
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 0.75, minWidth: 250, maxHeight: 320 } } }}
      >
        <div role="menu" aria-label={L.showAccounts}>
          <div className="px-2 pb-[5px] pt-[3px] text-[11px] font-bold uppercase tracking-[.5px] text-ink3">{L.showAccounts}</div>
          {options.map((a) => {
            const on = selected.includes(a.code);
            return (
              <button
                key={a.code}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(a.code)}
                className="flex w-full items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-left text-[13px] font-semibold text-ink2 hover:bg-bluet"
              >
                <CheckMark checked={on} size="sm" />
                <span className="min-w-0 flex-1 leading-[1.25]">{a.label}</span>
                <span className="text-[12.4px] font-bold text-ink3">{a.count}</span>
              </button>
            );
          })}
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 flex w-full items-center gap-[7px] rounded-b-[7px] border-t border-line2 px-2 py-[7px] text-left text-[13px] font-semibold text-blue hover:bg-bluet"
            >
              <Icon name="filter_alt_off" className="text-base" />
              {L.showAllAccounts}
            </button>
          )}
        </div>
      </Popover>
    </>
  );
};

export default memo(AccountFilterMenu);
