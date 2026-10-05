import { memo, type ReactNode } from 'react';
import AiSparkle from '../../components/common/AiSparkle';
import AsyncContent from '../../components/common/AsyncContent';
import Icon from '../../components/common/Icon';
import RoleChip from '../../components/common/RoleChip';
import { LABELS } from '../../constants/labels';
import { useSelectTarget } from '../../hooks/useSelectTarget';
import { useGetGuidanceQuery } from '../../redux/api/performanceApi';
import type { Guidance, GuidanceFocus } from '../../types/models';
import { cx } from '../../utils/cx';
import { useReference } from '../../hooks/useReference';

const P = LABELS.performance;

/** Each box carries its meaning: amber missed, green strong, blue focus. */
const BOX = { miss: 'border-[#EFC98A] bg-[#FFF5E3]', good: 'border-[#A9D9BA] bg-[#E9F6EE]', foc: 'border-[#AFCDEB] bg-[#EAF3FC]' };

const Column = ({ title, tone, children }: { title: string; tone: 'miss' | 'good' | 'foc'; children: ReactNode }) => (
  <div className={cx('min-w-0 rounded-[9px] border px-2 py-1', BOX[tone])}>
    <div className={cx('mb-0.5 text-[10.6px] font-bold uppercase tracking-[.4px]', tone === 'miss' && 'text-warn', tone === 'good' && 'text-green', tone === 'foc' && 'text-blued')}>
      {title}
    </div>
    {children}
  </div>
);

const Item = ({ title, children }: { title: string; children: ReactNode }) => (
  <li title={title} className="text-[11.8px] font-medium leading-tight text-ink2 max-bp1400:text-[11.2px] [&_b]:font-bold [&_b]:text-ink">
    {children}
  </li>
);

const FocusButton = memo(({ target, onGo }: { target: GuidanceFocus; onGo: (id: string) => void }) => (
  <button
    type="button"
    title={target.reason}
    onClick={() => onGo(target.hcp_id)}
    className="mt-0.5 flex w-full items-center gap-[5px] rounded-[7px] border border-[#9EC2E4] bg-white px-1.5 py-px hover:border-blue hover:bg-bluet"
  >
    <RoleChip role={target.role_type} size="sm" />
    <b className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-xs font-bold text-ink">{target.display_name}</b>
    <Icon name="arrow_forward" className="text-[15px] text-blue" />
  </button>
));
FocusButton.displayName = 'FocusButton';

type TopWriterData = NonNullable<Guidance['strong']['top_writer']>;

/** The physician with the most POVO patients; every physician tied for it is named (POC Step 3_63). */
const TopWriter = ({ writer }: { writer: TopWriterData }) => {
  const ties = writer.ties.length ? writer.ties : [writer.display_name];
  if (ties.length === 1) {
    return (
      <Item title={P.mostPovo}>
        <b>{writer.display_name}</b>
        {P.povoPatients(writer.povo_patients)}
      </Item>
    );
  }
  return (
    <Item title={P.tiedPovo(ties.join(', '))}>
      <b>{ties[0]}</b>
      {ties.length === 2 ? (
        <>
          {P.and}
          <b>{ties[1]}</b>
        </>
      ) : (
        P.others(ties.length - 1)
      )}
      {P.povoPatientsEach(writer.povo_patients)}
    </Item>
  );
};

/** The guidance names the top tier by its reference name ("Super High"). */
const TOP_TIER = 'SH';

const GuidanceBody = ({ data, onGo }: { data: Guidance; onGo: (id: string) => void }) => {
  const { tierName } = useReference();
  const top = tierName(TOP_TIER);
  return (
  <div className="grid flex-1 grid-cols-3 gap-[7px] max-bp900:grid-cols-1">
    <Column title={P.missed} tone="miss">
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        {data.missed.map((m) => (
          <Item key={m.hcp_id} title={P.missedTitle(m.name, tierName(m.tier_code), m.days_since_call)}>
            <b>{m.display_name}</b>
            {P.daysNoCall(m.days_since_call)}
          </Item>
        ))}
        {data.super_high_not_writing > 0 && (
          <Item title={P.shNotWritingTitle(top)}>
            <b>{P.superHigh(data.super_high_not_writing, top)}</b>
            {P.notWriting}
          </Item>
        )}
      </ul>
    </Column>
    <Column title={P.strong} tone="good">
      <ul className="m-0 flex list-none flex-col gap-px p-0">
        <Item title={P.trialTitle(data.strong.best_segment.short_name)}>
          <b>{data.strong.best_segment.short_name}</b>
          {P.trialAt}
          <b>{data.strong.best_segment.trial_pct}%</b>
        </Item>
        {data.strong.top_writer && <TopWriter writer={data.strong.top_writer} />}
        <Item title={P.reachTitle(top)}>
          {P.superHighReach(top)}
          <b>{data.strong.super_high_reach_pct}%</b>
        </Item>
      </ul>
    </Column>
    <Column title={P.focus} tone="foc">
      {data.focus.slice(0, 3).map((f) => (
        <FocusButton key={f.hcp_id} target={f} onGo={onGo} />
      ))}
    </Column>
  </div>
  );
};

/** AI Guidance: missed opportunities, strong performance, recommended focus (click opens Tab 2). */
const AiGuidancePanel = () => {
  const { data, error, isLoading, refetch } = useGetGuidanceQuery();
  const selectTarget = useSelectTarget();
  return (
    <section className="flex min-w-0 animate-fade-up flex-col gap-1 rounded-xl border border-l-[6px] border-line border-l-purple bg-white px-3 pb-2 pt-1.5 shadow-e1">
      <div className="flex items-center gap-[7px]">
        <span className="flex size-5 animate-ai-glow-soft items-center justify-center rounded-md bg-purple text-white">
          <AiSparkle className="size-[13px]" />
        </span>
        <b className="text-[12.9px] font-bold uppercase tracking-[.7px] text-purple2">{P.guidanceTitle}</b>
      </div>
      <AsyncContent isLoading={isLoading} error={error} onRetry={() => void refetch()} isEmpty={!data} emptyMessage={P.guidanceEmpty}>
        {data && <GuidanceBody data={data} onGo={selectTarget} />}
      </AsyncContent>
    </section>
  );
};

export default memo(AiGuidancePanel);
