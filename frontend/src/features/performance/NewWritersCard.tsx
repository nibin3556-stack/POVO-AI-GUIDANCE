import { memo, useMemo } from 'react';
import ChartCard, { type LegendItem } from '../../components/charts/ChartCard';
import StackedColumnChart from '../../components/charts/StackedColumnChart';
import AsyncContent from '../../components/common/AsyncContent';
import SegmentedToggle, { type ToggleOption } from '../../components/common/SegmentedToggle';
import { CHART_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import { useChartHover } from '../../hooks/useChartHover';
import { useGetNewWritersQuery } from '../../redux/api/performanceApi';
import { grainSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Grain } from '../../types/models';
import { toColumns, writersTip } from './chartTips';

const P = LABELS.performance;
const LEGEND: LegendItem[] = [
  { label: P.jakSeries, color: CHART_COLORS.jak },
  { label: P.nonJakSeries, color: CHART_COLORS.nonJak },
];
const GRAINS: ToggleOption<Grain>[] = [
  { value: 'week', label: P.weekly },
  { value: 'month', label: P.monthly },
];

/** Chart 3: new POVO writers per month (Jan → now) or per week (last 12, ending Friday). */
const NewWritersCard = () => {
  const dispatch = useAppDispatch();
  const grain = useAppSelector((s) => s.callSession.grain);
  const { data, error, isLoading, refetch } = useGetNewWritersQuery(grain);
  const { hover, onHover, onLeave } = useChartHover();
  const columns = useMemo(() => (data ? toColumns(data) : []), [data]);
  const bucket = hover ? data?.buckets[hover.index] : undefined;
  const tip = bucket && data ? writersTip(bucket, data.grain) : null;
  const toggle = <SegmentedToggle options={GRAINS} value={grain} onChange={(g) => dispatch(grainSelected(g))} ariaLabel={P.grainAria} />;
  return (
    <ChartCard title={P.writersTitle} headerRight={toggle} legend={LEGEND} hover={hover} tip={tip} onLeave={onLeave}>
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!columns.length} emptyMessage={P.chartEmpty}>
        {data && (
          <div className="flex size-full flex-col">
            <div className="text-right text-sm font-bold text-blued">{P.writersHeader(data.total, data.range_label)}</div>
            <div className="min-h-0 flex-1">
              <StackedColumnChart
                data={columns}
                xAxisLabel={data.x_axis_label}
                yAxisLabel={P.yAxisWriters}
                partialLabel={P.toDate}
                onHover={onHover}
                ariaLabel={P.writersTitle}
              />
            </div>
          </div>
        )}
      </AsyncContent>
    </ChartCard>
  );
};

export default memo(NewWritersCard);
