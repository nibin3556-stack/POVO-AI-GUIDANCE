import { memo } from 'react';
import CheckMark from '../../../components/common/CheckMark';
import RoleChip from '../../../components/common/RoleChip';
import { LABELS } from '../../../constants/labels';
import type { Participant } from '../../../types/models';
import { cx } from '../../../utils/cx';

interface ParticipantTogglesProps {
  participants: Participant[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}

/** "Meeting participants": the HCP is always on; the affiliated NP and PA can be toggled. */
const ParticipantToggles = ({ participants, selectedIds, onToggle }: ParticipantTogglesProps) => (
  <div className="ml-auto flex flex-wrap items-center gap-2">
    <span className="text-[11.6px] font-bold uppercase tracking-[.6px] text-blued">{LABELS.callPrep.participants}</span>
    {participants.map((p) => {
      const on = p.is_primary || selectedIds.includes(p.hcp_id);
      return (
        <button
          key={p.hcp_id}
          type="button"
          aria-pressed={on}
          disabled={p.is_primary}
          onClick={() => onToggle(p.hcp_id)}
          className={cx(
            'flex items-center gap-2 rounded-[10px] border-[1.5px] px-2.5 py-1 text-left disabled:cursor-default',
            on ? 'border-blue bg-[#F4F9FD]' : 'border-line bg-card',
          )}
        >
          <CheckMark checked={on} size="sm" />
          <RoleChip role={p.role_type} />
          <b className="text-[13px] font-semibold text-ink">{p.display_name}</b>
        </button>
      );
    })}
  </div>
);

export default memo(ParticipantToggles);
