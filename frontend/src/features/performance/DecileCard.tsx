import { memo, useMemo } from 'react';
import ChartCard, { type LegendItem } from '../../components/charts/ChartCard';
import DecileBarChart, { type DecileBarRow } from '../../components/charts/DecileBarChart';
import AsyncContent from '../../components/common/AsyncContent';
import { CHART_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import { useChartHover } from '../../hooks/useChartHover';
import { useGetDecilesQuery } from '../../redux/api/performanceApi';
import { buildBands, decileTip } from './chartTips';

const P = LABELS.performance;
const LEGEND: LegendItem[] = [
  { label: P.writing, color: CHART_COLORS.writing },
  { label: P.yetToWrite, color: CHART_COLORS.yetToWrite },
];

/** Chart 2: D10 → D2, writers overlaid on targets, tier bands behind. */
const DecileCard = () => {
  const { data, error, isLoading, refetch } = useGetDecilesQuery();
  const { hover, onHover, onLeave } = useChartHover();
  const rows = useMemo<DecileBarRow[]>(
    () => (data?.rows ?? []).map((r) => ({ label: `D${r.decile}`, tier: r.tier_code, targets: r.targets, writers: r.writers })),
    [data],
  );
  const bands = useMemo(() => (data ? buildBands(data) : []), [data]);
  const row = hover ? data?.rows[hover.index] : undefined;
  const tip = row ? decileTip(row, data?.tiers.find((t) => t.tier_code === row.tier_code)) : null;
  return (
    <ChartCard
      title={P.decileTitle}
      legend={LEGEND}
      caption={data ? P.shCaption(data.super_high_not_writing, data.super_high_total, data.tiers.find((t) => t.tier_code === 'SH')?.tier_name ?? '') : undefined}
      hover={hover}
      tip={tip}
      onLeave={onLeave}
    >
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!rows.length} emptyMessage={P.chartEmpty}>
        <DecileBarChart rows={rows} bands={bands} suffix={P.ofHcps} activeIndex={hover?.index ?? null} onHover={onHover} ariaLabel={P.decileTitle} />
      </AsyncContent>
    </ChartCard>
  );
};

export default memo(DecileCard);
