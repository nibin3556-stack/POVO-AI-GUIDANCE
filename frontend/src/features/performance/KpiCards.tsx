import { memo } from 'react';
import AsyncContent from '../../components/common/AsyncContent';
import SegmentedToggle, { type ToggleOption } from '../../components/common/SegmentedToggle';
import { LABELS } from '../../constants/labels';
import { useGetKpisQuery } from '../../redux/api/performanceApi';
import { periodSelected } from '../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import type { Period } from '../../types/models';
import KpiCard from './KpiCard';

const PERIODS: ToggleOption<Period>[] = (['month', 'quarter', 'ytd'] as const).map((value) => ({
  value,
  label: LABELS.performance.periods[value],
}));

/** Period toggle (right corner) and the two goal cards: PEFs (36%) and patients with the split (64%). */
const KpiCards = () => {
  const dispatch = useAppDispatch();
  const period = useAppSelector((s) => s.callSession.period);
  const { data, error, isLoading, isFetching, refetch } = useGetKpisQuery(period);
  return (
    <>
      <div className="-mb-[5px] flex items-center justify-end gap-2.5">
        <SegmentedToggle options={PERIODS} value={period} onChange={(p) => dispatch(periodSelected(p))} ariaLabel={LABELS.performance.periodAria} />
      </div>
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!data?.cards.length} emptyMessage={LABELS.performance.kpiEmpty}>
        <div className="grid grid-cols-[minmax(0,36fr)_minmax(0,64fr)] gap-3 transition-opacity max-bp1180:grid-cols-1" aria-busy={isFetching}>
          {data?.cards.map((card) => (
            <KpiCard key={card.metric_code} card={card} periodLabel={data.period_label} remainingDays={data.remaining_working_days} periodEnd={data.period_end} />
          ))}
        </div>
      </AsyncContent>
    </>
  );
};

export default memo(KpiCards);
