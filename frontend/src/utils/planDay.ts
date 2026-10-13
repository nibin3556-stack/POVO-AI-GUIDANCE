import { LABELS } from '../constants/labels';
import type { Interaction, Target } from '../types/models';
import { daysBetween } from './format';

const S = LABELS.planDay.signal;
const A = LABELS.planDay.action;

/** A Super High target with no call in more than this many days is the first Why Today signal. */
export const WHY_GAP_DAYS = 30;
/** Engagement Data counts the interactions of the last 30 days. */
export const ENGAGEMENT_DAYS = 30;
export const FOCUS_CARD_COUNT = 3;

export interface FocusZip {
  zip: string;
  city: string;
  /** Biologic or JAK Inhibitor (not Conventional) call-plan targets in the ZIP code. */
  count: number;
}

export type WhyTone = 'miss' | 'opp';

export interface WhyToday {
  /** The signal that set the rank (1 = most urgent, 7 = nothing open). */
  rank: number;
  tone: WhyTone;
  /** "No call in 41 days · D10 Super High" */
  why: string;
  /** "Reconnect this week, then ask for the next patient" */
  action: string;
}

export interface FocusPick {
  target: Target;
  why: WhyToday;
}

export type FocusResult =
  | { kind: 'picks'; picks: FocusPick[] }
  | { kind: 'onlyConventional'; city: string }
  | { kind: 'unknown' }
  | { kind: 'none' };

/** In the call plan with a tier: the targets Plan Your Day works from. */
const inPlan = (t: Target): boolean => t.is_in_call_plan && t.tier_code !== null;
/** Conventional targets are the least ready to convert and never suggested. */
const eligible = (t: Target): boolean => inPlan(t) && t.segment_code !== 'conv' && Boolean(t.zip);

const upper = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Every target once (Must-Wins and the Full Call Plan come from two endpoints). */
export const uniqueTargets = (lists: Target[][]): Target[] => {
  const seen = new Map<string, Target>();
  lists.flat().forEach((t) => {
    if (!seen.has(t.hcp_id)) seen.set(t.hcp_id, t);
  });
  return [...seen.values()];
};

/** Territory ZIP codes with eligible targets, sorted. */
export const focusZips = (targets: Target[]): FocusZip[] => {
  const byZip = new Map<string, FocusZip>();
  targets.filter(eligible).forEach((t) => {
    const z = byZip.get(t.zip) ?? { zip: t.zip, city: t.city, count: 0 };
    z.count += 1;
    byZip.set(t.zip, z);
  });
  return [...byZip.values()].sort((a, b) => a.zip.localeCompare(b.zip));
};

/** ZIP codes whose code or city contains the typed text. */
export const matchZips = (zips: FocusZip[], query: string): FocusZip[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return zips.filter((z) => z.zip.includes(q) || z.city.toLowerCase().includes(q));
};

/** Keeps what a ZIP code or city search may contain. */
export const cleanZipInput = (value: string): string => value.replace(/[^0-9A-Za-z ,.-]/g, '');

interface Signal {
  n: number;
  on: boolean;
  text: string;
  tone: WhyTone;
}

/**
 * WHY TODAY: one rule set, built only from numbers shown on the card. Signals in
 * priority order (the first true signal is the reason and sets the rank):
 * 1 Super High with no call in more than 30 days, 2 not called since launch,
 * 3 HS patients and none on POVO, 4 PEFs pending, 5 behind the call goal to
 * date (only when calls and goal are known), 6 HS patients not yet on POVO.
 * The action line names the next step for the first two signals.
 */
