import { memo, type KeyboardEvent, type ReactNode } from 'react';
import CheckMark from '../../components/common/CheckMark';
import CompetitiveFocusTag from '../../components/common/CompetitiveFocusTag';
import Icon from '../../components/common/Icon';
import RoleChip from '../../components/common/RoleChip';
import SegmentTag from '../../components/common/SegmentTag';
import { LABELS } from '../../constants/labels';
import { useReference } from '../../hooks/useReference';
import { useGetProfileQuery } from '../../redux/api/callPrepApi';
import { cx } from '../../utils/cx';
import { daysBetween, formatMDY } from '../../utils/format';
import { recentInteractions, repCallsSince, type FocusPick, type WhyTone } from '../../utils/planDay';
import { targetFullName } from '../../utils/targets';

interface FocusCardProps {
  pick: FocusPick;
  today: string;
  /** Data start (launch) for the calls to date; null when the decile data is not available. */
  dataStart: string | null;
  /** Calls goal to date for the target's tier; null when unknown. */
  goal: number | null;
  visible: boolean;
  selected: boolean;
  onPick: (hcpId: string) => void;
}

const D = LABELS.planDay;

/** Top border and Why Today box follow the reason: amber = missed opportunity, blue = opportunity. */
const TONE: Record<WhyTone, { card: string; box: string; kind: string }> = {
  miss: { card: 'border-t-[#D97706]', box: 'border-[#EDCB86] border-l-[#D97706] bg-[#FEF3DC]', kind: 'text-[#8A4A06]' },
  opp: { card: 'border-t-[#1B6FBF]', box: 'border-[#A9CBE8] border-l-[#1B6FBF] bg-[#EAF3FB]', kind: 'text-[#0F4C81]' },
};

const Line = ({ icon, children, className }: { icon?: string; children: ReactNode; className?: string }) => (
  <div className={cx('flex h-6 min-w-0 items-center gap-[7px] overflow-hidden whitespace-nowrap text-[13.4px] font-medium text-ink2', className)}>
    {icon && <Icon name={icon} className="w-[18px] flex-none overflow-hidden text-[17px] text-ink3" />}
    {children}
  </div>
);

/**
 * One Plan Your Day card: who, where, segment and focus, the Why Today reason
 * with its next step, then one fact per row (every row in the same place on all
 * three cards). Engagement and calls to date come from the target's profile.
 */
const FocusCard = ({ pick, today, dataStart, goal, visible, selected, onPick }: FocusCardProps) => {
  const ref = useReference();
  const { target: t, why } = pick;
  const profile = useGetProfileQuery(t.hcp_id);
  const person = profile.data?.participants.find((p) => p.hcp_id === t.hcp_id) ?? profile.data?.participants[0];
  const engagement = person ? D.engagement(recentInteractions(person.interactions, today)) : D.pending;
  const calls = person && dataStart ? repCallsSince(person.interactions, dataStart, today) : null;
  const pend = Math.max(0, t.pef - t.povo_patients);
  const days = daysBetween(t.last_call_date, today);
  const segment = ref.segment(t.segment_code);
  const rows: [string, string][] = [
    [D.rows.prescribing, D.prescribing(t.hs_patients, t.povo_patients)],
    [D.rows.adfa, pend ? D.pefPending(pend) : D.noneOpen],
    [D.rows.previousCall, t.last_call_date ? D.previousCall(formatMDY(t.last_call_date), days ?? 0) : D.notCalledYet],
    [D.rows.engagement, engagement],
    [D.rows.reach, calls === null || goal === null ? D.pending : D.reach(calls, goal)],
  ];
  const tone = TONE[why.tone];
  const name = targetFullName(t);
  return (
    <div
      role="checkbox"
      tabIndex={visible ? 0 : -1}
      aria-checked={selected}
      aria-label={D.select(name)}
      onClick={() => onPick(t.hcp_id)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        onPick(t.hcp_id);
      }}
      data-testid="focus-card"
      className={cx(
        'grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)] rounded-xl border-[1.5px] border-t-4 border-line bg-white p-3 text-left transition-[border-color,box-shadow,opacity,transform] duration-300 hover:border-blue focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blued',
        tone.card,
        selected && 'border-blue bg-[#F6FAFE] shadow-[0_0_0_3px_rgba(21,108,180,.18)]',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2.5 opacity-0',
      )}
    >
      <div className="flex h-[26px] min-w-0 flex-nowrap items-center gap-[7px]">
        <CheckMark checked={selected} />
        <RoleChip role={t.role_type} size="sm" />
        <b className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base font-bold text-ink" title={name}>
          {t.display_name}
        </b>
      </div>
      <Line icon="domain" className="mt-1.5 font-semibold text-ink">
        <span className="overflow-hidden text-ellipsis" title={t.account_name}>
          {t.account_name}
        </span>
      </Line>
      <Line icon="location_on">
        <span className="overflow-hidden text-ellipsis">
          {t.city} {t.zip}
        </span>
      </Line>
      <Line className="mt-1 h-[26px] gap-1.5">
        {segment && <SegmentTag label={segment.short_name} color={segment.color_hex} />}
        <CompetitiveFocusTag code={t.competitive_focus} />
      </Line>
      <div className={cx('my-1.5 flex flex-col gap-0.5 rounded-[10px] border border-l-[5px] px-3 pb-2 pt-[7px]', tone.box)}>
        <span className={cx('text-[11px] font-extrabold uppercase tracking-[.6px]', tone.kind)}>{D.whyToday}</span>
        <b className="overflow-hidden text-ellipsis whitespace-nowrap text-[15.5px] font-extrabold leading-tight text-ink" title={why.why}>
          {why.why}
        </b>
        <span className="line-clamp-2 text-[13.4px] font-semibold leading-[1.35] text-ink2" title={why.action}>
          {why.action}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[136px_minmax(0,1fr)] border-t border-line2 text-[13px]">
        {rows.map(([label, value], i) => (
          <div key={label} className="contents">
            <dt className={cx('flex h-[25px] items-center overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-ink3', i < rows.length - 1 && 'border-b border-line2')}>{label}</dt>
            <dd className={cx('m-0 flex h-[25px] items-center justify-end overflow-hidden text-ellipsis whitespace-nowrap text-right font-bold text-ink', i < rows.length - 1 && 'border-b border-line2')}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default memo(FocusCard);
