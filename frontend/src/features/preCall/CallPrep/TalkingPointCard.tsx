import { memo } from 'react';
import { LABELS } from '../../../constants/labels';
import type { Category, TalkingPoint } from '../../../types/models';
import { isChanged, tagTone, type TagTone } from '../../../utils/callPrep';
import { cx } from '../../../utils/cx';

interface TalkingPointCardProps {
  point: TalkingPoint;
  index: number;
  category: Category;
  revised: boolean;
  visible: boolean;
}

const C = LABELS.callPrep;

/** The points sit on white cards (thin 1px border, 3px left edge) inside the framed suggestions panel; the left edge follows the category. */
const CARD: Record<Category, string> = {
  messaging: 'border-[#9EC2E4] border-l-[#1B6FBF]',
  objection: 'border-[#F0C26B] border-l-[#D97706]',
  closing: 'border-[#9FD3B1] border-l-[#2E9E52]',
};
const NUMBER: Record<Category, string> = { messaging: 'bg-blue', objection: 'bg-warn', closing: 'bg-green' };

const TAG: Record<TagTone, string> = {
  well: 'border-[#15803D] bg-[#15803D] text-white',
  mod: 'border-[#0E7A72] bg-[#0E7A72] text-white',
  new: 'border-greenbd bg-greenbg text-green',
  other: 'border-purplebd bg-purplet text-purple2',
};

/** Next-call tag: static colour (no flashing in Pre-Call Planning). */
export const Tag = memo(({ text }: { text: string }) => (
  <span className={cx('ml-2 inline-block whitespace-nowrap rounded-full border px-[9px] py-px align-[1px] text-[11.4px] font-bold', TAG[tagTone(text)])}>{text}</span>
));
Tag.displayName = 'Tag';

/** The client call prep format: the pillar leads the point in bold ("Proven efficacy in a pill: …"). */
export const PillarLead = memo(({ pillar }: { pillar: string }) => <b className="font-bold text-ink">{pillar}:</b>);
PillarLead.displayName = 'PillarLead';

/** INSIGHT line: one magenta used only for insights; a static highlight (no glow in Pre-Call Planning). */
const InsightLine = ({ text, roomy }: { text: string; roomy: boolean }) => (
  <span
    className={cx(
      'flex items-start gap-2 rounded-lg border border-l-[3px] border-[#F0ABE0] border-l-[#A0167E] bg-[#FDF0FA] font-semibold',
      roomy ? 'mt-2.5 py-1.5 pl-[7px] pr-2.5' : 'mt-1.5 py-[5px] pl-1.5 pr-[9px]',
    )}
  >
    <span className="mt-px inline-flex h-[19px] flex-none items-center rounded-full bg-[#A0167E] px-2 text-[10.6px] font-bold leading-none tracking-[.6px] text-white">{C.insight}</span>
    <span className="min-w-0 leading-[1.4] text-[#3D0A30]">{text}</span>
  </span>
);

/** One talking point: number, bold pillar lead, approved text, next-call tag and the INSIGHT / Response line. */
const TalkingPointCard = ({ point, index, category, revised, visible }: TalkingPointCardProps) => {
  const highlight = revised && isChanged(point);
  return (
    <div
      className={cx(
        'relative z-[1] flex items-start gap-2.5 rounded-[9px] border border-l-[3px] bg-white transition-all duration-300',
        // After a Post-Call Assessment the rows get more room.
        revised ? 'px-3.5 py-3' : 'px-[11px] py-2 short:py-1.5 tall:px-[13px] tall:py-2.5',
        CARD[category],
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[7px] opacity-0',
        highlight && 'shadow-[0_0_0_1px_rgba(109,91,208,.35)]',
      )}
      data-testid="talking-point"
    >
      <span className={cx('mt-px flex size-[21px] flex-none items-center justify-center rounded-md text-[12.3px] font-bold text-white', NUMBER[category])}>{index + 1}</span>
      <span className={cx('min-w-0 text-[13.8px] font-medium text-ink', revised ? 'leading-[1.55]' : 'leading-[1.4]')}>
        {point.pillar && (
          <>
            <PillarLead pillar={point.pillar} />{' '}
          </>
        )}
        {point.text}
        {point.tags.map((tag) => (
          <Tag key={tag} text={tag} />
        ))}
        {point.detail && point.detail_label === 'Insight' && <InsightLine text={point.detail} roomy={revised} />}
        {point.detail && point.detail_label !== 'Insight' && (
          <span className="mt-1 block text-[13px] font-medium leading-[1.45] text-ink2">
            <b className="text-green">{C.response}</b> {point.detail}
          </span>
        )}
      </span>
    </div>
  );
};

export default memo(TalkingPointCard);
