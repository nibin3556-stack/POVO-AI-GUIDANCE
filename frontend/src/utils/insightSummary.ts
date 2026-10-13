import { LABELS } from '../constants/labels';
import type { Category, DeliveredPoint } from '../types/models';

const I = LABELS.insightSummary;

type TopicTable = [RegExp, string][];

/**
 * The topic of each point in plain words, so the summary states a conclusion
 * instead of repeating the points (POVO Pulse Insight Summary). Matched on the
 * pillar and the point text; the first match wins.
 */
const TOPICS: Record<Category, TopicTable> = {
  messaging: [
    [/flare|beyond managing|add up/i, 'advancing beyond flare care'],
    [/efficacy|response|improvement/i, 'the efficacy results'],
    [/pill|once daily|routine|oral treatment/i, 'once-daily oral dosing'],
    [/studied|evidence|1,200/i, 'the HS trial data'],
    [/JAK1|cytokine|inflammation|designed for HS|approach/i, 'the JAK1 approach'],
  ],
  objection: [
    [/antibiotic|steroid|flare/i, 'staying on antibiotics'],
    [/\bsevere\b|\bnot ready\b|\bwait\b|\bworse\b/i, 'when to advance treatment'],
    [/boxed warning|monitoring|safety/i, 'JAK safety and monitoring'],
    [/reserve|before a biologic|start with a biologic/i, 'using POVO before a biologic'],
    [/off-label|oral JAK I use|doing well/i, 'switching from their current oral JAK'],
    [/compare|head-to-head|IL-17|TNF|more data|long term/i, 'how POVO compares'],
    [/instead of a biologic|another biologic|injection/i, 'choosing POVO over a biologic'],
    [/dose|45 mg|75 mg/i, 'dosing'],
  ],
  closing: [
    [/comfortable|need to feel|what you need/i, 'a plan to move a patient to POVO'],
    [/identify|which patient|which of|patients in your practice|patients you described|ready to advance|could you see|comes to mind|start first/i, 'naming patients for POVO'],
    [/oral JAK|oral treatment option|oral option/i, 'POVO as their oral JAK'],
    [/before a biologic|instead of cycling|rather than cycling/i, 'POVO before another biologic'],
    [/next appropriate patient|next patient|flares again|uncontrolled/i, 'starting the next appropriate patient on POVO'],
  ],
};

export const topicOf = (category: Category, p: Pick<DeliveredPoint, 'pillar' | 'text'>): string => {
  const text = `${category === 'messaging' && p.pillar ? `${p.pillar} ` : ''}${p.text}`;
  const hit = TOPICS[category].find(([re]) => re.test(text));
  return hit ? hit[1] : I.fallbackTopic[category];
};

/** At most two distinct topics: "a and b". */
const andList = (topics: string[]): string => {
  const unique = topics.filter((t, i) => topics.indexOf(t) === i).slice(0, 2);
  return unique.length > 1 ? `${unique[0]}${I.and}${unique[1]}` : (unique[0] ?? '');
};

const isResolved = (p: DeliveredPoint): boolean => /\bResolved\b/.test(p.label);

/**
 * One conclusion per section from the last Post-Call Assessment: reception for
 * messages and closings, still open / resolved / discussed for objections.
 * `points` are the points delivered on that call; `name` is the participant.
 */
export const summaryLine = (category: Category, points: DeliveredPoint[], name: string): string => {
  if (!points.length) return I.none[category];
  const topics = (keep: (p: DeliveredPoint) => boolean) => andList(points.filter(keep).map((p) => topicOf(category, p)));
  if (category === 'objection') {
    const open = topics((p) => p.is_open);
    const res = topics((p) => !p.is_open && isResolved(p));
    const discussed = topics((p) => !p.is_open && !isResolved(p));
    if (open && res) return I.objResolvedOpen(res, open);
    if (open) return I.objOpen(open, name);
    if (res) return I.objResolved(res, name);
    return I.objDiscussed(discussed, name);
  }
  const pos = topics((p) => p.reception === 2);
  const mid = topics((p) => p.reception === 1);
  const neg = topics((p) => p.reception === 0);
  if (category === 'messaging') {
    if (pos && neg) return I.msgPosNeg(name, pos, neg);
    if (pos) return I.msgPos(name, pos, mid);
    if (mid && neg) return I.msgMidNeg(name, mid, neg);
    if (mid) return I.msgMid(name, mid);
    if (neg) return I.msgNeg(name, neg);
    return I.msgNone(name);
  }
  if (pos && neg) return I.closePosNeg(name, pos, neg);
  if (pos) return I.closePos(name, pos);
  if (mid) return I.closeMid(name, mid, neg);
  if (neg) return I.closeNeg(name, neg);
  return I.closeNone(name);
};

/** The points delivered on the most recent assessed call (the revision's source date). */
export const lastCallPoints = (delivered: DeliveredPoint[], callDate: string | null): DeliveredPoint[] =>
  callDate ? delivered.filter((p) => p.delivered_date === callDate) : [];
