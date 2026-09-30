import type { Category, Participant, TalkingPoint } from '../types/models';

export type TagTone = 'new' | 'upd' | 'open' | 'res' | 'mv' | 'nai' | 'rwk';

/** Maps a revision tag returned by the API to the POC tag colour. */
export const tagTone = (tag: string): TagTone => {
  const t = tag.trim();
  if (t.startsWith('Retained') || t.startsWith('Resolved')) return 'res';
  if (t.startsWith('Changed')) return 'upd';
  if (t.startsWith('Still open')) return 'open';
  if (t.startsWith('Reordered') || t.startsWith('▲') || t.startsWith('▼')) return 'mv';
  if (t.startsWith('Removed')) return 'rwk';
  if (t === 'New') return 'new';
  return 'nai';
};

export const replacesRemoved = (point: TalkingPoint): boolean => point.tags.some((t) => t.startsWith('New ·'));

/** Old text is shown struck through for messaging and closings, never for objections. */
export const showsPreviousText = (point: TalkingPoint, category: Category): boolean =>
  category !== 'objection' && Boolean(point.previous_text);

export const isChanged = (point: TalkingPoint): boolean => point.tags.length > 0;

/** participant × category × revision: the AI activity plays once per key. */
export const revealKey = (participantId: string, category: Category, revision: number): string =>
  `${participantId}|${category}|${revision}`;

export const participantHasNewActivity = (p: Participant | undefined): boolean =>
  Boolean(p?.interactions.some((i) => i.is_new));

export const isPostCallBullet = (bullet: string): boolean => bullet.startsWith('Post-call');

/** The call prep header name: "Dr. Winters, John, MD". */
export const callPrepName = (p: Participant): string => (p.role_type === 'HCP' ? `Dr. ${p.name}, ${p.degree}` : `${p.display_name}, ${p.role_type}`);

export const orderParticipants = (participants: Participant[], ids: string[]): Participant[] =>
  ids.map((id) => participants.find((p) => p.hcp_id === id)).filter((p): p is Participant => Boolean(p));
