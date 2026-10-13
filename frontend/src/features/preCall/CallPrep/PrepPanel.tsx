import { memo, useCallback, type ReactNode } from 'react';
import AiActivityBox from '../../../components/common/AiActivityBox';
import AiStatusChip from '../../../components/common/AiStatusChip';
import EmptyState from '../../../components/common/EmptyState';
import Icon from '../../../components/common/Icon';
import StatusChip from '../../../components/common/StatusChip';
import { LABELS } from '../../../constants/labels';
import { useAiReveal } from '../../../hooks/useAiReveal';
import { useReference } from '../../../hooks/useReference';
import type { CallPrep, Category } from '../../../types/models';
import { cx } from '../../../utils/cx';
import { formatMDY } from '../../../utils/format';
import TalkingPointCard from './TalkingPointCard';

interface PrepPanelProps {
  data: CallPrep;
  category: Category;
  animate: boolean;
  /** The steps already played while the request ran: go straight to the points. */
  skipSteps?: boolean;
  onRevealed: () => void;
  /** Renders the header with the AI status chip. */
  renderHeader: (status: ReactNode, pill: ReactNode) => ReactNode;
  controls: ReactNode;
}

const C = LABELS.callPrep;

/** The suggestions sit in a framed blue panel (thinner 1.5px border; more room after a Post-Call Assessment). */
const FRAME = 'flex flex-col overflow-hidden rounded-xl border-[1.5px] border-[#1B5E9E] bg-[#E6F0FA] shadow-[0_6px_18px_rgba(16,60,110,.14)]';

/**
 * The talking points for one participant × category × revision. Keyed by that
 * triple, so the AI activity (steps, then points one by one) plays once per key.
 * POVO Pulse: after a Post-Call Assessment the new list replaces the old one;
 * the "Updated from the post-call assessment" banner and the delivered history
 * are not shown (the Insight Summary in Call Participant History sums up the call).
 */
const PrepPanel = ({ data, category, animate, skipSteps = false, onRevealed, renderHeader, controls }: PrepPanelProps) => {
  const handleDone = useCallback(() => onRevealed(), [onRevealed]);
  const { categoryLabel } = useReference();
  const reveal = useAiReveal(data.steps, data.points.length, animate, handleDone, skipSteps);
  const revised = data.is_revised;
  const pill = revised ? (
    <StatusChip variant="purple" className="ml-2.5 border-purplebd! bg-purplet! text-[#4B3AA6]!">
      {C.revisedPill(formatMDY(data.revised_from_date))}
    </StatusChip>
  ) : null;
  return (
    <>
      {renderHeader(<AiStatusChip generating={reveal.generating} still className={revised ? '' : 'ml-auto'} />, pill)}
      <div className="flex flex-1 flex-col gap-[9px] p-3 short:gap-[7px] tall:gap-3 tall:p-4">
        {controls}
        {reveal.boxVisible && <AiActivityBox title={C.aiPreparing(categoryLabel(category))} steps={reveal.steps} fading={reveal.boxFading} />}
        {!reveal.boxVisible && (
          <section className={cx(FRAME, revised ? 'gap-3.5 px-3 pb-3.5' : 'gap-2 px-2.5 pb-2.5')} aria-label={data.heading} data-testid="suggestions">
            <div className={cx('mb-0.5 flex items-center gap-1.5 bg-[#0E3E6E] px-3 py-[9px] text-[12.6px] font-bold uppercase tracking-[.7px] text-white', revised ? '-mx-3' : '-mx-2.5')}>
              <Icon name="forum" className="text-base text-white" />
              {data.heading}
            </div>
            {data.points.length === 0 && <EmptyState message={C.noPoints} />}
            <div className={cx('flex flex-col', revised ? 'gap-[18px]' : 'gap-[7px] tall:gap-2')}>
              {data.points.map((point, index) => (
                <TalkingPointCard key={point.point_id} point={point} index={index} category={category} revised={revised} visible={index < reveal.visiblePoints} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default memo(PrepPanel);
