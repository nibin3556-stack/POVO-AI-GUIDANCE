import { memo, useEffect } from 'react';
import { LABELS } from '../constants/labels';
import type { Me } from '../types/models';
import AccountMenu from './AccountMenu';
import BrandSwitcher from './BrandSwitcher';

interface HeaderProps {
  me: Me;
  canImpersonate: boolean;
  onImpersonate: () => void;
  onExit: () => void;
}

/**
 * 46px blue header (POVO Pulse): no app title on the left any more; the brand
 * selector and the user sit on the right, and today's date (from /me) follows
 * the role line under the user's name.
 */
const Header = ({ me, canImpersonate, onImpersonate, onExit }: HeaderProps) => {
  // The browser tab carries the app name for the selected brand.
  useEffect(() => {
    document.title = LABELS.app.titleFor(me.brand.name);
  }, [me.brand.name]);
  return (
    <header className="flex h-[46px] flex-none items-center gap-3.5 bg-header px-5">
      <span className="flex-1" />
      <BrandSwitcher me={me} />
      <AccountMenu me={me} canImpersonate={canImpersonate} onImpersonate={onImpersonate} onExit={onExit} />
    </header>
  );
};

export default memo(Header);
