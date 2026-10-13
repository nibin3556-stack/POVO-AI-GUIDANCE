import { memo, useCallback, useMemo, type ReactNode } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import DataTable, { type DataColumn } from '../../components/common/DataTable';
import DecileChip from '../../components/common/DecileChip';
import CompetitiveFocusTag from '../../components/common/CompetitiveFocusTag';
import Pager from '../../components/common/Pager';
import SegmentTag from '../../components/common/SegmentTag';
import { TARGETS_PAGE_SIZE } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useGetTargetsQuery } from '../../redux/api/targetsApi';
import { selectAssessedHcpIds, selectFilters, selectPage, selectSort, selectTargetQuery } from '../../redux/callSession/callSessionSelectors';
import { accountsCleared, filterToggled, pageSelected, rolesSet, sortSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Facets, Target, TargetSortKey } from '../../types/models';
import { useReference } from '../../hooks/useReference';
import { cx } from '../../utils/cx';
import type { ReferenceLookup } from '../../utils/reference';
import { targetFullName } from '../../utils/targets';
import AccountFilterMenu from './AccountFilterMenu';
import LastCallCell from './LastCallCell';
import RoleFilterMenu from './RoleFilterMenu';
import TargetName from './TargetName';

interface CallPlanTableProps {
  facets: Facets | undefined;
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

const L = LABELS.preCall;

/** Account and Location: 2 lines at most, the full text on hover. */
const Clamp2 = ({ children }: { children: ReactNode }) => <span className="line-clamp-2 [overflow-wrap:normal]">{children}</span>;
const WRAP = 'whitespace-normal! leading-[1.22]';

/**
 * Ten columns (POVO Pulse adds Segment, the name wrapping to 2 lines). Widths:
 * the first set below 1400px, the second from 1400px. Numbers, decile chips,
 * ZIP codes and dates are centred (client rule).
 */
const buildColumns = (selectedId: string | null, assessed: string[], ref: ReferenceLookup, roleMenu: ReactNode, accountMenu: ReactNode): DataColumn<Target>[] => [
  { key: 'name', header: L.name, width: 'w-[18.5%] min-[1400px]:w-[16.4%]', headerExtra: roleMenu, cellClassName: WRAP, render: (t) => <TargetName target={t} selected={t.hcp_id === selectedId} done={assessed.includes(t.hcp_id)} />, title: targetFullName },
  { key: 'account', header: L.account, width: 'w-[10%] min-[1400px]:w-[12.6%]', headerExtra: accountMenu, cellClassName: WRAP, render: (t) => <Clamp2>{t.account_name}</Clamp2>, title: (t) => t.account_name },
  { key: 'location', header: L.location, width: 'w-[8.8%] min-[1400px]:w-[9.5%]', cellClassName: WRAP, render: (t) => <Clamp2>{`${t.city}, ${t.state}`}</Clamp2>, title: (t) => `${t.city}, ${t.state}` },
  { key: 'zip', header: L.zip, width: 'w-[6.2%] min-[1400px]:w-[6%]', align: 'center', render: (t) => t.zip },
  {
    key: 'segment',
    header: L.segment,
    width: 'w-[13%]',
    cellClassName: WRAP,
    render: (t) => <SegmentTag label={ref.segment(t.segment_code)?.short_name ?? t.segment_code} color={ref.segmentColor(t.segment_code)} wrap />,
    title: (t) => ref.segment(t.segment_code)?.full_name,
  },
  { key: 'focus', header: L.competitiveFocus, width: 'w-[13%] min-[1400px]:w-[17.4%]', render: (t) => <CompetitiveFocusTag code={t.competitive_focus} /> },
  { key: 'decile', header: L.decile, width: 'w-[6%] min-[1400px]:w-[5.4%]', align: 'center', sortable: true, render: (t) => <DecileChip decile={t.decile} tier={t.tier_code} /> },
  { key: 'hs_patients', header: L.hsVolume, width: 'w-[7.5%] min-[1400px]:w-[6%]', align: 'center', sortable: true, render: (t) => <b className="font-bold text-ink">{t.hs_patients}</b> },
  { key: 'pef', header: L.pefs, width: 'w-[4.5%] min-[1400px]:w-[4.4%]', align: 'center', sortable: true, render: (t) => <b className="font-bold text-ink">{t.pef}</b> },
  { key: 'last_call_date', header: L.lastCallDate, width: 'w-[12.5%] min-[1400px]:w-[8.9%]', align: 'center', sortable: true, render: (t) => <LastCallCell date={t.last_call_date} /> },
];

/** One text size in every column: 12px, 12.8px from 1400px, 14px from 1700px; headers wrap by word. */
const TABLE_TEXT =
  '[&_td]:text-[12px] min-[1400px]:[&_td]:text-[12.8px] min-[1700px]:[&_td]:text-[14px] [&_th]:text-[10.2px] [&_th]:tracking-normal min-[1400px]:[&_th]:text-[11.4px] [&_th]:[overflow-wrap:normal]';

/** Full Call Plan: in-plan targets that are not Must-Wins, 10 per page, sorted and filtered on the server. */
const CallPlanTable = ({ facets, selectedId, onSelect }: CallPlanTableProps) => {
  const dispatch = useAppDispatch();
  const query = useAppSelector(selectTargetQuery);
  const sort = useAppSelector(selectSort);
  const page = useAppSelector(selectPage);
  const filters = useAppSelector(selectFilters);
  const assessed = useAppSelector(selectAssessedHcpIds);
  const ref = useReference();
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
  const columns = useMemo(() => buildColumns(selectedId, assessed, ref, roleMenu, accountMenu), [selectedId, assessed, ref, roleMenu, accountMenu]);
  const handleSort = useCallback((key: string) => dispatch(sortSelected(key as TargetSortKey)), [dispatch]);
  const handleRow = useCallback((t: Target) => onSelect(t.hcp_id), [onSelect]);
  const handlePage = useCallback((p: number) => dispatch(pageSelected(p)), [dispatch]);
  // Assessed targets keep a static green highlight (no flashing in Pre-Call Planning).
  const rowDone = useCallback((t: Target) => assessed.includes(t.hcp_id), [assessed]);

  return (
    <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()}>
      <div className={cx('flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white', TABLE_TEXT)}>
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
          rowDone={rowDone}
        />
        <Pager page={page} pageSize={TARGETS_PAGE_SIZE} total={data?.total_items ?? 0} onPage={handlePage} />
      </div>
    </AsyncContent>
  );
};

export default memo(CallPlanTable);
