import { memo } from 'react';
import RoleChip from '../../components/common/RoleChip';
import { LABELS } from '../../constants/labels';
import type { Participant } from '../../types/models';
import { cx } from '../../utils/cx';

interface ParticipantPillsProps {
  participants: Participant[];
  activeId: string;
  answered: Record<string, number>;
  total: number;
  onSelect: (id: string) => void;
}

/** Call participants: role, name and answered/total; the active one is filled dark blue. */
const ParticipantPills = ({ participants, activeId, answered, total, onSelect }: ParticipantPillsProps) => (
  <div className="flex flex-wrap items-center gap-2.5 border-b border-dashed border-line px-4 py-[11px]">
    <span className="text-[11.8px] font-bold uppercase tracking-[.6px] text-ink3">{LABELS.postCall.participants}</span>
    <div role="tablist" aria-label={LABELS.postCall.participants} className="flex flex-wrap items-center gap-2">
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
              'inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] pl-[5px] pr-1.5 text-[13.8px] font-semibold leading-none transition-colors',
              on ? 'border-blued bg-blued text-white' : 'border-line bg-white text-ink2 hover:border-blued hover:bg-[#EEF4FA]',
            )}
          >
            <RoleChip role={p.role_type} inverted={on} className="h-[22px] rounded-full px-2" />
            {p.display_name}
            <span className={cx('inline-flex h-[22px] min-w-10 items-center justify-center rounded-full px-2 text-xs font-bold', on ? 'bg-white/20 text-white' : 'bg-[#EEF2F7] text-ink2')}>
              {answered[p.hcp_id] ?? 0}/{total}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

export default memo(ParticipantPills);
