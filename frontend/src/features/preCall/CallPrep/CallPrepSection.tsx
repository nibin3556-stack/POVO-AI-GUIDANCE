import { memo, useEffect, useMemo, useRef } from 'react';
import AppCard from '../../../components/common/AppCard';
import AsyncContent from '../../../components/common/AsyncContent';
import { TIMING } from '../../../constants/constant';
import { LABELS } from '../../../constants/labels';
import { useCallParticipants } from '../../../hooks/useCallParticipants';
import { participantToggled, scrollHandled } from '../../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import { callPrepName } from '../../../utils/callPrep';
import CallPreparationCard from './CallPreparationCard';
import ParticipantHistoryCard from './ParticipantHistoryCard';
import ParticipantToggles from './ParticipantToggles';

interface CallPrepSectionProps {
  hcpId: string;
}

/** Call Prep for the selected target: participant toggles, history card and preparation card. */
const CallPrepSection = ({ hcpId }: CallPrepSectionProps) => {
  const dispatch = useAppDispatch();
  const { profile, primary, selected, participantIds, isLoading, error, refetch } = useCallParticipants(hcpId);
  const scrollToPrep = useAppSelector((s) => s.callSession.scrollToPrep);
  const ref = useRef<HTMLElement>(null);

  // Sync: bring Call Prep into view after a selection or after the next-call revision.
  useEffect(() => {
    if (!scrollToPrep || !profile) return undefined;
    const timer = setTimeout(() => {
      ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      dispatch(scrollHandled());
    }, TIMING.SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dispatch, profile, scrollToPrep]);

  const order = useMemo(() => profile?.participants.map((p) => p.hcp_id) ?? [], [profile]);
  const toggles = profile ? (
    <ParticipantToggles participants={profile.participants} selectedIds={participantIds} onToggle={(id) => dispatch(participantToggled({ id, order }))} />
  ) : null;

  return (
    <AppCard ref={ref} testId="call-prep" title={primary ? LABELS.callPrep.title(callPrepName(primary)) : LABELS.callPrep.historyTitle} actions={toggles} className="scroll-mt-2">
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!primary}>
        {profile && primary && (
          <div className="grid grid-cols-2 gap-3 p-3 tall:gap-4 tall:p-4 max-bp1180:grid-cols-1">
            <ParticipantHistoryCard primary={primary} participants={selected} />
            <CallPreparationCard primaryId={profile.primary_hcp_id} participants={selected} />
          </div>
        )}
      </AsyncContent>
    </AppCard>
  );
};

export default memo(CallPrepSection);
