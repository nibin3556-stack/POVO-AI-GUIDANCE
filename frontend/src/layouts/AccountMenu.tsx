import { Popover } from '@mui/material';
import { memo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import Avatar from '../components/common/Avatar';
import Icon from '../components/common/Icon';
import { ROUTES } from '../constants/constant';
import { LABELS } from '../constants/labels';
import type { Me } from '../types/models';
import { cx } from '../utils/cx';
import { formatLongDate } from '../utils/format';

interface AccountMenuProps {
  me: Me;
  canImpersonate: boolean;
  onImpersonate: () => void;
  onExit: () => void;
}

const MENU_BTN =
  'flex w-full items-center gap-[9px] rounded-[7px] px-3 py-[9px] text-left text-sm font-semibold text-ink hover:bg-bluet hover:text-blued';

/** Name, role and territory on the right of the header; the chevron opens the account menu. */
const AccountMenu = ({ me, canImpersonate, onImpersonate, onExit }: AccountMenuProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const eff = me.effective;
  const close = () => setAnchor(null);
  const run = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-label={LABELS.header.account}
        onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}
        className={cx('flex items-center gap-[11px] rounded-[10px] py-[3px] pl-2.5 pr-1.5 transition-colors hover:bg-white/10', anchor && 'bg-white/10')}
      >
        <span className="text-right">
          <b className="block text-[13.5px] font-semibold text-white">{eff.full_name}</b>
          <span className="block text-[11px] font-medium text-[#DCEAF7] max-bp760:hidden">
            {LABELS.header.roleDateLine(eff.role_title, eff.territory_name, eff.region, formatLongDate(me.today))}
          </span>
        </span>
        <Avatar initials={eff.initials} variant="header" size="sm" />
        <Icon name="expand_more" className="rounded-md p-0.5 text-[22.4px] text-[#E4EFF9]" />
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, p: 1, minWidth: 250 } } }}
      >
        <div role="menu" aria-label={LABELS.header.account}>
          <div className="px-2.5 pb-[9px] pt-1.5">
            <b className="block text-[14.5px] font-bold text-ink">{eff.full_name}</b>
            <span className="block text-[12.4px] font-medium leading-[1.4] text-ink3">{eff.role_title}</span>
            <span className="block text-[12.4px] font-medium leading-[1.4] text-ink3">{LABELS.header.territoryLine(eff.territory_name, eff.region)}</span>
            {me.is_impersonating && (
              <span className="mt-[5px] inline-block rounded-md border border-warnbd bg-warnbg px-[7px] py-0.5 text-[11.6px] font-semibold text-warndk">
                {LABELS.header.signedInAs(me.signed_in.full_name)}
              </span>
            )}
          </div>
          <div className="mx-1 mb-[5px] h-px bg-line2" />
          {canImpersonate && (
            <button type="button" role="menuitem" className={MENU_BTN} onClick={run(onImpersonate)}>
              <Icon name="switch_account" className="text-xl text-blue" />
              {LABELS.header.impersonate}
            </button>
          )}
          {me.is_impersonating && (
            <button type="button" role="menuitem" className={MENU_BTN} onClick={run(onExit)}>
              <Icon name="logout" className="text-xl text-blue" />
              {LABELS.header.exitImpersonation}
            </button>
          )}
          {me.is_admin && (
            <button type="button" role="menuitem" className={MENU_BTN} onClick={run(() => navigate(ROUTES.ADMIN))}>
              <Icon name="tune" className="text-xl text-blue" />
              {LABELS.header.configure}
            </button>
          )}
        </div>
      </Popover>
    </>
  );
};

export default memo(AccountMenu);
