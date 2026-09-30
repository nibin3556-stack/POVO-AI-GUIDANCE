import { memo, useCallback, useMemo } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import DataTable, { type DataColumn } from '../../components/common/DataTable';
import FocusTag from '../../components/common/FocusTag';
import Icon from '../../components/common/Icon';
import StatusChip from '../../components/common/StatusChip';
import { LABELS } from '../../constants/labels';
import { accountToggled } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Account, Facets } from '../../types/models';
import { focusColor, focusLabel } from '../../utils/targets';
import AccountTargets from './AccountTargets';

interface AccountsTableProps {
  accounts: Account[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  facets: Facets | undefined;
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

const L = LABELS.preCall;

const ClaimsOnlyNote = ({ hs }: { hs: number }) => {
  const copy = L.claimsOnly(hs);
  return (
    <div className="flex items-center gap-2 text-[12.8px] font-medium text-ink2">
      <Icon name="domain" className="text-xl text-warn" />
      <span>
        {copy.before}
        <b>{copy.strong}</b>
        {copy.after}
      </span>
    </div>
  );
};

/** Accounts, including claims-only ones; a row expands to its call plan targets. */
const AccountsTable = ({ accounts, isLoading, error, onRetry, facets, selectedId, onSelect }: AccountsTableProps) => {
  const dispatch = useAppDispatch();
  const openId = useAppSelector((s) => s.callSession.openAccountId);
  const columns = useMemo<DataColumn<Account>[]>(
    () => [
      {
        key: 'account',
        header: L.account,
        width: 'w-[32%]',
        render: (a) => (
          <span className="inline-flex items-center">
            <Icon name={a.account_id === openId ? 'expand_more' : 'chevron_right'} className="mr-1 text-[19px] text-blue" />
            <b className="overflow-hidden text-ellipsis font-bold text-ink">{a.account_name}</b>
          </span>
        ),
        title: (a) => a.account_name,
      },
      { key: 'location', header: L.location, width: 'w-[19%]', render: (a) => `${a.city} ${a.zip}` },
      { key: 'hs', header: L.hsPatients, width: 'w-[10%]', align: 'right', render: (a) => <b className="font-bold text-ink">{a.hs_patients}</b> },
      { key: 'povo', header: L.povoPatients, width: 'w-[9%]', align: 'right', render: (a) => a.povo_patients },
      {
        key: 'targets',
        header: L.targets,
        width: 'w-[16%]',
        render: (a) => (a.is_claims_only ? <StatusChip variant="risk">{L.noAffiliations}</StatusChip> : L.targetsInPlan(a.target_count, a.in_plan_count)),
      },
      { key: 'focus', header: L.mainFocus, width: 'w-[14%]', render: (a) => <FocusTag label={focusLabel(a.main_focus, facets?.focus)} color={focusColor(a.main_focus, facets?.focus)} /> },
    ],
    [facets, openId],
  );
  const renderExpanded = useCallback(
    (a: Account) => (a.is_claims_only ? <ClaimsOnlyNote hs={a.hs_patients} /> : <AccountTargets accountId={a.account_id} focusFacets={facets?.focus} selectedId={selectedId} onSelect={onSelect} />),
    [facets, onSelect, selectedId],
  );
  return (
    <AsyncContent isLoading={isLoading} error={error} onRetry={onRetry}>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <DataTable
          ariaLabel={L.accounts}
          columns={columns}
          rows={accounts}
          getRowKey={(a) => a.account_id}
          onRowClick={(a) => dispatch(accountToggled(a.account_id))}
          expandedKey={openId}
          renderExpanded={renderExpanded}
          emptyMessage={L.noAccounts}
        />
      </div>
    </AsyncContent>
  );
};

export default memo(AccountsTable);
