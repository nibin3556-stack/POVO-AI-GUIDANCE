import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import AsyncContent from '../components/common/AsyncContent';
import EmptyState from '../components/common/EmptyState';
import { LABELS } from '../constants/labels';
import AssessmentForm from '../features/postCall/AssessmentForm';
import { useCallParticipants } from '../hooks/useCallParticipants';
import { useEnsureCallQuery } from '../redux/api/callsApi';
import { selectSelectedHcpId } from '../redux/callSession/callSessionSelectors';
import { targetSelected } from '../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../redux/hooks';

const PostCallContent = ({ hcpId }: { hcpId: string }) => {
  const { profile, primary, selected, ready, isLoading, error, refetch } = useCallParticipants(hcpId);
  const participantIds = useMemo(() => selected.map((p) => p.hcp_id), [selected]);
  const args = profile && ready ? { hcp_id: profile.primary_hcp_id, participant_ids: participantIds } : null;
  const call = useEnsureCallQuery(args ?? { hcp_id: '', participant_ids: [] }, { skip: !args });
  return (
    <AsyncContent isLoading={isLoading || call.isLoading || !args} error={error ?? call.error} onRetry={() => void (error ? refetch() : call.refetch())} loadingLabel={LABELS.postCall.callLoading}>
      {call.data && primary && (
        <AssessmentForm key={call.data.call_id} call={call.data} hcpId={hcpId} primaryId={primary.hcp_id} participants={selected} />
      )}
    </AsyncContent>
  );
};

/** Tab 3: opening it opens (or creates) today's planned call for the selected target. */
const PostCallPage = () => {
  const { hcpId } = useParams();
  const dispatch = useAppDispatch();
  const selectedHcpId = useAppSelector(selectSelectedHcpId);
  const justSubmitted = useAppSelector((s) => s.callSession.justSubmittedHcpId);

  // Sync: a deep link selects its target (but not the one just submitted, while Submit leaves this page).
  useEffect(() => {
    if (hcpId && hcpId !== selectedHcpId && hcpId !== justSubmitted) dispatch(targetSelected({ hcpId }));
  }, [dispatch, hcpId, justSubmitted, selectedHcpId]);

  if (!hcpId) return <EmptyState message={LABELS.postCall.noParticipants} variant="hint" />;
  return (
    <div data-testid="post-call-page">
      <PostCallContent hcpId={hcpId} />
    </div>
  );
};

export default PostCallPage;
