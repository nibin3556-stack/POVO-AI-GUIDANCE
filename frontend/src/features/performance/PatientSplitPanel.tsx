import { memo, useEffect, useState } from 'react';
import InfoTip from '../../components/common/InfoTip';
import { KPI_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { PatientSplit } from '../../types/models';
import { formatMDY, formatNumber } from '../../utils/format';

const S = LABELS.performance.split;

interface Row {
  key: string;
  label: string;
  info: string;
  color: string;
  value: number;
  pct: number;
}

/** Total on POVO: Paid NRx, Bridge NRx and Free Trial NRx, always shown, bars aligned on one grid. */
const PatientSplitPanel = ({ split }: { split: PatientSplit }) => {
  const rows: Row[] = [
    { key: 'paid', label: S.paid, info: S.paidInfo, color: KPI_COLORS.paid, value: split.paid, pct: split.paid_pct },
    { key: 'bridge', label: S.bridge, info: S.bridgeInfo, color: KPI_COLORS.bridge, value: split.bridge, pct: split.bridge_pct },
    { key: 'ft', label: S.freeTrial, info: S.freeTrialInfo, color: KPI_COLORS.freeTrial, value: split.free_trial, pct: split.free_trial_pct },
  ];
  // Bars grow from 0 after the first paint.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="flex min-w-[220px] flex-1 flex-col justify-center gap-[5px] border-l border-line2 px-3 max-bp1300:min-w-0 max-bp1300:px-2" data-testid="patient-split">
      <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-[1.1]">
        <span className="inline-flex items-center gap-[5px] text-[11.4px] font-bold uppercase tracking-[.5px] text-navyd">
          {LABELS.performance.totalOnPovo}
          <InfoTip text={LABELS.performance.totalOnPovoInfo} size="sm" />
        </span>
        <b className="ml-auto text-[21px] font-bold tracking-[-.4px] text-ink">{formatNumber(split.total)}</b>
        <em className="text-xs font-semibold not-italic text-ink3">{LABELS.performance.patients}</em>
      </div>
      <div className="grid grid-cols-[max-content_minmax(30px,1fr)_34px_40px] items-center gap-x-2 gap-y-1 max-bp1300:grid-cols-[max-content_minmax(0,1fr)_24px_32px] max-bp1300:gap-x-[5px]">
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <span className="flex items-center gap-[5px] whitespace-nowrap text-[12.4px] font-bold leading-[1.2] text-ink2 max-bp1300:text-[11px]">
              <i className="size-[9px] flex-none rounded-full" style={{ backgroundColor: r.color }} />
              {r.label}
              <InfoTip text={r.info} size="sm" />
            </span>
            <span className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: KPI_COLORS.splitTrack }}>
              <i
                className="block h-full rounded-full transition-[width] duration-1000 ease-[cubic-bezier(.2,.7,.2,1)]"
                style={{ width: grown ? `${r.pct}%` : 0, backgroundColor: r.color }}
              />
            </span>
            <b className="text-center text-[15px] font-bold text-ink">{formatNumber(r.value)}</b>
            <em className="text-center text-xs font-bold not-italic text-ink3">{r.pct}%</em>
          </div>
        ))}
      </div>
      <div className="whitespace-nowrap text-[11px] font-medium text-ink3 max-bp1300:whitespace-normal">{S.asOf(formatMDY(split.as_of))}</div>
    </div>
  );
};

export default memo(PatientSplitPanel);
