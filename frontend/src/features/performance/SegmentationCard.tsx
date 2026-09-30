import { memo, useMemo } from 'react';
import ChartCard from '../../components/charts/ChartCard';
import DonutChart from '../../components/charts/DonutChart';
import AsyncContent from '../../components/common/AsyncContent';
import { LABELS } from '../../constants/labels';
import { useChartHover } from '../../hooks/useChartHover';
import { useGetSegmentationQuery } from '../../redux/api/performanceApi';
import type { Segment } from '../../types/models';
import { cx } from '../../utils/cx';
import { segmentTip } from './chartTips';

const P = LABELS.performance;

interface LegendProps {
  segments: Segment[];
  activeIndex: number | null;
  onHover: (index: number, x: number, y: number) => void;
}

/** Legend beside the donut: swatch, full segment name and share. Hover shows the same tooltip. */
const SegmentLegend = memo(({ segments, activeIndex, onHover }: LegendProps) => (
  <ul className="m-0 flex min-w-0 flex-[0_0_42%] list-none flex-col gap-[9px] p-0">
    {segments.map((s, index) => (
      <li
        key={s.segment_code}
        onMouseMove={(e) => onHover(index, e.clientX, e.clientY)}
        className={cx('grid grid-cols-[11px_minmax(0,1fr)_auto] items-start gap-[7px] rounded-[7px] px-1 py-[3px]', activeIndex === index && 'bg-[#F1F5FA]')}
      >
        <i className="mt-[3px] size-[11px] rounded-[3px]" style={{ backgroundColor: s.color_hex }} />
        <span className="text-[12.6px] font-semibold leading-[1.3] text-ink2">{s.full_name}</span>
        <b className="text-[15px] font-bold leading-[1.1] text-ink">{Math.round(s.pct)}%</b>
      </li>
    ))}
  </ul>
));
SegmentLegend.displayName = 'SegmentLegend';

/** Chart 1: the three segments of all POVO Targets (D1–D10), total in the centre. */
const SegmentationCard = () => {
  const { data, error, isLoading, refetch } = useGetSegmentationQuery();
  const { hover, onHover, onLeave } = useChartHover();
  const slices = useMemo(
    () => (data?.segments ?? []).map((s) => ({ key: s.segment_code, value: s.hcp_count, color: s.color_hex })),
    [data],
  );
  const active = hover ? data?.segments[hover.index] : undefined;
  const tip = data && active ? segmentTip(active, data) : null;
  return (
    <ChartCard
      title={P.segmentationTitle}
      caption={data ? P.notWritingCaption(data.not_writing, data.total_targets) : undefined}
      hover={hover}
      tip={tip}
      onLeave={onLeave}
    >
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!data?.segments.length} emptyMessage={P.chartEmpty}>
        {data && (
          <div className="flex size-full min-h-0 items-center gap-2">
            <div className="h-full min-w-0 flex-1">
              <DonutChart slices={slices} total={data.total_targets} centerLabel={P.povoTargets} activeIndex={hover?.index ?? null} onHover={onHover} ariaLabel={P.segmentationTitle} />
            </div>
            <SegmentLegend segments={data.segments} activeIndex={hover?.index ?? null} onHover={onHover} />
          </div>
        )}
      </AsyncContent>
    </ChartCard>
  );
};

export default memo(SegmentationCard);
