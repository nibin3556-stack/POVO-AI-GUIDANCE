import { memo } from 'react';
import Avatar from '../../../components/common/Avatar';
import Icon from '../../../components/common/Icon';
import SegmentPill from '../../../components/common/SegmentPill';
import StatusChip from '../../../components/common/StatusChip';
import { LABELS } from '../../../constants/labels';
import { historyParticipantSelected, interactionFilterSelected } from '../../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import type { Participant } from '../../../types/models';
import { callPrepName, isPostCallBullet, participantHasNewActivity } from '../../../utils/callPrep';
import { cx } from '../../../utils/cx';
import { nameInitials } from '../../../utils/format';
import InteractionList from './InteractionList';
import RoleTabs from './RoleTabs';
import StatTiles from './StatTiles';

interface ParticipantHistoryCardProps {
  primary: Participant;
  participants: Participant[];
}

const C = LABELS.callPrep;

/** Card 1: who the participants are, their stats, five bullets and the interaction history. */
const ParticipantHistoryCard = ({ primary, participants }: ParticipantHistoryCardProps) => {
  const dispatch = useAppDispatch();
  const chosen = useAppSelector((s) => s.callSession.historyParticipantId);
  const filter = useAppSelector((s) => s.callSession.interactionFilter);
  const active = participants.find((p) => p.hcp_id === chosen) ?? participants[0] ?? primary;
  const revised = participantHasNewActivity(active);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border-[1.5px] border-t-4 border-[#B9CFE6] border-t-[#0B7A78] bg-white shadow-e1">
      <header className="flex items-center gap-[9px] border-b-2 border-[#8FCFC6] bg-[#DFF2EF] px-3 py-2 short:py-1.5 tall:px-4 tall:py-[11px]">
        <Icon name="group" className="text-[21.3px] text-[#0B7A78]" />
        <b className="text-[16.2px] font-bold text-[#0B4F4F]">{C.historyTitle}</b>
      </header>
      <div className="flex flex-1 flex-col gap-[9px] p-3 short:gap-[7px] tall:gap-3 tall:p-4">
        <div className="flex items-center gap-[11px]">
          <Avatar initials={nameInitials(primary.name)} variant="square" />
          <span>
            <b className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16.2px] font-bold text-ink">
              {callPrepName(primary)}
              <SegmentPill code={primary.segment_code} />
            </b>
            <span className="block text-[13.4px] font-medium text-ink3">
              {primary.account_name} · {primary.city} {primary.zip}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoleTabs participants={participants} activeId={active.hcp_id} onSelect={(id) => dispatch(historyParticipantSelected(id))} ariaLabel={C.historyTitle} />
          {active.role_type !== 'HCP' && <SegmentPill code={active.segment_code} className="ml-auto" />}
        </div>
        <StatTiles participant={active} revised={revised} />
        <ul className="m-0 flex list-none flex-col gap-1 p-0 short:gap-0.5 tall:gap-1.5">
          {active.bullets.map((bullet) => {
            const isNew = revised && isPostCallBullet(bullet);
            return (
              <li
                key={bullet}
                className={cx(
                  'relative pl-[15px] text-[13.6px] font-medium leading-[1.4] text-ink2 before:absolute before:left-0 before:top-[7px] before:size-1.5 before:rounded-full before:bg-[#13A09B] short:text-[13px]',
                  isNew && '-ml-[5px] rounded-[7px] bg-[#EAF6EE] py-[3px] pl-5 pr-2 animate-green-glow before:left-2 before:bg-green',
                )}
              >
                {bullet}
                {isNew && <StatusChip variant="newSolid" className="ml-2 px-2! py-0!">{C.newChip}</StatusChip>}
              </li>
            );
          })}
        </ul>
        <InteractionList participant={active} filter={filter} onFilter={(f) => dispatch(interactionFilterSelected(f))} />
      </div>
    </article>
  );
};

export default memo(ParticipantHistoryCard);
