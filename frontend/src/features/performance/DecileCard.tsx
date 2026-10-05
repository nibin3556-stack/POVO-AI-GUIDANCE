import { memo, useMemo } from 'react';
import ChartCard, { type LegendItem } from '../../components/charts/ChartCard';
import DecileBarChart, { type DecileBarRow } from '../../components/charts/DecileBarChart';
import AsyncContent from '../../components/common/AsyncContent';
import SegmentedToggle, { type ToggleOption } from '../../components/common/SegmentedToggle';
import { CHART_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import { useChartHover } from '../../hooks/useChartHover';
import { useGetDecilesQuery } from '../../redux/api/performanceApi';
import { decileViewSelected, type DecileView } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { buildBands, decileTip } from './chartTips';
import DecileTable from './DecileTable';

const P = LABELS.performance;
const LEGEND: LegendItem[] = [
  { label: P.writing, color: CHART_COLORS.writing },
  { label: P.yetToWrite, color: CHART_COLORS.yetToWrite },
];
const VIEWS: ToggleOption<DecileView>[] = [
  { value: 'chart', label: P.decileViews.chart },
  { value: 'table', label: P.decileViews.table },
];

/** Chart 2: D10 → D2. Table (default): reach and average frequency against goal; Chart: writers over targets. */
const DecileCard = () => {
  const dispatch = useAppDispatch();
  const view = useAppSelector((s) => s.callSession.decileView);
  const { data, error, isLoading, refetch } = useGetDecilesQuery();
  const { hover, onHover, onLeave } = useChartHover();
  const rows = useMemo<DecileBarRow[]>(
    () => (data?.rows ?? []).map((r) => ({ label: `D${r.decile}`, tier: r.tier_code, targets: r.targets, writers: r.writers })),
    [data],
  );
  const bands = useMemo(() => (data ? buildBands(data) : []), [data]);
  const row = view === 'chart' && hover ? data?.rows[hover.index] : undefined;
  const tip = row && data ? decileTip(row, data.tiers.find((t) => t.tier_code === row.tier_code), data.elapsed_pct) : null;
  const toggle = <SegmentedToggle options={VIEWS} value={view} onChange={(v) => dispatch(decileViewSelected(v))} ariaLabel={P.decileViewAria} />;
  return (
    <ChartCard
      title={P.decileTitle}
      headerRight={toggle}
      legend={view === 'chart' ? LEGEND : undefined}
      caption={data ? P.shCaption(data.super_high_not_writing, data.super_high_total, data.tiers.find((t) => t.tier_code === 'SH')?.tier_name ?? '') : undefined}
      hover={hover}
      tip={tip}
      onLeave={onLeave}
    >
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!rows.length} emptyMessage={P.chartEmpty}>
        {data && view === 'table' ? (
          <div className="size-full overflow-y-auto">
            <DecileTable data={data} />
          </div>
        ) : (
          <DecileBarChart rows={rows} bands={bands} suffix={P.ofHcps} activeIndex={hover?.index ?? null} onHover={onHover} ariaLabel={P.decileTitle} />
        )}
      </AsyncContent>
    </ChartCard>
  );
};

export default memo(DecileCard);
