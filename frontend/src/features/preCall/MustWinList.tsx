import { Tooltip } from '@mui/material';
import { memo } from 'react';
import DecileChip from '../../components/common/DecileChip';
import EmptyState from '../../components/common/EmptyState';
import CompetitiveFocusTag from '../../components/common/CompetitiveFocusTag';
import { LABELS } from '../../constants/labels';
import type { Target } from '../../types/models';
import { cx } from '../../utils/cx';
import { targetFullName } from '../../utils/targets';
import LastCallCell from './LastCallCell';
import TargetName from './TargetName';

interface MustWinListProps {
  title: string;
  targets: Target[];
  showJak: boolean;
  selectedId: string | null;
  onSelect: (hcpId: string) => void;
}

const L = LABELS.preCall;
const GRID = 'grid grid-cols-[minmax(0,1fr)_104px_40px_136px_72px] items-center gap-1.5 max-bp1700:grid-cols-[minmax(0,1fr)_100px_38px_118px_68px] max-bp1400:grid-cols-[minmax(0,1fr)_96px_36px_96px_64px] max-bp1400:gap-1';
const HEAD = 'self-end text-[9.8px] font-bold uppercase leading-[1.15] tracking-[.1px] text-blued';

const TipBody = ({ t }: { t: Target }) => (
  <span className="block leading-[1.45]">
    <b className="block text-[13.6px] font-bold text-ink">{targetFullName(t)}</b>
    {L.mustWinTip({ account: t.account_name, city: t.city, zip: t.zip, decile: t.decile, hs: t.hs_patients, jak: t.jak_patients, povo: t.povo_patients }).map((line) => (
      <span key={line} className="block">
        {line}
      </span>
    ))}
  </span>
);

const Row = memo(({ t, index, showJak, selected, onSelect }: { t: Target; index: number; showJak: boolean; selected: boolean; onSelect: (id: string) => void }) => (
  <Tooltip title={<TipBody t={t} />} placement="right" enterDelay={200} disableInteractive>
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(t.hcp_id)}
      className={cx(GRID, '-mx-1 rounded-md px-1 py-px text-left transition-colors hover:bg-[#F2F7FC]', selected && 'bg-[#E3EFFA] shadow-[inset_3px_0_0_var(--color-blue)]')}
    >
      <span className="min-w-0 text-[13.4px]">
        <TargetName target={t} selected={selected} index={index} />
      </span>
      <span className="flex min-w-0 items-center">
        <CompetitiveFocusTag code={t.competitive_focus} />
      </span>
      <span className="flex justify-center">
        <DecileChip decile={t.decile} tier={t.tier_code} />
      </span>
      <span className="flex flex-wrap items-baseline justify-center gap-x-[5px] text-[13.4px] font-bold text-ink">
        {t.hs_patients}
        {showJak && <span className="whitespace-nowrap text-[11.6px] font-semibold text-purple2">{L.jakCount(t.jak_patients)}</span>}
      </span>
      <span className="flex justify-end whitespace-nowrap text-[12.2px] font-semibold text-ink2">
        <LastCallCell date={t.last_call_date} />
      </span>
    </button>
  </Tooltip>
));
Row.displayName = 'MustWinRow';

/** One Must-Wins list: top 5 with competitive focus, decile, HS patients and last call. */
const MustWinList = ({ title, targets, showJak, selectedId, onSelect }: MustWinListProps) => (
  <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-white px-[13px] pb-2.5 pt-[9px] tall:px-4 tall:pb-3.5 tall:pt-3">
    <div className="text-[15.2px] font-semibold text-blued">{title}</div>
    <div className={cx(GRID, 'mt-2 mb-[-4px]')}>
      <span />
      <span className={HEAD}>{L.competitiveFocus}</span>
      <span className={cx(HEAD, 'text-center')}>{L.decile}</span>
      <span className={cx(HEAD, 'text-center')}>{L.hsPatients}</span>
      <span className={cx(HEAD, 'text-right')}>{L.lastCall}</span>
    </div>
    <div className="mt-2 flex flex-1 flex-col justify-evenly gap-1.5">
      {targets.length === 0 && <EmptyState message={L.mustWinsEmpty} />}
      {targets.map((t, i) => (
        <Row key={t.hcp_id} t={t} index={i + 1} showJak={showJak} selected={t.hcp_id === selectedId} onSelect={onSelect} />
      ))}
    </div>
  </div>
);

export default memo(MustWinList);
