import { memo, useMemo } from 'react';
import { LABELS } from '../../constants/labels';
import type { ComplianceResult } from '../../types/models';
import { complianceLevel, markExcerpts, severityCounts } from '../../utils/compliance';
import { cx } from '../../utils/cx';
import SuggestionText from './SuggestionText';

interface ComplianceReportProps {
  result: ComplianceResult;
  note: string;
  context: string;
}

const C = LABELS.compliance;
const LEVEL_CHIP = {
  bad: 'border-[#FECACA] bg-redbg text-red2',
  rev: 'border-[#FDE68A] bg-warnbg text-warn',
  ok: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]',
};

const Stat = ({ value, label, color }: { value: number; label: string; color: string }) => (
  <span className="flex min-w-[52px] flex-col items-center rounded-[9px] border border-line bg-white p-1.5">
    <b className={cx('text-[19px] font-bold leading-[1.1]', value ? color : 'text-green')}>{value}</b>
    <small className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[.4px] text-ink3">{label}</small>
  </span>
);

/** The concise report: label, one line per issue, severity counts, your note (flags marked) and the rewrite. */
const ComplianceReport = ({ result, note, context }: ComplianceReportProps) => {
  const level = complianceLevel(result.issues, result.max_severity);
  const counts = severityCounts(result.issues);
  const marked = useMemo(() => markExcerpts(note, result.issues.map((i) => i.excerpt)), [note, result.issues]);
  return (
    <div className="flex flex-col gap-[9px]">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3.5 rounded-xl border border-line bg-[#F7F9FC] px-3.5 py-2.5 max-bp640:grid-cols-1">
        <div>
          <span className={cx('inline-flex items-center rounded-full border px-[11px] py-[3px] text-xs font-bold uppercase tracking-[.5px]', LEVEL_CHIP[level])}>{result.result_label}</span>
          <div className="mt-1.5 text-[13px] font-medium leading-[1.4] text-ink2">{C.issuesFound(result.issues.length, context)}</div>
          <ul className="m-0 mt-2 flex flex-col gap-1 pl-[18px]">
            {result.issues.map((issue) => (
              <li key={`${issue.rule_id}-${issue.excerpt}`} className="text-[13.4px] font-medium leading-[1.45] text-ink">
                {issue.excerpt && <q className="font-semibold text-red2">{issue.excerpt}</q>} {issue.title}
                <span className="block text-[12.6px] text-ink3">{issue.fix}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-1.5">
          <Stat value={counts.high} label={C.high} color="text-red" />
          <Stat value={counts.med} label={C.medium} color="text-[#D97706]" />
          <Stat value={counts.low} label={C.low} color="text-[#2563EB]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 max-bp640:grid-cols-1">
        <div className="flex flex-col">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[.6px] text-ink3">{C.youWrote}</div>
          <div className="flex-1 whitespace-pre-wrap break-words rounded-[9px] border border-redbd bg-redbg px-3 py-[9px] text-[14.2px] font-medium leading-[1.45] text-ink">
            {marked.map((part, index) =>
              part.marked ? (
                <mark key={`m-${index}`} className="rounded-[3px] bg-[#FECACA] px-0.5 font-bold text-[#7F1D1D]">
                  {part.text}
                </mark>
              ) : (
                <span key={`t-${index}`}>{part.text}</span>
              ),
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[.6px] text-ink3">{C.suggested}</div>
          <div
            className={cx(
              'flex-1 whitespace-pre-wrap break-words rounded-[9px] border px-3 py-[9px] text-[13.8px] font-medium leading-normal',
              result.suggested_text ? 'border-[#A7F3D0] bg-[#F0FDF4] text-[#14532D]' : 'border-line bg-[#F7F9FC] text-ink3',
            )}
          >
            {result.suggested_text ? <SuggestionText text={result.suggested_text} /> : C.fillBrackets}
          </div>
        </div>
      </div>
      {result.suggested_text && <div className="text-[12.2px] font-medium text-ink3">{C.suggestionNote}</div>}
    </div>
  );
};

export default memo(ComplianceReport);
