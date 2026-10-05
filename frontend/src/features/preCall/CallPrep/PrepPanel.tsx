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
import { reinforceToggled } from '../../../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../../../redux/hooks';
import type { CallPrep, Category } from '../../../types/models';
import { reinforceScope } from '../../../utils/callPrep';
import { cx } from '../../../utils/cx';
import { formatMDY } from '../../../utils/format';
import DeliveredList from './DeliveredList';
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
const EMPTY: string[] = [];

/** The top 3 suggestions sit in a framed blue panel (same pattern as Delivered on earlier calls). */
const FRAME = 'flex flex-col gap-2 overflow-hidden rounded-xl border-[2.5px] border-[#1B5E9E] bg-[#E6F0FA] px-2.5 pb-2.5 shadow-[0_6px_18px_rgba(16,60,110,.14)]';

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
  const dispatch = useAppDispatch();
  const scope = reinforceScope(data.participant_id, category);
  const reinforced = useAppSelector((s) => s.callSession.reinforced[scope] ?? EMPTY);
  const handleDone = useCallback(() => onRevealed(), [onRevealed]);
  const toggle = useCallback((pointId: string) => dispatch(reinforceToggled({ scope, pointId })), [dispatch, scope]);
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
      {renderHeader(<AiStatusChip generating={reveal.generating} className={revised ? '' : 'ml-auto'} />, pill)}
      <div className="flex flex-1 flex-col gap-[9px] p-3 short:gap-[7px] tall:gap-3 tall:p-4">
        {controls}
        {revised && <RevisionBanner data={data} />}
        {reveal.boxVisible && <AiActivityBox title={C.aiPreparing(categoryLabel(category))} steps={reveal.steps} fading={reveal.boxFading} />}
        {!reveal.boxVisible && (
          <section className={cx(FRAME)} aria-label={data.heading} data-testid="suggestions">
            <div className="-mx-2.5 mb-0.5 flex items-center gap-1.5 bg-[#0E3E6E] px-3 py-[9px] text-[12.6px] font-bold uppercase tracking-[.7px] text-white">
              <Icon name="forum" className="text-base text-white" />
              {data.heading}
            </div>
            {data.points.length === 0 && <EmptyState message={C.noPoints} />}
            <div className="flex flex-col gap-[7px] tall:gap-2">
              {data.points.map((point, index) => (
                <TalkingPointCard key={point.point_id} point={point} index={index} category={category} revised={revised} visible={index < reveal.visiblePoints} />
              ))}
            </div>
          </section>
        )}
        {!reveal.boxVisible && reveal.visiblePoints >= data.points.length && (
          <DeliveredList points={data.delivered} reinforced={reinforced} onToggle={toggle} />
        )}
      </div>
    </>
  );
};

export default memo(PrepPanel);