export const whyToday = (t: Target, tierName: string, today: string, calls: number | null = null, goal: number | null = null): WhyToday => {
  const ds = daysBetween(t.last_call_date, today);
  const nc = !t.last_call_date;
  const sh = t.tier_code === 'SH';
  const hs = t.hs_patients;
  const pv = t.povo_patients;
  const pend = Math.max(0, t.pef - pv);
  const behind = calls !== null && goal !== null && !nc && calls < goal;
  const signals: Signal[] = [
    { n: 1, on: !nc && sh && (ds ?? 0) > WHY_GAP_DAYS, text: S.noCallIn(ds ?? 0), tone: 'miss' },
    { n: 2, on: nc, text: S.notCalled, tone: 'miss' },
    { n: 3, on: !nc && hs > 0 && pv === 0, text: S.noPovo, tone: 'miss' },
    { n: 4, on: pend > 0, text: S.pefs(pend), tone: 'miss' },
    { n: 5, on: behind, text: S.behind(calls ?? 0, goal ?? 0), tone: 'miss' },
    { n: 6, on: hs > pv, text: S.notOnPovo(hs - pv), tone: 'opp' },
  ];
  const on = signals.filter((s) => s.on);
  const primary = on[0] ?? { n: 7, on: true, text: S.allOnPovo(hs), tone: 'opp' as WhyTone };
  const gap = Math.max(0, (goal ?? 0) - (calls ?? 0));
  const actionFor = (n: number): string => {
    if (n === 5) return A[5](gap);
    return A[n as 1 | 2 | 3 | 4 | 6];
  };
  const parts = on
    .slice(0, 2)
    .filter((s) => !(s.n === 6 && (primary.n === 2 || primary.n === 3)))
    .map((s) => actionFor(s.n));
  if (!parts.length) parts.push(A.keep);
  else if (parts.length === 1 && [1, 4, 5].includes(primary.n) && hs > pv) parts.push(A[6]);
  return {
    rank: primary.n,
    tone: primary.tone,
    why: LABELS.planDay.why(upper(primary.text), t.decile, tierName),
    action: upper(parts.join(A.then)),
  };
};

/**
 * The Top 3 for a ZIP code: HCPs first (by Why Today rank, then HS volume, then
 * the longest time since the last call, then name), then NPs and PAs from the
 * same ZIP code to fill the 3 cards.
 */
export const pickFocus = (
  targets: Target[],
  zip: string,
  tierName: (t: Target) => string,
  today: string,
): FocusResult => {
  const z = zip.trim();
  const pool = targets.filter((t) => eligible(t) && t.zip === z).map((t) => ({ target: t, why: whyToday(t, tierName(t), today) }));
  if (!pool.length) {
    const conventional = targets.find((t) => inPlan(t) && t.zip === z);
    return conventional ? { kind: 'onlyConventional', city: conventional.city } : { kind: 'unknown' };
  }
  const days = (t: Target) => daysBetween(t.last_call_date, today) ?? 0;
  const rank = (list: FocusPick[]) =>
    [...list].sort(
      (a, b) =>
        a.why.rank - b.why.rank ||
        b.target.hs_patients - a.target.hs_patients ||
        days(b.target) - days(a.target) ||
        a.target.display_name.localeCompare(b.target.display_name),
    );
  const hcps = rank(pool.filter((p) => p.target.role_type === 'HCP')).slice(0, FOCUS_CARD_COUNT);
  const others = rank(pool.filter((p) => p.target.role_type !== 'HCP')).slice(0, FOCUS_CARD_COUNT - hcps.length);
  const picks = [...hcps, ...others];
  return picks.length ? { kind: 'picks', picks } : { kind: 'none' };
};

/** Interactions of the last 30 days (Engagement Data). */
export const recentInteractions = (interactions: Interaction[], today: string): number =>
  interactions.filter((i) => {
    const d = daysBetween(i.date, today);
    return d !== null && d >= 0 && d <= ENGAGEMENT_DAYS;
  }).length;

/** POVO Sales calls from the data start to today (the decile frequency's numerator, per target). */
export const repCallsSince = (interactions: Interaction[], dataStart: string, today: string): number =>
  interactions.filter((i) => i.channel_code === 'rep' && i.date >= dataStart && i.date <= today).length;
