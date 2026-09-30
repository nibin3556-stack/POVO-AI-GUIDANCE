import { memo, useCallback, useMemo, type ReactNode } from 'react';
import AsyncContent from '../../../components/common/AsyncContent';
import EmptyState from '../../../components/common/EmptyState';
import Icon from '../../../components/common/Icon';
import SegmentedToggle, { type ToggleOption } from '../../../components/common/SegmentedToggle';
import { LABELS } from '../../../constants/labels';
import { useReference } from '../../../hooks/useReference';
import { useGetCallPrepQuery } from '../../../redux/api/callPrepApi';
import { prepCategorySelected, prepParticipantSelected, revealCompleted } from '../../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import type { Category, Participant } from '../../../types/models';
import { revealKey } from '../../../utils/callPrep';
import PrepPanel from './PrepPanel';
import RoleTabs from './RoleTabs';

interface CallPreparationCardProps {
  primaryId: string;
  participants: Participant[];
}

const C = LABELS.callPrep;

const Header = ({ status, pill }: { status?: ReactNode; pill?: ReactNode }) => (
  <header className="flex items-center gap-[9px] border-b border-line2 px-3 py-2 short:py-1.5 tall:px-4 tall:py-[11px]">
    <Icon name="forum" className="text-[21.3px] text-teal" />
    <b className="text-[16.2px] font-semibold text-ink">{C.preparationTitle}</b>
    {pill}
    {pill ? <span className="ml-auto">{status}</span> : status}
  </header>
);

/** Card 2: category toggle, role tabs and the AI-prepared talking points (top 3). */
const CallPreparationCard = ({ primaryId, participants }: CallPreparationCardProps) => {
  const dispatch = useAppDispatch();
  const ref = useReference();
  const options = useMemo<ToggleOption<Category>[]>(
    () => ref.categoryCodes.map((value) => ({ value, label: <span className="min-w-0 [overflow-wrap:anywhere]">{ref.categoryLabel(value)}</span> })),
    [ref],
  );
  const category = useAppSelector((s) => s.callSession.prepCategory);
  const chosen = useAppSelector((s) => s.callSession.prepParticipantId);
  const revealed = useAppSelector((s) => s.callSession.revealed);
  const active = participants.find((p) => p.hcp_id === chosen) ?? participants[0];
  const args = active && category ? { hcp_id: primaryId, participant_id: active.hcp_id, category } : null;
  const prep = useGetCallPrepQuery(args ?? { hcp_id: '', participant_id: '', category: 'messaging' }, { skip: !args });
  const key = prep.data && category ? revealKey(prep.data.participant_id, category, prep.data.revision_no) : null;
  const onRevealed = useCallback(() => key && dispatch(revealCompleted(key)), [dispatch, key]);
  const renderHeader = useCallback((status: ReactNode, pill: ReactNode) => <Header status={status} pill={pill} />, []);

  const controls = (
    <>
      <SegmentedToggle variant="grid" options={options} value={category} onChange={(c) => dispatch(prepCategorySelected(c))} ariaLabel={C.categoryAria} />
      {active && category && <RoleTabs participants={participants} activeId={active.hcp_id} onSelect={(id) => dispatch(prepParticipantSelected(id))} ariaLabel={C.preparationTitle} />}
    </>
  );

  const ready = Boolean(prep.data && category && key && !prep.isFetching);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-e1">
      {ready && prep.data && category && key ? (
        <PrepPanel key={key} data={prep.data} category={category} animate={!revealed[key]} onRevealed={onRevealed} renderHeader={renderHeader} controls={controls} />
      ) : (
        <>
          <Header />
          <div className="flex flex-1 flex-col gap-3 p-3 tall:p-4">
            {controls}
            {!category ? (
              <EmptyState message={C.chooseCategory} variant="hint" />
            ) : (
              <AsyncContent isLoading={prep.isLoading || prep.isFetching} error={prep.error} onRetry={() => void prep.refetch()}>
                {null}
              </AsyncContent>
            )}
          </div>
        </>
      )}
    </article>
  );
};

export default memo(CallPreparationCard);
