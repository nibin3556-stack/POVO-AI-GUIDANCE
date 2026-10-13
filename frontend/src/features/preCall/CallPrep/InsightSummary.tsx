import { memo, useMemo } from 'react';
import Icon from '../../../components/common/Icon';
import { LABELS } from '../../../constants/labels';
import { useGetCallPrepQuery } from '../../../redux/api/callPrepApi';
import type { CallPrep, Category, Participant } from '../../../types/models';
import { formatMediumDate } from '../../../utils/format';
import { lastCallPoints, summaryLine } from '../../../utils/insightSummary';

interface InsightSummaryProps {
  primaryId: string;
  participant: Participant;
}

const CATEGORIES: Category[] = ['messaging', 'objection', 'closing'];
const I = LABELS.insightSummary;

const usePrep = (primaryId: string, participantId: string, category: Category) =>
  useGetCallPrepQuery({ hcp_id: primaryId, participant_id: participantId, category });

/**
 * Insight Summary (Call Participant History, after a Post-Call Assessment): an
 * amber card with one conclusion per section of the last assessed call, built
 * from the points that call delivered (reception, still open or resolved).
 * Shown only once the next-call plan exists for the participant.
 */
const InsightSummary = ({ primaryId, participant }: InsightSummaryProps) => {
  const m = usePrep(primaryId, participant.hcp_id, 'messaging');
  const o = usePrep(primaryId, participant.hcp_id, 'objection');
  const c = usePrep(primaryId, participant.hcp_id, 'closing');
  const preps = useMemo(() => [m.data, o.data, c.data], [m.data, o.data, c.data]);
  const callDate = useMemo(
    () =>
      preps
        .map((p) => (p?.is_revised ? p.revised_from_date : null))
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop() ?? null,
    [preps],
  );
  const lines = useMemo(() => {
    if (!callDate || preps.some((p) => !p)) return null;
    return CATEGORIES.map((category, i) => summaryLine(category, lastCallPoints((preps[i] as CallPrep).delivered, callDate), participant.display_name));
  }, [callDate, preps, participant.display_name]);
  if (!lines || !callDate) return null;
  return (
    <section aria-label={I.title} data-testid="insight-summary" className="mt-0.5 rounded-[10px] border-[1.5px] border-l-[5px] border-[#F0C26B] border-l-[#D97706] bg-[#FFF7E6] px-3 pb-[9px] pt-2">
      <div className="mb-[5px] flex items-center gap-[7px] text-xs font-bold uppercase tracking-[.6px] text-warndk">
        <Icon name="summarize" className="text-lg text-warn" />
        {I.title}
        <span className="ml-auto rounded-full border border-[#F0C26B] bg-white px-[9px] py-px text-[11.4px] font-semibold normal-case tracking-normal text-warndk">
          {I.lastCall(formatMediumDate(callDate))}
        </span>
      </div>
      <ul className="m-0 flex list-disc flex-col gap-[5px] pl-[18px] marker:text-[#D97706]">
        {lines.map((line) => (
          <li key={line} className="pl-0.5 text-[13px] font-medium leading-[1.4] text-ink">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default memo(InsightSummary);
