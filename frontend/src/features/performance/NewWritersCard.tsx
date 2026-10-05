import { memo, useMemo } from 'react';
import ChartCard, { type LegendItem } from '../../components/charts/ChartCard';
import StackedColumnChart from '../../components/charts/StackedColumnChart';
import AsyncContent from '../../components/common/AsyncContent';
import SegmentedToggle, { type ToggleOption } from '../../components/common/SegmentedToggle';
import { LABELS } from '../../constants/labels';
import { useChartHover } from '../../hooks/useChartHover';
import { useReference } from '../../hooks/useReference';
import { useGetNewWritersQuery } from '../../redux/api/performanceApi';
import { grainSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Grain } from '../../types/models';
import { toColumns, writerSeries, writersTip } from './chartTips';

const P = LABELS.performance;
const GRAINS: ToggleOption<Grain>[] = [
  { value: 'week', label: P.weekly },
  { value: 'month', label: P.monthly },
];

/**
 * Chart 3: new POVO writers stacked by HS treatment segment, per month (the
 * current month plus the three before it) or per week (the last 6, ending Friday).
 */
const NewWritersCard = () => {
  const dispatch = useAppDispatch();
  const ref = useReference();
  const grain = useAppSelector((s) => s.callSession.grain);
  const { data, error, isLoading, refetch } = useGetNewWritersQuery(grain);
  const { hover, onHover, onLeave } = useChartHover();
  const columns = useMemo(() => (data ? toColumns(data) : []), [data]);
  const series = useMemo(() => (data ? writerSeries(data, ref) : []), [data, ref]);
  const legend = useMemo<LegendItem[]>(
    () => (data?.segment_codes ?? []).map((code) => ({ label: ref.segment(code)?.full_name ?? code, color: ref.segmentColor(code) })),
    [data, ref],
  );
  const bucket = hover ? data?.buckets[hover.index] : undefined;
  const tip = bucket && data ? writersTip(bucket, data.grain, data.segment_codes, ref) : null;
  const toggle = <SegmentedToggle options={GRAINS} value={grain} onChange={(g) => dispatch(grainSelected(g))} ariaLabel={P.grainAria} />;
  return (
    <ChartCard title={P.writersTitle} headerRight={toggle} legend={legend} hover={hover} tip={tip} onLeave={onLeave}>
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!columns.length} emptyMessage={P.chartEmpty}>
        {data && (
          <div className="flex size-full flex-col">
            <div className="text-right text-sm font-bold text-blued">{P.writersHeader(data.total, data.range_label)}</div>
            <div className="min-h-0 flex-1">
              <StackedColumnChart
                data={columns}
                series={series}
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
