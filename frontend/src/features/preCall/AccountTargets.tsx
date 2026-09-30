import { memo, useMemo } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import DataTable, { type DataColumn } from '../../components/common/DataTable';
import DecileChip from '../../components/common/DecileChip';
import FocusTag from '../../components/common/FocusTag';
import { LABELS } from '../../constants/labels';
import { useGetAccountTargetsQuery } from '../../redux/api/targetsApi';
import { selectFilters } from '../../redux/callSession/callSessionSelectors';
import { useAppSelector } from '../../redux/hooks';
import type { Facet, Target } from '../../types/models';
import { focusColor, focusLabel, passesFilters } from '../../utils/targets';
import LastCallCell from './LastCallCell';
import TargetName from './TargetName';

interface AccountTargetsProps {
  accountId: string;
  focusFacets: Facet[] | undefined;
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

const L = LABELS.preCall;

/** The call plan targets inside an open account (Name | Competitive Focus | Decile | HS Patients | Last Call Date). */
const AccountTargets = ({ accountId, focusFacets, selectedId, onSelect }: AccountTargetsProps) => {
  const { data, error, isLoading, refetch } = useGetAccountTargetsQuery(accountId);
  const filters = useAppSelector(selectFilters);
  const rows = useMemo(
    () => (data ?? []).filter((t) => passesFilters(t, filters)).sort((a, b) => b.hs_patients - a.hs_patients),
    [data, filters],
  );
  const columns = useMemo<DataColumn<Target>[]>(
    () => [
      { key: 'name', header: L.name, width: 'w-[32%]', render: (t) => <TargetName target={t} selected={t.hcp_id === selectedId} /> },
      { key: 'focus', header: L.competitiveFocus, width: 'w-[22%]', render: (t) => <FocusTag label={focusLabel(t.competitive_focus, focusFacets)} color={focusColor(t.competitive_focus, focusFacets)} /> },
      { key: 'decile', header: L.decile, width: 'w-[12%]', align: 'right', render: (t) => <DecileChip decile={t.decile} tier={t.tier_code} /> },
      { key: 'hs', header: L.hsPatients, width: 'w-[14%]', align: 'right', render: (t) => <b className="font-bold text-ink">{t.hs_patients}</b> },
      { key: 'last', header: L.lastCallDate, width: 'w-[20%]', align: 'right', render: (t) => <LastCallCell date={t.last_call_date} /> },
    ],
    [focusFacets, selectedId],
  );
  return (
    <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!rows.length} emptyMessage={L.noAccountTargets}>
      <div className="scroll-thin max-h-[clamp(170px,calc(100vh-520px),320px)] overflow-y-auto rounded-[9px] border border-line2 bg-white">
        <DataTable ariaLabel={L.targets} columns={columns} rows={rows} getRowKey={(t) => t.hcp_id} onRowClick={(t) => onSelect(t.hcp_id)} selectedKey={selectedId} emptyMessage={L.noAccountTargets} compact />
      </div>
    </AsyncContent>
  );
};

export default memo(AccountTargets);
