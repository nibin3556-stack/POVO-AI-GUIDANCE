import { memo, useMemo } from 'react';
import AppCard from '../../components/common/AppCard';
import ErrorState from '../../components/common/ErrorState';
import SegmentedToggle from '../../components/common/SegmentedToggle';
import { ACCOUNTS_PAGE_SIZE, DEFAULT_TARGET_SORT } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGetAccountsQuery, useGetFacetsQuery, useGetTargetsQuery } from '../../redux/api/targetsApi';
import { selectFilters, selectTargetQuery } from '../../redux/callSession/callSessionSelectors';
import { viewSelected, type PlanView } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { filterAccounts } from '../../utils/targets';
import AccountsTable from './AccountsTable';
import CallPlanFilters from './CallPlanFilters';
import CallPlanTable from './CallPlanTable';

interface CallPlanSectionProps {
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

const L = LABELS.preCall;

/** Call Plan Targets: Full Call Plan / Accounts sub-tabs, filters, then the table. */
const CallPlanSection = ({ selectedId, onSelect }: CallPlanSectionProps) => {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.callSession.view);
  const filters = useAppSelector(selectFilters);
  const query = useAppSelector(selectTargetQuery);
  const facets = useGetFacetsQuery();
  const targets = useGetTargetsQuery(query);
  const accounts = useGetAccountsQuery({ page: 1, limit: ACCOUNTS_PAGE_SIZE, sort: DEFAULT_TARGET_SORT });
  const shownAccounts = useMemo(() => filterAccounts(accounts.data?.items ?? [], filters), [accounts.data, filters]);

  const tabs = (
    <SegmentedToggle<PlanView>
      variant="tabs"
      ariaLabel={L.viewAria}
      value={view}
      onChange={(v) => dispatch(viewSelected(v))}
      options={[
        { value: 'plan', label: L.fullCallPlan, count: targets.data?.total_items ?? 0 },
        { value: 'accounts', label: L.accounts, count: shownAccounts.length },
      ]}
    />
  );

  return (
    <AppCard title={L.callPlanTargets} actions={tabs} overflowVisible>
      {facets.data && <CallPlanFilters facets={facets.data} />}
      {facets.error && <ErrorState message={(facets.error as { message?: string }).message} onRetry={() => void facets.refetch()} className="m-3" />}
      <div className="flex flex-1 flex-col p-3.5 tall:px-4 tall:pb-4">
        {view === 'plan' ? (
          <CallPlanTable facets={facets.data} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <AccountsTable
            accounts={shownAccounts}
            isLoading={accounts.isLoading}
            error={accounts.error}
            onRetry={() => void accounts.refetch()}
            facets={facets.data}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        )}
      </div>
    </AppCard>
  );
};

export default memo(CallPlanSection);
