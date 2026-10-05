import { memo } from 'react';
import { NavLink } from 'react-router';
import { ROUTES, postCallPath, preCallPath } from '../constants/constant';
import { LABELS } from '../constants/labels';
import { cx } from '../utils/cx';

interface TabBarProps {
  selectedHcpId: string | null;
}

const TAB =
  'flex h-9 items-center justify-center rounded-[4px] border-[1.5px] px-4 text-center text-[14.5px] font-semibold no-underline transition-colors';
const IDLE = 'border-line bg-[#F1F5F9] text-ink3 hover:border-bluet2 hover:bg-bluet hover:text-blued';
const ACTIVE = 'border-tabon bg-tabon text-white';

const tabClass = ({ isActive }: { isActive: boolean }) => cx(TAB, isActive ? ACTIVE : IDLE);

/** The three tabs. Post-Call Assessment is disabled until a target is selected. */
const TabBar = ({ selectedHcpId }: TabBarProps) => (
  <nav aria-label="Main" className="grid flex-none grid-cols-3 gap-2.5 border-b border-line bg-white px-5 py-1.5 shadow-[0_1px_3px_rgba(16,40,80,.07)]">
    <NavLink to={ROUTES.PERFORMANCE} className={tabClass}>
      {LABELS.tabs.performance}
    </NavLink>
    <NavLink to={preCallPath(selectedHcpId)} className={tabClass}>
      {LABELS.tabs.preCall}
    </NavLink>
    {selectedHcpId ? (
      <NavLink to={postCallPath(selectedHcpId)} className={tabClass}>
        {LABELS.tabs.postCall}
      </NavLink>
    ) : (
      <span role="link" aria-disabled="true" title={LABELS.tabs.postCallDisabled} className={cx(TAB, 'cursor-not-allowed border-line bg-[#F6F8FA] text-[#9FAEBE]')}>
        {LABELS.tabs.postCall}
      </span>
    )}
  </nav>
);

export default memo(TabBar);
