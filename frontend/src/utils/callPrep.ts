import type { Category, DeliveredPoint, Participant, TalkingPoint } from '../types/models';

export type TagTone = 'well' | 'mod' | 'new' | 'other';

/** Maps a next-call tag returned by the API to its colour: green, teal, soft green. */
export const tagTone = (tag: string): TagTone => {
  const t = tag.trim();
  if (t === 'Builds on well received') return 'well';
  if (t === 'Builds on moderate') return 'mod';
  if (t === 'New') return 'new';
  return 'other';
};

/** Orange = not well received or still open; green = moderately or well received, resolved or discussed. */
export const deliveredTone = (p: DeliveredPoint): 'good' | 'bad' => (p.reception === 0 || p.is_open ? 'bad' : 'good');

/** Redux key for the Reinforce choices and the post-call list of one participant × category. */
export const reinforceScope = (participantId: string, category: Category): string => `${participantId}|${category}`;

export const isChanged = (point: TalkingPoint): boolean => point.tags.length > 0;

/** participant × category × revision: the AI activity plays once per key. */
export const revealKey = (participantId: string, category: Category, revision: number): string =>
  `${participantId}|${category}|${revision}`;

export const participantHasNewActivity = (p: Participant | undefined): boolean =>
  Boolean(p?.interactions.some((i) => i.is_new));

/** The post-call history line and the last call's Additional Notes are highlighted as new. */
export const isPostCallBullet = (bullet: string): boolean => bullet.startsWith('Post-call') || bullet.startsWith('Last call note');

/** The call prep header name: "Dr. Winters, John, MD". */
export const callPrepName = (p: Participant): string => (p.role_type === 'HCP' ? `Dr. ${p.name}, ${p.degree}` : `${p.display_name}, ${p.role_type}`);

export const orderParticipants = (participants: Participant[], ids: string[]): Participant[] =>
  ids.map((id) => participants.find((p) => p.hcp_id === id)).filter((p): p is Participant => Boolean(p));
