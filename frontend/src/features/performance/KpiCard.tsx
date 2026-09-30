import { memo } from 'react';
import ProgressBar from '../../components/common/ProgressBar';
import StatusChip from '../../components/common/StatusChip';
import { LABELS } from '../../constants/labels';
import type { KpiCard as KpiCardData } from '../../types/models';
import { cx } from '../../utils/cx';
import { formatMDY, formatNumber } from '../../utils/format';

interface KpiCardProps {
  card: KpiCardData;
  periodLabel: string;
  remainingDays: number;
  periodEnd: string;
}

const P = LABELS.performance;

/** One goal card: achieved vs goal, what is left, working days, progress and On Track / At Risk. */
const KpiCard = ({ card, periodLabel, remainingDays, periodEnd }: KpiCardProps) => {
  const ok = card.status === 'on_track';
  return (
    <article
      className={cx(
        'flex min-w-0 animate-fade-up flex-col rounded-xl border border-l-4 border-line bg-white px-3 pb-[5px] pt-1 shadow-e1',
        ok ? 'border-l-greenb' : 'border-l-blue',
      )}
    >
      <h3 className="m-0 flex flex-wrap items-baseline gap-[7px] text-[14.6px] font-semibold text-blued">
        {card.title}
        <em className="text-[12.9px] font-medium not-italic text-ink3">({periodLabel})</em>
      </h3>
      <div className="flex flex-wrap items-baseline gap-1.5 text-[12.8px] font-medium leading-[1.3] text-ink2">
        {P.achieved} <b className="text-base font-bold tracking-[-.4px] text-ink">{formatNumber(card.achieved)}</b> {P.outOf} {formatNumber(card.goal)} {card.unit}
      </div>
      <div className="flex flex-wrap items-baseline gap-1.5 text-[12.8px] font-medium leading-[1.3] text-ink2">
        {P.yetToAchieve}
        <span className="font-bold text-warn">
          {formatNumber(card.yet_to_achieve)} {card.unit}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-1.5 text-[12.8px] font-medium leading-[1.3] text-ink2">
        {P.remainingDays} <b className="text-base font-bold text-ink">{remainingDays}</b>
        <StatusChip variant="days" className="px-2! text-[11.2px]!">
          {P.ends(formatMDY(periodEnd))}
        </StatusChip>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-0.5">
        <ProgressBar value={card.pct_achieved} tone={ok ? 'good' : 'warn'} label={P.pctOfGoal(card.pct_achieved)} />
        <span className={cx('whitespace-nowrap text-[13px] font-bold', ok ? 'text-green' : 'text-warn')}>{P.pctOfGoal(Math.round(card.pct_achieved))}</span>
        <StatusChip variant={ok ? 'good' : 'risk'}>{ok ? P.onTrack : P.atRisk}</StatusChip>
      </div>
    </article>
  );
};

export default memo(KpiCard);
