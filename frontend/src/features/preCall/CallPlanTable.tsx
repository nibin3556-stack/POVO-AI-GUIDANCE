import { memo, useCallback, useMemo, type ReactNode } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import DataTable, { type DataColumn } from '../../components/common/DataTable';
import DecileChip from '../../components/common/DecileChip';
import CompetitiveFocusTag from '../../components/common/CompetitiveFocusTag';
import Pager from '../../components/common/Pager';
import { TARGETS_PAGE_SIZE } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGetTargetsQuery } from '../../redux/api/targetsApi';
import { selectFilters, selectPage, selectSort, selectTargetQuery } from '../../redux/callSession/callSessionSelectors';
import { accountsCleared, filterToggled, pageSelected, rolesSet, sortSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Facets, Target, TargetSortKey } from '../../types/models';
import { targetFullName } from '../../utils/targets';
import AccountFilterMenu from './AccountFilterMenu';
import LastCallCell from './LastCallCell';
import RoleFilterMenu from './RoleFilterMenu';
import TargetName from './TargetName';

interface CallPlanTableProps {
  facets: Facets | undefined;
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
  flashId: string | null;
}

const L = LABELS.preCall;

/** Numbers, decile chips, ZIP codes and dates are centred (client rule). */
const buildColumns = (selectedId: string | null, roleMenu: ReactNode, accountMenu: ReactNode): DataColumn<Target>[] => [
  { key: 'name', header: L.name, width: 'w-[17%]', headerExtra: roleMenu, render: (t) => <TargetName target={t} selected={t.hcp_id === selectedId} />, title: targetFullName },
  { key: 'account', header: L.account, width: 'w-[15%]', headerExtra: accountMenu, render: (t) => t.account_name, title: (t) => t.account_name },
  { key: 'location', header: L.location, width: 'w-[11.5%]', render: (t) => `${t.city}, ${t.state}` },
  { key: 'zip', header: L.zip, width: 'w-[7%]', align: 'center', render: (t) => t.zip },
  { key: 'focus', header: L.competitiveFocus, width: 'w-[12%]', render: (t) => <CompetitiveFocusTag code={t.competitive_focus} /> },
  { key: 'decile', header: L.decile, width: 'w-[7%]', align: 'center', sortable: true, render: (t) => <DecileChip decile={t.decile} tier={t.tier_code} /> },
  { key: 'hs_patients', header: L.hsVolume, width: 'w-[9%]', align: 'center', sortable: true, render: (t) => <b className="text-sm font-bold text-ink">{t.hs_patients}</b> },
  { key: 'pef', header: L.pefs, width: 'w-[9%]', align: 'center', sortable: true, render: (t) => <b className="text-sm font-bold text-ink">{t.pef}</b> },
  { key: 'last_call_date', header: L.lastCallDate, width: 'w-[12.5%]', align: 'center', sortable: true, render: (t) => <LastCallCell date={t.last_call_date} /> },
];

/** Full Call Plan: in-plan targets that are not Must-Wins, 10 per page, sorted and filtered on the server. */
const CallPlanTable = ({ facets, selectedId, onSelect, flashId }: CallPlanTableProps) => {
  const dispatch = useAppDispatch();
  const query = useAppSelector(selectTargetQuery);
  const sort = useAppSelector(selectSort);
  const page = useAppSelector(selectPage);
  const filters = useAppSelector(selectFilters);
  const { data, error, isLoading, refetch } = useGetTargetsQuery(query);

  const roleMenu = useMemo(
    () => <RoleFilterMenu selected={filters.role} counts={facets?.role} onChange={(roles) => dispatch(rolesSet(roles))} />,
    [dispatch, facets?.role, filters.role],
  );
  const accountMenu = useMemo(
    () => (
      <AccountFilterMenu
        selected={filters.account}
        accounts={facets?.account}
        onToggle={(id) => dispatch(filterToggled({ group: 'account', value: id }))}
        onClear={() => dispatch(accountsCleared())}
      />
    ),
    [dispatch, facets?.account, filters.account],
  );
  const columns = useMemo(() => buildColumns(selectedId, roleMenu, accountMenu), [selectedId, roleMenu, accountMenu]);
  const handleSort = useCallback((key: string) => dispatch(sortSelected(key as TargetSortKey)), [dispatch]);
  const handleRow = useCallback((t: Target) => onSelect(t.hcp_id), [onSelect]);
  const handlePage = useCallback((p: number) => dispatch(pageSelected(p)), [dispatch]);
  const rowClass = useCallback((t: Target) => (t.hcp_id === flashId ? 'animate-just-done' : undefined), [flashId]);

  return (
    <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()}>
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white">
        <DataTable
          ariaLabel={L.fullCallPlan}
          columns={columns}
          rows={data?.items ?? []}
          getRowKey={(t) => t.hcp_id}
          onRowClick={handleRow}
          selectedKey={selectedId}
          sort={sort}
          onSort={handleSort}
          sortLabel={L.sortBy}
          emptyMessage={L.noTargets}
          rowClassName={rowClass}
        />
        <Pager page={page} pageSize={TARGETS_PAGE_SIZE} total={data?.total_items ?? 0} onPage={handlePage} />
      </div>
    </AsyncContent>
  );
};

export default memo(CallPlanTable);
