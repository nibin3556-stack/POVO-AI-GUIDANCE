import { Dialog } from '@mui/material';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import AiActivityBox from '../../components/common/AiActivityBox';
import AiStatusChip from '../../components/common/AiStatusChip';
import Icon from '../../components/common/Icon';
import Loader from '../../components/common/Loader';
import { DEFAULT_TARGET_SORT, FEATURES } from '../../constants/constant';
import { LABELS } from '../../constants/labels';
import { useAiReveal } from '../../hooks/useAiReveal';
import { useFeatures } from '../../hooks/useFeatures';
import { useReference } from '../../hooks/useReference';
import { useSelectTarget } from '../../hooks/useSelectTarget';
import { useGetDecilesQuery } from '../../redux/api/performanceApi';
import { sessionApi } from '../../redux/api/sessionApi';
import { useGetMustWinsQuery, useGetTargetsQuery } from '../../redux/api/targetsApi';
import type { Target } from '../../types/models';
import { formatWeekdayDate } from '../../utils/format';
import { cleanZipInput, focusZips, matchZips, pickFocus, uniqueTargets, type FocusPick, type FocusZip } from '../../utils/planDay';
import { EMPTY_FILTERS } from '../../utils/targets';
import FocusCard from './FocusCard';

interface PlanDayDialogProps {
  onClose: () => void;
}

const D = LABELS.planDay;
/** The whole call plan in one page (the backend caps a page at 200 rows). */
const ALL_TARGETS = { filters: EMPTY_FILTERS, page: 1, limit: 200, sort: DEFAULT_TARGET_SORT };
/** A picked card closes the pop-up and opens its Call Prep after this pause. */
const PICK_DELAY_MS = 260;

const Notice = ({ icon, children }: { icon: string; children: string }) => (
  <div className="flex items-center gap-2 rounded-[9px] border border-warnbd bg-warnbg px-3 py-[9px] text-[13.4px] font-medium text-warndk" role="alert">
    <Icon name={icon} className="text-lg" />
    {children}
  </div>
);

interface ResultsProps {
  zip: string;
  picks: FocusPick[];
  today: string;
  dataStart: string | null;
  goalFor: (t: Target) => number | null;
  onPick: (hcpId: string) => void;
}

