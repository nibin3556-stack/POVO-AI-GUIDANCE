import { memo } from 'react';
import AppCard from '../../components/common/AppCard';
import AsyncContent from '../../components/common/AsyncContent';
import { LABELS } from '../../constants/labels';
import { useGetMustWinsQuery } from '../../redux/api/targetsApi';
import { selectAssessedHcpIds } from '../../redux/callSession/callSessionSelectors';
import { useAppSelector } from '../../redux/hooks';
import MustWinList from './MustWinList';

interface MustWinsProps {
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

/** Must-Wins: top 5 by HS volume (non-JAK) and top 5 JAK Inhibitor users. */
const MustWins = ({ selectedId, onSelect }: MustWinsProps) => {
  const { data, error, isLoading, refetch } = useGetMustWinsQuery();
  const assessed = useAppSelector(selectAssessedHcpIds);
  return (
    <AppCard title={LABELS.preCall.mustWins} tone="grey" subtitle={data?.territory_name} bodyClassName="p-3.5 tall:px-4 tall:pb-4">
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data && (
          <div className="flex flex-1 flex-col gap-3.5">
            <MustWinList title={LABELS.preCall.topHs} targets={data.hs_volume} showJak={false} selectedId={selectedId} onSelect={onSelect} assessed={assessed} />
            <MustWinList title={LABELS.preCall.topJak} targets={data.hs_jak} showJak selectedId={selectedId} onSelect={onSelect} assessed={assessed} />
          </div>
        )}
      </AsyncContent>
    </AppCard>
  );
};

export default memo(MustWins);
