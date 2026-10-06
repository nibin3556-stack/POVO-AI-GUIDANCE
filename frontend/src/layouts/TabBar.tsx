import { memo } from 'react';
import { NavLink } from 'react-router';
import { FEATURES, ROUTES, postCallPath, preCallPath } from '../constants/constant';
import { LABELS } from '../constants/labels';
import { useFeatures } from '../hooks/useFeatures';
import { cx } from '../utils/cx';

interface TabBarProps {
  selectedHcpId: string | null;
}

const TAB =
  'flex h-9 items-center justify-center rounded-[4px] border-[1.5px] px-4 text-center text-[14.5px] font-semibold no-underline transition-colors';
const IDLE = 'border-line bg-[#F1F5F9] text-ink3 hover:border-bluet2 hover:bg-bluet hover:text-blued';
const ACTIVE = 'border-tabon bg-tabon text-white';
const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

const tabClass = ({ isActive }: { isActive: boolean }) => cx(TAB, isActive ? ACTIVE : IDLE);

/** The tabs the brand has on. Post-Call Assessment is disabled until a target is selected. */
const TabBar = ({ selectedHcpId }: TabBarProps) => {
  const features = useFeatures();
  const tabs = [
    features.has(FEATURES.PERFORMANCE_TAB) && (
      <NavLink key="perf" to={ROUTES.PERFORMANCE} className={tabClass}>
        {LABELS.tabs.performance}
      </NavLink>
    ),
    features.has(FEATURES.PRE_CALL_TAB) && (
      <NavLink key="pre" to={preCallPath(selectedHcpId)} className={tabClass}>
        {LABELS.tabs.preCall}
      </NavLink>
    ),
    features.has(FEATURES.POST_CALL_TAB) &&
      (selectedHcpId ? (
        <NavLink key="post" to={postCallPath(selectedHcpId)} className={tabClass}>
          {LABELS.tabs.postCall}
        </NavLink>
      ) : (
        <span key="post" role="link" aria-disabled="true" title={LABELS.tabs.postCallDisabled} className={cx(TAB, 'cursor-not-allowed border-line bg-[#F6F8FA] text-[#9FAEBE]')}>
          {LABELS.tabs.postCall}
        </span>
      )),
  ].filter(Boolean);
  if (!tabs.length) return null;
  return (
    <nav aria-label="Main" className={cx('grid flex-none gap-2.5 border-b border-line bg-white px-5 py-1.5 shadow-[0_1px_3px_rgba(16,40,80,.07)]', COLS[tabs.length])}>
      {tabs}
    </nav>
  );
};

export default memo(TabBar);
