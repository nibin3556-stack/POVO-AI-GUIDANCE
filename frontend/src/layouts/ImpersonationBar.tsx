import { memo } from 'react';
import Icon from '../components/common/Icon';
import { LABELS } from '../constants/labels';
import type { Me } from '../types/models';

interface ImpersonationBarProps {
  me: Me;
  onExit: () => void;
  exiting: boolean;
}

/** Amber bar while impersonating: whose figures these are and who you really are. */
const ImpersonationBar = ({ me, onExit, exiting }: ImpersonationBarProps) => (
  <div role="status" className="flex flex-none flex-wrap items-center gap-2.5 border-b-[1.5px] border-warnbd bg-[#FEF6E4] px-5 py-1.5 text-[13.4px] font-medium text-ink2 max-bp760:px-3">
    <Icon name="visibility" className="text-[19px] text-warn" />
    <span>
      {LABELS.impersonationBar.viewingAs} <b className="font-bold text-ink">{me.effective.full_name}</b>{' '}
      {LABELS.impersonationBar.team(me.effective.business_unit)} <b className="font-bold text-ink">{me.signed_in.full_name}</b>
    </span>
    <span className="flex-1" />
    <button
      type="button"
      onClick={onExit}
      disabled={exiting}
      className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-warnbd bg-white px-3 py-[5px] text-[13px] font-semibold text-warndk hover:bg-warnbg disabled:opacity-60"
    >
      <Icon name="logout" className="text-[17px]" />
      {LABELS.header.exitImpersonation}
    </button>
  </div>
);

export default memo(ImpersonationBar);
