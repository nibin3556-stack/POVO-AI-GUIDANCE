import { memo, useEffect, useState } from 'react';
import { KPI_COLORS } from '../../constants/colors';
import { LABELS } from '../../constants/labels';
import type { KpiStatus } from '../../types/models';
import { cx } from '../../utils/cx';
import { formatNumber } from '../../utils/format';

interface KpiRingProps {
  achieved: number;
  goal: number;
  pct: number;
  status: KpiStatus;
}

const R = 27;
const C = 2 * Math.PI * R;
const STROKE: Record<KpiStatus, string> = { on_track: KPI_COLORS.good, at_risk: KPI_COLORS.risk, no_goal: KPI_COLORS.noGoal };
const CAPTION: Record<KpiStatus, string> = { on_track: 'text-green', at_risk: 'text-warn', no_goal: 'text-ink3' };
const R_ = LABELS.performance.ring;

/** Goal ring on the right of a KPI card: % in the centre, achieved / goal beside it, then the caption. */
const KpiRing = ({ achieved, goal, pct, status }: KpiRingProps) => {
  const hasGoal = goal > 0;
  const share = hasGoal ? Math.min(1, Math.max(0, achieved / goal)) : 0;
  // The arc grows from 0 after the first paint (POC: stroke-dasharray transition).
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(share));
    return () => cancelAnimationFrame(id);
  }, [share]);
  const caption = !hasGoal ? R_.noGoal : achieved > goal ? R_.exceeded : R_.ofGoal;
  return (
    <div
      role="img"
      aria-label={LABELS.performance.ringAria(achieved, goal, pct)}
      className="grid flex-none grid-cols-[60px_auto] grid-rows-[auto_auto] items-center gap-x-[9px] border-l border-line2 pl-3 max-bp1400:grid-cols-[52px_auto] max-bp1400:pl-2.5"
    >
      <svg viewBox="0 0 66 66" className="row-span-2 block size-[60px] max-bp1400:size-[52px]" aria-hidden="true">
        <circle cx="33" cy="33" r={R} fill="none" stroke={KPI_COLORS.ringTrack} strokeWidth="7" />
        <circle
          cx="33"
          cy="33"
          r={R}
          fill="none"
          stroke={STROKE[status]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(C * shown).toFixed(1)} ${C.toFixed(1)}`}
          transform="rotate(-90 33 33)"
          className="transition-[stroke-dasharray] duration-1000 ease-[cubic-bezier(.2,.7,.2,1)]"
        />
        <text x="33" y="37.5" textAnchor="middle" fontSize="14.5" fontWeight="700" fill="#0F1F33">
          {hasGoal ? `${pct}%` : '–'}
        </text>
      </svg>
      <div className="self-end whitespace-nowrap leading-none">
        <b className="text-[23px] font-bold tracking-[-.5px] text-ink max-bp1400:text-[20px]">{formatNumber(achieved)}</b>
        <i className="ml-[3px] text-[13px] font-medium not-italic text-ink3">/ {hasGoal ? formatNumber(goal) : '–'}</i>
      </div>
      <div className={cx('mt-[3px] self-start whitespace-nowrap text-[11.8px] font-semibold leading-[1.2]', CAPTION[status])}>{caption}</div>
    </div>
  );
};

export default memo(KpiRing);
