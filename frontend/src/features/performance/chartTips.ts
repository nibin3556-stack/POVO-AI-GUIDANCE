import type { ChartTip } from '../../components/charts/ChartCard';
import type { TierBand } from '../../components/charts/DecileBarChart';
import type { ColumnDatum, ColumnSeries } from '../../components/charts/StackedColumnChart';
import { CHART_COLORS, COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { DecileRow, Deciles, Grain, NewWriters, Segment, Segmentation, SegmentCode, Tier, WriterBucket } from '../../types/models';
import type { ReferenceLookup } from '../../utils/reference';
import { formatLongDate, formatMD, formatMDY, formatMonthLong, formatMonthShort, formatShortMD } from '../../utils/format';

const T = LABELS.performance.tip;

/** Funnel tooltip: Targets > Reached > Writing (Trial) > 3+ patients (Adoption), then Penetration. */
export const segmentTip = (segment: Segment, data: Segmentation): ChartTip => {
  const color = segment.color_hex;
  const f = segment.funnel;
  return {
    title: segment.full_name,
    rows: [
      { key: 'n', color, value: segment.hcp_count, text: T.hcps(segment.pct, data.total_targets) },
      { key: 'reach', color, value: f.reached, text: T.reach(f.reached_pct), group: T.funnel },
      { key: 'trial', color, value: f.writers, text: T.trial(f.writers_pct) },
      { key: 'adopt', color, value: f.adopters, text: T.adoption(f.adopters_pct) },
    ],
    footer: T.penetration(segment.penetration_pct, f.povo_patients, f.hs_patients),
  };
};

export const decileTip = (row: DecileRow, tier: Tier | undefined, elapsedPct: number): ChartTip => ({
  title: T.decile(row.decile, tier?.tier_name ?? ''),
  rows: [
    { key: 'w', color: CHART_COLORS.writing, value: row.writers, text: T.newWriters },
    { key: 'y', color: CHART_COLORS.yetToWrite, value: row.yet_to_write, text: T.yetHcps },
    { key: 'rc', color: COLORS.ink3, value: `${row.reach_pct}%`, text: T.reachDecile(row.reached, row.targets, row.reach_goal_pct) },
    {
      key: 'fq',
      color: COLORS.ink3,
      value: row.avg_frequency === null ? '–' : row.avg_frequency.toFixed(1),
      text: T.frequencyDecile(row.calls, row.reached, row.frequency_goal.toFixed(1), tier?.calls_per_year ?? 0, elapsedPct),
    },
  ],
  footer: T.decileTargets(row.targets, row.avg_hs_patients),
});

const bucketTitle = (bucket: WriterBucket, grain: Grain): string =>
  grain === 'week'
    ? T.weekEnding(formatMDY(bucket.end_date), bucket.is_partial)
    : T.monthToDate(formatLongDate(bucket.start_date).replace(/ \d+,/, ''), bucket.is_partial);

/** Writers stack bottom to top in the reference segment order. */
export const writerSeries = (data: NewWriters, ref: ReferenceLookup): ColumnSeries[] =>
  data.segment_codes.map((code) => ({ key: code, color: ref.segmentColor(code) }));

export const writersTip = (bucket: WriterBucket, grain: Grain, codes: SegmentCode[], ref: ReferenceLookup): ChartTip => ({
  title: bucketTitle(bucket, grain),
  rows: codes.map((code) => ({
    key: code,
    color: ref.segmentColor(code),
    value: bucket.segments[code] ?? 0,
    text: ref.segment(code)?.full_name ?? code,
  })),
  footer: T.firstTime(bucket.total),
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
    values: { ...b.segments },
    total: b.total,
    partial: b.is_partial,
  }));

export interface WritersCaption {
  text: string;
  tip: string;
  up: boolean;
}

/**
 * The New POVO Writers insight chip: this month to date against last month
 * (monthly buckets; the last one is the current, partial month). ▲ green when
 * the count is level or rising, ▼ amber when it is falling.
 */
export const writersCaption = (monthly: NewWriters | undefined, today: string | null | undefined): WritersCaption | null => {
  const buckets = monthly?.grain === 'month' ? monthly.buckets : [];
  const cur = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];
  if (!cur || !prev) return null;
  const up = cur.total >= prev.total;
  const text = `${up ? '▲' : '▼'} ${LABELS.performance.writersCaption(cur.total, formatMonthShort(cur.start_date), prev.total, formatMonthShort(prev.start_date))}`;
  const tip = LABELS.performance.writersCaptionTip(formatMonthLong(cur.start_date), formatMD(cur.start_date), formatMDY(today ?? cur.end_date), formatMonthLong(prev.start_date));
  return { text, tip, up };
};
