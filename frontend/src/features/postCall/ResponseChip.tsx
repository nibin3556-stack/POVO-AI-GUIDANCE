import { Tooltip } from '@mui/material';
import { memo } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import { LABELS } from '../../constants/labels';
import type { ComplianceEntry } from '../../redux/callSession/callSessionSlice';
import type { Category } from '../../types/models';
import type { AssessmentItemValues } from '../../utils/assessment';
import { cx } from '../../utils/cx';
import { truncate } from '../../utils/format';
import SuggestionText from './SuggestionText';

interface ResponseChipProps {
  item: AssessmentItemValues;
  category: Category;
  entry: ComplianceEntry | undefined;
}

const CHIP = 'max-w-[46%] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-3 py-1 text-[12.4px] font-bold';
const RATING = ['border-[#F4B99A] bg-[#FDECE3] text-[#9A3412]', 'border-warnbd bg-warnbg text-warndk', 'border-greenbd bg-greenbg text-green'];

const FlagTip = ({ entry }: { entry: ComplianceEntry }) => {
  const r = entry.result;
  if (!r) return <span>{LABELS.compliance.serverFlag(entry.chip ?? '')}</span>;
  return (
    <span className="block w-[min(620px,80vw)]">
      <span className="mb-1.5 flex items-center gap-[7px] text-xs font-bold uppercase tracking-[.4px] text-red2">
        <AiSparkle className="size-[15px] text-purple" />
        {LABELS.compliance.tipHeader(r.score, r.issues.length)}
      </span>
      {r.issues.map((i) => (
        <span key={`${i.rule_id}-${i.excerpt}`} className="flex flex-col gap-0.5 border-t border-dashed border-line2 py-[5px] text-[12.6px] leading-[1.4]">
          <b className="text-[13.6px] font-bold text-red2">{i.title}</b>
          <span className="text-ink2">{i.why}</span>
          <span className="font-semibold text-ink">{i.fix}</span>
        </span>
      ))}
      {r.suggested_text && (
        <span className="mt-2 block rounded-[9px] border border-[#A7F3D0] bg-[#F0FDF4] px-3 py-2 text-[13.4px] text-[#14532D]">
          <SuggestionText text={r.suggested_text} />
        </span>
      )}
      <span className="mt-1 block text-xs font-semibold text-ink3">{LABELS.compliance.tipFoot}</span>
    </span>
  );
};

/** Collapsed row summary: red compliance chip (hover for the report), the rating, a note snippet or "Selected". */
const ResponseChip = ({ item, category, entry }: ResponseChipProps) => {
  const note = item.note.trim();
  if (entry?.status === 'flagged') {
    return (
      <Tooltip title={<FlagTip entry={entry} />} placement="bottom-end" slotProps={{ tooltip: { sx: { maxWidth: 'none', borderColor: '#F3B4B4' } } }}>
        <span className={cx(CHIP, 'cursor-help border-red bg-red text-white')}>
          {entry.result && <span className="mr-1.5 inline-block rounded-full bg-white px-1.5 text-[11px] text-red2">{entry.result.score}</span>}
          {truncate(note, 48) || entry.chip}
        </span>
      </Tooltip>
    );
  }
  if (category !== 'objection' && item.reception !== null) {
    return <span className={cx(CHIP, RATING[item.reception])}>{LABELS.postCall.reception[item.reception]}</span>;
  }
  if (note) return <span className={cx(CHIP, 'border-bluet2 bg-bluet text-blued')}>{truncate(note, 48)}</span>;
  return <span className={cx(CHIP, 'border-[#B9C7D6] bg-[#EEF2F7] text-[11px] uppercase tracking-[.4px] text-ink3')}>{LABELS.postCall.selected}</span>;
};

export default memo(ResponseChip);
