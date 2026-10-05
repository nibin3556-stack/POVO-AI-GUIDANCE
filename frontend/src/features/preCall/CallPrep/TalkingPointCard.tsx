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

/** The points sit on white cards inside the framed suggestions panel; the left edge follows the category. */
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

export const Tag = memo(({ text, glow }: { text: string; glow: boolean }) => (
  <span className={cx('ml-2 inline-block whitespace-nowrap rounded-full border px-[9px] py-px align-[1px] text-[11.4px] font-bold', TAG[tagTone(text)], glow && 'animate-tag-glow')}>
    {text}
  </span>
));
Tag.displayName = 'Tag';

export const PillarLabel = memo(({ pillar }: { pillar: string }) => (
  <span
    className={cx(
      'mr-[7px] inline-block whitespace-nowrap rounded-[5px] border px-1.5 align-[1px] text-[10.4px] font-bold uppercase tracking-[.4px]',
      pillar === 'Safety' ? 'border-[#B9C9DA] bg-[#E4ECF4] text-[#25415E]' : 'border-[#9EC2E4] bg-[#E3EFFA] text-blued',
    )}
  >
    {pillar}
  </span>
));
PillarLabel.displayName = 'PillarLabel';

/** One talking point: number, pillar label, approved text, next-call tag and the Insight / Response line. */
const TalkingPointCard = ({ point, index, category, revised, visible }: TalkingPointCardProps) => {
  const highlight = revised && isChanged(point);
  return (
    <div
      className={cx(
        'relative z-[1] flex items-start gap-2.5 rounded-[9px] border-[1.5px] border-l-[5px] bg-white px-[11px] py-2 transition-all duration-300 short:py-1.5 tall:px-[13px] tall:py-2.5',
        CARD[category],
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[7px] opacity-0',
        highlight && 'animate-card-glow',
      )}
      data-testid="talking-point"
    >
      <span className={cx('mt-px flex size-[21px] flex-none items-center justify-center rounded-md text-[12.3px] font-bold text-white', NUMBER[category])}>{index + 1}</span>
      <span className="text-[13.8px] font-medium leading-[1.4] text-ink">
        {point.pillar && <PillarLabel pillar={point.pillar} />}
        {point.text}
        {point.tags.map((tag) => (
          <Tag key={tag} text={tag} glow={revised} />
        ))}
        {point.detail && (
          <span className={cx('mt-1 block text-[13px] font-medium leading-[1.45]', point.detail_label === 'Insight' ? 'text-ink3' : 'text-ink2')}>
            <b className={point.detail_label === 'Insight' ? 'text-[#4B3AA6]' : 'text-green'}>{point.detail_label === 'Insight' ? C.insight : C.response}</b> {point.detail}
          </span>
        )}
      </span>
    </div>
  );
};

export default memo(TalkingPointCard);
