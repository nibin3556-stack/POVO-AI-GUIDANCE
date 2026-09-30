import type { ChartTip } from '../../components/charts/ChartCard';
import type { TierBand } from '../../components/charts/DecileBarChart';
import type { ColumnDatum } from '../../components/charts/StackedColumnChart';
import { CHART_COLORS, COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { DecileRow, Deciles, Grain, NewWriters, Segment, Segmentation, Tier, WriterBucket } from '../../types/models';
import { formatLongDate, formatMDY, formatNumber, formatShortMD } from '../../utils/format';

const T = LABELS.performance.tip;

export const segmentTip = (segment: Segment, data: Segmentation): ChartTip => {
  const color = segment.color_hex;
  return {
    title: T.opportunity(segment.short_name),
    rows: [
      { key: 'n', color, value: segment.hcp_count, text: T.hcps(Math.round(segment.pct), data.total_targets) },
      { key: 'trial', color, value: `${segment.trial_pct}%`, text: T.trial },
      { key: 'pen', color, value: `${segment.penetration_pct}%`, text: T.penetration },
      { key: 'adopt', color, value: `${segment.adoption_pct}%`, text: T.adoption },
      { key: 'reach', color, value: `${segment.reach_pct}%`, text: T.reach },
    ],
    footer: segment.description,
  };
};

export const decileTip = (row: DecileRow, tier: Tier | undefined): ChartTip => ({
  title: T.decile(row.decile, tier?.tier_name ?? ''),
  rows: [
    { key: 'w', color: CHART_COLORS.writing, value: row.writers, text: T.writingHcps },
    { key: 'y', color: CHART_COLORS.yetToWrite, value: row.yet_to_write, text: T.yetHcps },
    { key: 'hs', color: COLORS.ink3, value: row.targets, text: T.opportunityHs(formatNumber(row.hs_patients)) },
    { key: 'ex', color: COLORS.ink3, value: `${row.execution_pct}%`, text: T.execution },
    { key: 'rc', color: COLORS.ink3, value: `${row.reach_pct}%`, text: T.reachDecile(row.tier_code === 'SH' ? row.early_reach_count : null) },
    { key: 'pr', color: COLORS.ink3, value: row.productivity.toFixed(1), text: T.productivity },
  ],
  footer: tier ? T.tierLine(tier.tier_name, tier.decile_min, tier.decile_max, tier.calls_per_year, tier.reach_goal_pct) : undefined,
});

const bucketTitle = (bucket: WriterBucket, grain: Grain): string =>
  grain === 'week'
    ? T.weekEnding(formatMDY(bucket.end_date), bucket.is_partial)
    : T.monthToDate(formatLongDate(bucket.start_date).replace(/ \d+,/, ''), bucket.is_partial);

export const writersTip = (bucket: WriterBucket, grain: Grain): ChartTip => ({
  title: bucketTitle(bucket, grain),
  rows: [
    { key: 'j', color: CHART_COLORS.jak, value: bucket.jak_writers, text: T.jak },
    { key: 'n', color: CHART_COLORS.nonJak, value: bucket.non_jak_writers, text: T.nonJak },
  ],
  footer: T.firstTime(bucket.jak_writers + bucket.non_jak_writers),
});

/** Consecutive rows of the same tier become one background band. */
export const buildBands = (data: Deciles): TierBand[] => {
  const bands: TierBand[] = [];
  data.rows.forEach((row, index) => {
    const last = bands[bands.length - 1];
    if (last && last.tier === row.tier_code) last.count += 1;
    else bands.push({ tier: row.tier_code, name: data.tiers.find((t) => t.tier_code === row.tier_code)?.tier_name ?? row.tier_code, start: index, count: 1 });
  });
  return bands;
};


export const toColumns = (data: NewWriters): ColumnDatum[] =>
  data.buckets.map((b) => ({
    label: data.grain === 'week' ? formatShortMD(b.end_date) || b.label : b.label,
    primary: b.jak_writers,
    secondary: b.non_jak_writers,
    partial: b.is_partial,
  }));

