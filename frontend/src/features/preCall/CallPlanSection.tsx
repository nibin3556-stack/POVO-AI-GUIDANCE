import { memo } from 'react';
import AppCard from '../../components/common/AppCard';
import ErrorState from '../../components/common/ErrorState';
import { LABELS } from '../../constants/labels';
import { useGetFacetsQuery } from '../../redux/api/targetsApi';
import CallPlanFilters from './CallPlanFilters';
import CallPlanTable from './CallPlanTable';

interface CallPlanSectionProps {
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
  flashId: string | null;
}

const L = LABELS.preCall;

/** Call Plan Targets: filters, then the table. */
const CallPlanSection = ({ selectedId, onSelect, flashId }: CallPlanSectionProps) => {
  const facets = useGetFacetsQuery();
  return (
    <AppCard title={L.callPlanTargets} tone="grey" overflowVisible>
      {facets.data && <CallPlanFilters facets={facets.data} />}
      {facets.error && <ErrorState message={(facets.error as { message?: string }).message} onRetry={() => void facets.refetch()} className="m-3" />}
      <div className="flex flex-1 flex-col p-3.5 tall:px-4 tall:pb-4">
        <CallPlanTable facets={facets.data} selectedId={selectedId} onSelect={onSelect} flashId={flashId} />
      </div>
    </AppCard>
  );
};

export default memo(CallPlanSection);
