import { memo, useCallback, type ReactNode } from 'react';
import AiActivityBox from '../../../components/common/AiActivityBox';
import AiSparkle from '../../../components/common/AiSparkle';
import AiStatusChip from '../../../components/common/AiStatusChip';
import EmptyState from '../../../components/common/EmptyState';
import Icon from '../../../components/common/Icon';
import StatusChip from '../../../components/common/StatusChip';
import { LABELS } from '../../../constants/labels';
import { useAiReveal } from '../../../hooks/useAiReveal';
import { useReference } from '../../../hooks/useReference';
import type { CallPrep, Category } from '../../../types/models';
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

const RevisionBanner = ({ data }: { data: CallPrep }) =>
  data.banner ? (
    <div className="flex items-center gap-2 rounded-[9px] border border-purple2 bg-purple2 px-[11px] py-[7px] text-[13.4px] font-semibold leading-[1.45] text-white">
      <AiSparkle className="size-[17px]" />
      <span>
        {C.bannerLead(formatMDY(data.revised_from_date))}
        {data.banner.summary}
        <span className="mt-[3px] block">
          <b>{C.nextBestAction}</b> {data.banner.next_best_action}
        </span>
      </span>
    </div>
  ) : null;

/**
 * The talking points for one participant × category × revision. Keyed by that
 * triple, so the AI activity (steps, then points one by one) plays once per key.
 */
const PrepPanel = ({ data, category, animate, skipSteps = false, onRevealed, renderHeader, controls }: PrepPanelProps) => {
  const handleDone = useCallback(() => onRevealed(), [onRevealed]);
  const { categoryLabel } = useReference();
  const reveal = useAiReveal(data.steps, data.points.length, animate, handleDone, skipSteps);
  const revised = data.is_revised;
  const pill = revised ? (
    <StatusChip variant="purple" className="ml-2.5 animate-tag-glow border-purple2! bg-purple2! text-white!">
      {C.revisedPill(formatMDY(data.revised_from_date))}
    </StatusChip>
  ) : null;
  return (
    <>
      {renderHeader(<AiStatusChip generating={reveal.generating} className={revised ? '' : 'ml-auto'} />, pill)}
      <div className="flex flex-1 flex-col gap-[9px] p-3 short:gap-[7px] tall:gap-3 tall:p-4">
        {controls}
        {revised && <RevisionBanner data={data} />}
        <div className="flex flex-wrap items-center gap-[7px] text-[13.2px] font-medium text-ink2">
          <Icon name="forum" className="text-[17.9px] text-teal" />
          <b className="font-semibold text-blued">{data.heading}</b>
        </div>
        {reveal.boxVisible && <AiActivityBox title={C.aiPreparing(categoryLabel(category))} steps={reveal.steps} fading={reveal.boxFading} />}
        {!reveal.boxVisible && data.points.length === 0 && <EmptyState message={C.noPoints} />}
        {!reveal.boxVisible && (
          <div className="point-rail relative flex flex-col gap-[7px] tall:gap-2.5">
            {data.points.map((point, index) => (
              <TalkingPointCard key={point.point_id} point={point} index={index} category={category} revised={revised} visible={index < reveal.visiblePoints} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default memo(PrepPanel);
