import { memo } from 'react';
import DecileChip from '../../components/common/DecileChip';
import HcpsText from '../../components/common/HcpsText';
import InfoTip from '../../components/common/InfoTip';
import { TIER_BAND } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { DecileRow, Deciles } from '../../types/models';
import { cx } from '../../utils/cx';

const D = LABELS.performance.decileTable;
const TH = 'border-b-[1.5px] border-bluet2 px-1.5 pb-1 pt-1 align-bottom text-center text-[10.6px] font-bold uppercase leading-[1.15] tracking-[.3px] text-navyd';

const AchievedVsGoal = ({ value, goal, ok }: { value: string; goal: string; ok: boolean }) => (
  <span className="whitespace-nowrap">
    <b className={cx('text-[13.4px] font-bold', ok ? 'text-green' : 'text-warn')}>{value}</b>
    <small className="mx-1 text-[10.6px] font-medium text-ink3">{D.vs}</small>
    <b className="text-xs font-semibold text-ink2">{goal}</b>
  </span>
);

const Header = ({ label, tip }: { label: string; tip?: string }) => (
  <th scope="col" className={TH}>
    <span className="inline-flex items-center justify-center gap-[3px]">
      <HcpsText text={label} />
      {tip && <InfoTip text={tip} size="sm" />}
    </span>
    {tip && <small className="block text-[9.6px] font-semibold normal-case tracking-normal text-ink3">{D.achievedVsGoal}</small>}
  </th>
);

/**
 * Decile table (the default view): tier band, decile, HCPs, new POVO writers,
 * reach and average frequency against their goals (green when met).
 */
const DecileTable = ({ data }: { data: Deciles }) => {
  const tierOf = (row: DecileRow) => data.tiers.find((t) => t.tier_code === row.tier_code);
  const reachTip = D.reachTip(data.tiers.map((t) => `${t.tier_name} ${t.reach_goal_pct}%`).join(' · '));
  const freqTip = D.frequencyTip(
    data.tiers.map((t) => `${t.tier_name} ${t.frequency_goal.toFixed(1)}`).join(' · '),
    data.tiers.map((t) => t.calls_per_year).join(' / '),
    data.elapsed_pct,
  );
  return (
    <table className="w-full table-fixed border-separate border-spacing-0" aria-label={LABELS.performance.decileTitle} data-testid="decile-table">
      <thead>
        <tr>
          <th scope="col" className={cx(TH, 'w-6 p-0')} aria-hidden="true" />
          <th scope="col" className={cx(TH, 'w-[12%]')}>{D.decile}</th>
          <th scope="col" className={cx(TH, 'w-[12%]')}>
            <HcpsText text={D.hcps} />
          </th>
          <th scope="col" className={cx(TH, 'w-[19%]')}>{D.newWriters}</th>
          <Header label={D.reach} tip={reachTip} />
          <Header label={D.avgFrequency} tip={freqTip} />
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, i) => {
          const first = i === 0 || data.rows[i - 1]?.tier_code !== row.tier_code;
          const span = data.rows.filter((r) => r.tier_code === row.tier_code).length;
          const band = TIER_BAND[row.tier_code];
          const td = cx('border-b border-line2 px-1.5 py-0.5 text-center text-[12.4px] text-ink2', first && i > 0 && 'border-t-[6px] border-t-white');
          return (
              <tr key={row.decile} className="hover:[&>td:not(:first-child)]:bg-[#F1F5FA]">
                {first && (
                  <td rowSpan={span} className={cx('rounded-md border p-0 text-center align-middle', i > 0 && 'border-t-[6px] border-t-white')} style={{ backgroundColor: band.fill, color: band.text, borderColor: band.stroke }}>
                    <span className="inline-block rotate-180 whitespace-nowrap text-[10.6px] font-bold [writing-mode:vertical-rl]">{tierOf(row)?.tier_name}</span>
                  </td>
                )}
                <td className={td}>
                  <DecileChip decile={row.decile} tier={row.tier_code} />
                </td>
                <td className={td}>
                  <b className="text-[13.4px] font-bold text-ink">{row.targets}</b>
                </td>
                <td className={td}>
                  <b className="text-[13.4px] font-bold text-ink">{row.writers}</b>
                </td>
                <td className={td}>
                  <AchievedVsGoal value={`${row.reach_pct}%`} goal={`${row.reach_goal_pct}%`} ok={row.reach_pct >= row.reach_goal_pct} />
                </td>
                <td className={td}>
                  <AchievedVsGoal
                    value={row.avg_frequency === null ? D.dash : row.avg_frequency.toFixed(1)}
                    goal={row.frequency_goal.toFixed(1)}
                    ok={row.avg_frequency !== null && row.avg_frequency >= row.frequency_goal}
                  />
                </td>
              </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default memo(DecileTable);