/** The AI activity (three steps), then the Top 3 cards one after another. Keyed by ZIP code, so it replays per search. */
const FocusResults = ({ zip, picks, today, dataStart, goalFor, onPick }: ResultsProps) => {
  const steps = useMemo(() => D.steps(zip, picks.length), [zip, picks.length]);
  const reveal = useAiReveal(steps, picks.length, true, () => undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const pick = (id: string) => {
    setSelected(id);
    onPick(id);
  };
  return (
    <>
      <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
        <b className="text-[15px] font-bold text-navyd">{D.heading(picks.length)}</b>
        <AiStatusChip generating={reveal.generating} className="ml-auto" />
      </div>
      {reveal.boxVisible ? (
        <div className="mt-2">
          <AiActivityBox title={D.preparing(picks.length, zip)} steps={reveal.steps} fading={reveal.boxFading} />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 gap-3 max-bp900:grid-cols-1">
          {picks.map((p, i) => (
            <FocusCard
              key={p.target.hcp_id}
              pick={p}
              today={today}
              dataStart={dataStart}
              goal={goalFor(p.target)}
              visible={i < reveal.visiblePoints}
              selected={selected === p.target.hcp_id}
              onPick={pick}
            />
          ))}
        </div>
      )}
    </>
  );
};

const ZipSuggestions = ({ zips, query, onPick }: { zips: FocusZip[]; query: string; onPick: (zip: string) => void }) => (
  <div role="listbox" aria-label={D.inputLabel} className="w-full max-w-[504px] overflow-hidden rounded-[9px] border border-line2">
    {zips.length === 0 && <div className="px-3 py-2 text-[13px] font-medium text-ink3">{D.noMatch(query.trim())}</div>}
    {zips.map((z) => (
      <button
        key={z.zip}
        type="button"
        role="option"
        aria-selected={false}
        onClick={() => onPick(z.zip)}
        className="flex w-full items-baseline gap-2.5 border-b border-line2 bg-white px-3 py-2 text-left last:border-b-0 hover:bg-bluet"
      >
        <b className="text-sm font-bold text-ink">{z.zip}</b>
        <span className="text-[12.6px] font-medium text-ink2">{D.suggestion(z.city, z.count)}</span>
      </button>
    ))}
  </div>
);

/**
 * Plan Your Day (opened from the POVO Pulse panel): the rep types a territory
 * ZIP code and gets the Top 3 targets to focus on today (Conventional excluded,
 * HCPs first, then NPs and PAs from the same ZIP code), ranked by the Why Today
 * rules. Picking a card opens its Call Prep in Pre-Call Planning.
 */
const PlanDayDialog = ({ onClose }: PlanDayDialogProps) => {
  const features = useFeatures();
  const ref = useReference();
  const selectTarget = useSelectTarget();
  const { data: me } = sessionApi.endpoints.getMe.useQueryState();
  const mustWins = useGetMustWinsQuery(undefined, { skip: !features.has(FEATURES.MUST_WINS) });
  const plan = useGetTargetsQuery(ALL_TARGETS);
  const deciles = useGetDecilesQuery(undefined, { skip: !features.has(FEATURES.DECILES) });
  const [query, setQuery] = useState('');
  const [zip, setZip] = useState<string | null>(null);
  const today = me?.today ?? '';

  // A rep switch (impersonation) closes the pop-up.
  const employeeId = me?.effective.employee_id;
  const openedFor = useRef(employeeId);
  useEffect(() => {
    if (employeeId !== openedFor.current) onClose();
  }, [employeeId, onClose]);

  const targets = useMemo(
    () => uniqueTargets([mustWins.data?.hs_volume ?? [], mustWins.data?.hs_jak ?? [], plan.data?.items ?? []]),
    [mustWins.data, plan.data],
  );
  const zips = useMemo(() => focusZips(targets), [targets]);
  const suggestions = useMemo(() => (zip === null ? matchZips(zips, query) : []), [zip, zips, query]);
  const result = useMemo(() => (zip ? pickFocus(targets, zip, (t) => ref.tierName(t.tier_code), today) : null), [zip, targets, ref, today]);
  const goalFor = useCallback(
    (t: Target) => {
      const tier = deciles.data?.tiers.find((x) => x.tier_code === t.tier_code);
      return tier ? Math.round(tier.frequency_goal) : null;
    },
    [deciles.data],
  );

  const run = (z: string) => {
    setQuery(z);
    setZip(z);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = query.trim();
    if (!v) return;
    const m = matchZips(zips, v);
    run(m.length === 1 && m[0] ? m[0].zip : v);
  };
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pickTimer.current) clearTimeout(pickTimer.current);
  }, []);
  const openTarget = useCallback(
    (hcpId: string) => {
      pickTimer.current = setTimeout(() => {
        onClose();
        selectTarget(hcpId);
      }, PICK_DELAY_MS);
    },
    [onClose, selectTarget],
  );

  const zipList = zips.map((z) => z.zip).join(', ');
  const loading = plan.isLoading || mustWins.isLoading;
  const wide = result?.kind === 'picks';
  const firstName = (me?.effective.full_name ?? '').split(' ')[0] ?? '';

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth={false}
      aria-labelledby="plan-day-title"
      slotProps={{ paper: { sx: { width: wide ? 'min(1080px, 96vw)' : 'min(540px, 96vw)', maxHeight: '92vh', transition: 'width .3s ease' } } }}
    >
      <div className="flex items-start justify-between gap-3 bg-blued px-[18px] py-2 text-white">
        <div>
          <b id="plan-day-title" className="block text-xl font-bold tracking-[-.2px]">
            {D.title(firstName)}
          </b>
          <small className="mt-0.5 block text-[13px] font-medium text-[#DCEAF7]">{formatWeekdayDate(today)}</small>
        </div>
        <button type="button" onClick={onClose} aria-label={D.close} className="flex rounded-md p-0.5 text-white hover:bg-white/15">
          <Icon name="close" />
        </button>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-[18px] py-2.5">
        <p className="m-0 text-[15px] font-semibold text-ink">{D.prompt}</p>
        <form onSubmit={submit} className="flex w-full max-w-[504px] gap-[9px]">
          <input
            type="text"
            inputMode="numeric"
            maxLength={20}
            autoFocus
            autoComplete="off"
            value={query}
            aria-label={D.inputLabel}
            placeholder={D.placeholder}
            onChange={(e) => {
              setQuery(cleanZipInput(e.target.value));
              setZip(null);
            }}
            className="min-w-0 flex-1 rounded-[9px] border-[1.5px] border-line px-3 py-2.5 text-[15px] font-medium text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(21,108,180,.15)]"
          />
        </form>
        {loading && query && <Loader label={D.loading} className="justify-start" />}
        {!loading && zip === null && query.trim() && <ZipSuggestions zips={suggestions} query={query} onPick={run} />}
        {result?.kind === 'unknown' && zip && <Notice icon="error">{D.noTargets(zip, zipList)}</Notice>}
        {result?.kind === 'onlyConventional' && zip && <Notice icon="info">{D.onlyConventional(result.city, zip, zipList)}</Notice>}
        {result?.kind === 'none' && zip && <Notice icon="info">{D.noneEligible(zip)}</Notice>}
        {result?.kind === 'picks' && zip && (
          <FocusResults key={zip} zip={zip} picks={result.picks} today={today} dataStart={deciles.data?.data_start ?? null} goalFor={goalFor} onPick={openTarget} />
        )}
      </div>
    </Dialog>
  );
};

export default memo(PlanDayDialog);
