import { memo } from 'react';
import { LABELS } from '../../../constants/labels';
import type { Category, TalkingPoint } from '../../../types/models';
import { isChanged, replacesRemoved, showsPreviousText, tagTone, type TagTone } from '../../../utils/callPrep';
import { cx } from '../../../utils/cx';

interface TalkingPointCardProps {
  point: TalkingPoint;
  index: number;
  category: Category;
  revised: boolean;
  visible: boolean;
}

const C = LABELS.callPrep;

const CARD: Record<Category, string> = {
  messaging: 'border-bluet2 border-l-blue bg-[#F6FAFE]',
  objection: 'border-warnbd border-l-warnb bg-[#FFFAF0]',
  closing: 'border-greenbd border-l-greenb bg-[#F1F9F4]',
};
const NUMBER: Record<Category, string> = { messaging: 'bg-blue', objection: 'bg-warn', closing: 'bg-green' };

const TAG_SOFT: Record<TagTone, string> = {
  new: 'text-green bg-greenbg border-greenbd',
  upd: 'text-blued bg-bluet border-bluet2',
  open: 'text-warndk bg-warnbg border-warnbd',
  res: 'text-green bg-greenbg border-greenbd',
  mv: 'text-purple2 bg-purplet border-purplebd',
  nai: 'text-purple2 bg-purplet border-purplebd',
  rwk: 'text-red2 bg-[#FDECEC] border-redbd',
};
const TAG_SOLID: Record<TagTone, string> = {
  new: 'bg-green',
  upd: 'bg-blued',
  open: 'bg-warn',
  res: 'bg-green',
  mv: 'bg-purple2',
  nai: 'bg-linear-90 from-purple to-blue',
  rwk: 'bg-red2',
};

export const Tag = memo(({ text, solid }: { text: string; solid: boolean }) => {
  const tone = tagTone(text);
  return (
    <span
      className={cx(
        'ml-2 inline-block whitespace-nowrap rounded-full border px-[9px] py-px align-[1px] text-[11.4px] font-bold',
        solid ? cx('animate-tag-glow border-transparent text-white shadow-[0_2px_6px_rgba(16,40,80,.18)]', TAG_SOLID[tone]) : TAG_SOFT[tone],
      )}
    >
      {text}
    </span>
  );
});
Tag.displayName = 'Tag';

/** One talking point: number, pillar label, approved text, revision tags and the Insight / Response line. */
const TalkingPointCard = ({ point, index, category, revised, visible }: TalkingPointCardProps) => {
  const struck = showsPreviousText(point, category);
  const highlight = revised && isChanged(point);
  return (
    <div className="relative z-[1] flex flex-col gap-[7px]">
      {struck && visible && (
        <div className="flex items-start gap-2.5 rounded-[9px] border-[1.5px] border-l-4 border-line border-l-[#9AA8B8] bg-[#F6F8FA] px-[11px] py-1.5">
          <span className="size-[21px] flex-none" />
          <span className="text-[13.8px] font-medium leading-[1.4] text-ink3">
            <s className="decoration-warn decoration-2">{point.previous_text}</s>
            {replacesRemoved(point) && <Tag text={C.removed} solid={revised} />}
          </span>
        </div>
      )}
      <div
        className={cx(
          'flex items-start gap-2.5 rounded-[9px] border-[1.5px] border-l-4 px-[11px] py-2 transition-all duration-300 short:py-1.5 tall:px-[13px] tall:py-2.5',
          CARD[category],
          visible ? 'translate-y-0 opacity-100' : 'translate-y-[7px] opacity-0',
          highlight && 'animate-card-glow shadow-[0_0_0_2px_rgba(109,91,208,.55),0_6px_16px_rgba(109,91,208,.18)]',
        )}
        data-testid="talking-point"
      >
        <span className={cx('mt-px flex size-[21px] flex-none items-center justify-center rounded-md text-[12.3px] font-bold text-white', NUMBER[category])}>{index + 1}</span>
        <span className="text-[13.8px] font-medium leading-[1.4] text-ink">
          {point.pillar && (
            <span
              className={cx(
                'mr-[7px] inline-block whitespace-nowrap rounded-[5px] border px-1.5 align-[1px] text-[10.4px] font-bold uppercase tracking-[.4px]',
                point.pillar === 'Safety' ? 'border-[#F0B5C7] bg-[#FCE7EE] text-[#8E2447]' : 'border-[#9EC2E4] bg-[#E3EFFA] text-blued',
              )}
            >
              {point.pillar}
            </span>
          )}
          {point.text}
          {point.tags.map((tag) => (
            <Tag key={tag} text={tag} solid={revised} />
          ))}
          {point.detail && (
            <span className={cx('mt-1 block text-[13px] font-medium leading-[1.45]', point.detail_label === 'Insight' ? 'text-ink3' : 'text-ink2')}>
              <b className={point.detail_label === 'Insight' ? 'text-purple2' : 'text-green'}>{point.detail_label === 'Insight' ? C.insight : C.response}</b> {point.detail}
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

export default memo(TalkingPointCard);
