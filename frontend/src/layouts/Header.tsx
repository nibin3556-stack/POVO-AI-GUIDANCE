import { memo } from 'react';
import { LABELS } from '../constants/labels';
import type { Me } from '../types/models';
import { formatLongDate } from '../utils/format';
import AccountMenu from './AccountMenu';

interface HeaderProps {
  me: Me;
  canImpersonate: boolean;
  onImpersonate: () => void;
  onExit: () => void;
}

/** 46px blue header: app name and today's date (from /me), the user on the right. */
const Header = ({ me, canImpersonate, onImpersonate, onExit }: HeaderProps) => (
  <header className="flex h-[46px] flex-none items-center gap-3.5 bg-blued px-5">
    <div>
      <b className="block text-base font-semibold tracking-[-.2px] text-white">{LABELS.app.title}</b>
      <small className="block text-[11.5px] font-medium text-[#DCEAF7] max-bp760:hidden">{formatLongDate(me.today)}</small>
    </div>
    <span className="flex-1" />
    <AccountMenu me={me} canImpersonate={canImpersonate} onImpersonate={onImpersonate} onExit={onExit} />
  </header>
);

export default memo(Header);
