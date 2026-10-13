import { memo, useMemo } from 'react';
import EmptyState from '../../../components/common/EmptyState';
import StatusChip from '../../../components/common/StatusChip';
import { LABELS } from '../../../constants/labels';
import { useReference } from '../../../hooks/useReference';
import type { InteractionFilter, Participant } from '../../../types/models';
import { cx } from '../../../utils/cx';
import { formatLongDate } from '../../../utils/format';

interface InteractionListProps {
  participant: Participant;
  filter: InteractionFilter;
  onFilter: (filter: InteractionFilter) => void;
}

const C = LABELS.callPrep;
/** New interaction card after a Post-Call Assessment: team chip and date in one semi-dark blue (white text, 4.6:1). */
const NEW_CHIP = 'border-[#3D79B8] bg-[#3D79B8] text-white';

/** "Interactions with {name}": filter chips with counts, then 3-column interaction cards. */
const InteractionList = ({ participant, filter, onFilter }: InteractionListProps) => {
  const ref = useReference();
  const filters = useMemo<InteractionFilter[]>(() => ['all', ...ref.channelCodes], [ref]);
  const counts = participant.interaction_counts;
  const active = filter !== 'all' && !counts[filter] ? 'all' : filter;
  const shown = useMemo(
    () => participant.interactions.filter((i) => active === 'all' || i.channel_code === active),
    [participant.interactions, active],
  );
  return (
    <div className="border-t border-dashed border-line pt-2 tall:pt-3">
      <div className="mb-[5px] text-[11.2px] font-bold uppercase tracking-[.6px] text-[#0B5F5D]">{C.interactionsWith(participant.display_name)}</div>
      <div role="group" aria-label={C.interactionFilterAria} className="mb-2 flex flex-wrap gap-1.5 short:mb-1.5">
        {filters.map((f) => {
          const n = f === 'all' ? (counts.all ?? participant.interactions.length) : (counts[f] ?? 0);
          const on = f === active;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              disabled={!n}
              onClick={() => onFilter(f)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-[11px] pr-[5px] text-[11.4px] font-bold uppercase leading-[18px] tracking-[.3px] transition-colors disabled:cursor-default disabled:opacity-45',
                on ? 'border-blued bg-blued text-white' : 'border-[#9EC2E4] bg-[#EEF4FA] text-blued hover:border-blued hover:bg-[#DCEAF7]',
              )}
            >
              {f === 'all' ? C.filterAll : ref.channelTeam(f)}
              <span className={cx('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[10.6px]', on ? 'bg-white/25 text-white' : 'bg-white text-blued')}>{n}</span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <EmptyState message={C.noInteractions} />}
      <div className="grid grid-cols-3 gap-[7px] tall:gap-[9px] max-bp900:grid-cols-2">
        {shown.map((i, index) => (
          <div
            key={i.interaction_id}
            className={cx(
              'flex min-w-0 flex-col items-start gap-[3px] overflow-hidden rounded-[9px] border border-[#C9D6E3] bg-[#F7F9FC] px-[9px] py-1.5 tall:px-[11px] tall:py-2',
              i.is_new && 'border-[1.5px] border-[#2E9E52]',
              active !== 'all' && index === 0 && 'border-blued shadow-[0_0_0_2px_rgba(17,80,136,.35)]',
            )}
          >
            <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
              <b className={cx('whitespace-nowrap text-[13.4px] font-semibold', i.is_new ? 'text-[#14532D]' : 'text-ink')}>{i.type_label}</b>
              <span className={cx('ml-auto flex-none whitespace-nowrap rounded-full border px-2 py-0.5 text-[9.8px] font-bold uppercase tracking-[.4px]', i.is_new ? NEW_CHIP : 'border-purplebd bg-purplet text-purple2')}>
                {i.team_label}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 gap-y-0.5">
              <span className="whitespace-nowrap text-[9.6px] font-bold uppercase tracking-[.4px] text-ink3">{C.interactionDate}</span>
              <span className={cx('rounded-[7px] border px-[7px] py-0.5 text-xs font-semibold', i.is_new ? NEW_CHIP : 'border-[#CBD5E1] bg-[#F1F5F9] text-ink3')}>{formatLongDate(i.date)}</span>
            </span>
            <span className="text-[12.4px] font-medium leading-[1.3] text-ink3">
              {i.is_new && <StatusChip variant="newSolid" className="mr-1.5 animate-none! px-2! py-0!">{C.newChip}</StatusChip>}
              {i.summary}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(InteractionList);
