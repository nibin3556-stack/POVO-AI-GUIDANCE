import { memo } from 'react';
import Icon from '../../../components/common/Icon';
import { DELIVERED_COLORS } from '../../../constants/colors';
import { LABELS } from '../../../constants/labels';
import type { DeliveredPoint } from '../../../types/models';
import { deliveredTone } from '../../../utils/callPrep';
import { cx } from '../../../utils/cx';
import { formatMediumDate } from '../../../utils/format';
import { PillarLabel } from './TalkingPointCard';

interface DeliveredListProps {
  points: DeliveredPoint[];
  reinforced: string[];
  onToggle: (pointId: string) => void;
}

const C = LABELS.callPrep;

/**
 * "Delivered on earlier calls": a framed amber panel, set apart from the new
 * suggestions. Each point is a white card with its reception stripe (orange =
 * not well received or still open, green = moderately or well received); the
 * Reinforce toggle adds it to this call's post-call assessment (blue stripe).
 */
const DeliveredList = ({ points, reinforced, onToggle }: DeliveredListProps) => {
  if (!points.length) return null;
  return (
    <section
      aria-label={C.deliveredTitle}
      data-testid="delivered-list"
      className="flex flex-col gap-2 overflow-hidden rounded-xl border-[2.5px] border-[#9A5B0E] bg-[#FDF3DF] px-2.5 pb-2.5 shadow-[0_6px_18px_rgba(120,70,10,.16)]"
    >
      <div className="-mx-2.5 mb-0.5 flex items-center gap-1.5 bg-[#7A4708] px-3 py-2 text-[12.6px] font-bold uppercase tracking-[.7px] text-white">
        <Icon name="history" className="text-base text-white" />
        {C.deliveredTitle}
      </div>
      {points.map((p) => {
        const on = reinforced.includes(p.point_id);
        const tone = DELIVERED_COLORS[deliveredTone(p)];
        const edge = on ? DELIVERED_COLORS.reinforced : tone;
        return (
          <div
            key={p.point_id}
            data-testid="delivered-point"
            className="flex items-start gap-2.5 rounded-[9px] border-[1.5px] border-l-[5px] bg-white px-[11px] py-[7px]"
            style={{ borderColor: edge.border, borderLeftColor: edge.stripe }}
          >
            <span className="mt-px flex size-[21px] flex-none items-center justify-center rounded-md" style={{ backgroundColor: tone.tagBg, color: tone.tagFg }}>
              <Icon name="history" className="text-[15px]" />
            </span>
            <span className="text-[13.6px] font-medium leading-[1.4] text-ink2">
              {p.pillar && <PillarLabel pillar={p.pillar} />}
              {p.text}
              <span
                className="ml-2 inline-block whitespace-nowrap rounded-full border px-[9px] py-px align-[1px] text-[11.4px] font-bold"
                style={{ backgroundColor: tone.tagBg, color: tone.tagFg, borderColor: tone.tagBd }}
              >
                {C.deliveredTag(formatMediumDate(p.delivered_date), p.label)}
              </span>
              <button
                type="button"
                aria-pressed={on}
                title={C.reinforceHint}
                onClick={() => onToggle(p.point_id)}
                className={cx(
                  'ml-2 inline-flex items-center gap-[3px] rounded-full border-[1.5px] py-px pl-1.5 pr-[9px] align-[1px] text-[11.5px] font-semibold leading-[1.6]',
                  on ? 'border-blue bg-blue text-white' : 'border-bluet2 bg-white text-blued hover:bg-bluet',
                )}
              >
                <Icon name={on ? 'check' : 'replay'} className="text-sm" />
                {on ? C.reinforced : C.reinforce}
              </button>
            </span>
          </div>
        );
      })}
    </section>
  );
};

export default memo(DeliveredList);
