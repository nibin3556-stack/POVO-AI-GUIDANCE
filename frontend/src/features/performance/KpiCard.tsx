import { memo } from 'react';
import KpiRing from '../../components/charts/KpiRing';
import InfoTip from '../../components/common/InfoTip';
import StatusChip, { type ChipVariant } from '../../components/common/StatusChip';
import { KPI_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { KpiCard as KpiCardData, KpiStatus } from '../../types/models';
import { formatMDY, formatNumber } from '../../utils/format';
import PatientSplitPanel from './PatientSplitPanel';

interface KpiCardProps {
  card: KpiCardData;
  periodLabel: string;
  remainingDays: number;
  periodEnd: string;
}

const P = LABELS.performance;
const CHIP: Record<KpiStatus, { variant: ChipVariant; label: string }> = {
  on_track: { variant: 'good', label: P.onTrack },
  at_risk: { variant: 'risk', label: P.atRisk },
  no_goal: { variant: 'days', label: P.noGoal },
};
const LINE = 'flex flex-wrap items-center gap-x-[5px] gap-y-0.5 text-[13.2px] font-medium leading-[1.45] text-ink2 max-bp1400:text-[12.2px]';

/**
 * One goal card: white, coloured left edge, status chip in the top-right corner.
 * Left: achieved / yet to achieve / working days; right: the goal ring. The
 * patients card adds the Total on POVO split between the two.
 */
const KpiCard = ({ card, periodLabel, remainingDays, periodEnd }: KpiCardProps) => {
  const patients = card.metric_code === 'NEW_PATIENTS';
  const unit = card.unit;
  const info = P.kpiInfo[card.metric_code];
  const chip = CHIP[card.status];
  return (
    <article
      data-testid={`kpi-${card.metric_code}`}
      className="flex min-w-0 animate-fade-up flex-col rounded-xl border border-l-[6px] border-line bg-white px-3 pb-2 pt-1.5 shadow-e1"
      style={{ borderLeftColor: patients ? KPI_COLORS.patientsEdge : KPI_COLORS.pefEdge }}
    >
      <div className="flex items-start gap-2.5">
        <h3 className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-x-[7px] text-[15px] font-semibold text-navyd max-bp1400:text-[14px]">
          {card.title}
          <em className="text-[12.6px] font-medium not-italic text-ink3">({periodLabel})</em>
          {!patients && info && <InfoTip text={info} />}
        </h3>
        <StatusChip variant={chip.variant} className="flex-none">
          {chip.label}
        </StatusChip>
      </div>
      <div className="my-auto flex items-center gap-2.5 pt-1">
        <div className="min-w-0 flex-1">
          <div className={LINE}>
            {P.achieved} <b className="text-[15.5px] font-bold text-ink">{formatNumber(card.achieved)}</b> {P.outOf} {formatNumber(card.goal)} {unit}
            {patients && info && <InfoTip text={info} size="sm" />}
          </div>
          <div className={LINE}>
            {P.yetToAchieve}
            <span className="font-bold text-warn">
              {formatNumber(card.yet_to_achieve)} {unit}
            </span>
          </div>
          <div className={LINE}>
            {P.remainingDays} <b className="text-[15.5px] font-bold text-ink">{remainingDays}</b>
            <StatusChip variant="days" className="px-2! text-[11px]!">
              {P.ends(formatMDY(periodEnd))}
            </StatusChip>
          </div>
        </div>
        {patients && card.split && <PatientSplitPanel split={card.split} />}
        <KpiRing achieved={card.achieved} goal={card.goal} pct={card.pct_achieved} status={card.status} />
      </div>
    </article>
  );
};

export default memo(KpiCard);
