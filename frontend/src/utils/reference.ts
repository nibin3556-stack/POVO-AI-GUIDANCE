import type { Category, ChannelCode, Reception, Reference, ReferenceSegment, ReferenceTier, RoleType, TierCode } from '../types/models';

/** Neutral colour for a code the reference data does not know (never expected). */
const UNKNOWN_COLOR = '#64748B';

export interface ReferenceLookup {
  data: Reference;
  tier: (code: TierCode | null | undefined) => ReferenceTier | undefined;
  tierName: (code: TierCode | null | undefined) => string;
  segment: (code: string | null | undefined) => ReferenceSegment | undefined;
  segmentColor: (code: string, hex?: string | null) => string;
  focusLabel: (code: string) => string;
  focusColor: (code: string) => string;
  roleCodes: RoleType[];
  channelCodes: ChannelCode[];
  channelTeam: (code: ChannelCode) => string;
  categoryCodes: Category[];
  categoryLabel: (code: Category) => string;
  receptionLabels: string[];
  nextCallSteps: (noteCount: number) => string[];
}

const fillStep = (template: string, n: number): string =>
  template.replace('{n}', String(n)).replace('{notes}', n === 1 ? 'note' : 'notes');

/** Plain lookups over GET /api/v1/reference; the only source of business labels and colours. */
export const buildReferenceLookup = (data: Reference): ReferenceLookup => {
  const byCode = <T extends { code: string }>(list: T[]) => new Map(list.map((x) => [x.code, x]));
  const tiers = byCode(data.tiers);
  const segments = byCode(data.segments);
  const focus = byCode(data.competitive_focus);
  const channels = byCode(data.interaction_channels);
  const categories = byCode(data.categories);
  return {
    data,
    tier: (code) => (code ? tiers.get(code) : undefined),
    tierName: (code) => (code ? tiers.get(code)?.name ?? '' : ''),
    segment: (code) => (code ? segments.get(code) : undefined),
    segmentColor: (code, hex) => hex || segments.get(code)?.color_hex || UNKNOWN_COLOR,
    focusLabel: (code) => focus.get(code)?.label ?? code,
    focusColor: (code) => focus.get(code)?.color_hex ?? UNKNOWN_COLOR,
    roleCodes: data.role_types.map((r) => r.code),
    channelCodes: data.interaction_channels.map((c) => c.code),
    channelTeam: (code) => channels.get(code)?.team_label ?? code,
    categoryCodes: data.categories.map((c) => c.code),
    categoryLabel: (code) => categories.get(code)?.label ?? code,
    receptionLabels: data.reception_scale.map((r) => r.label),
    nextCallSteps: (n) => data.next_call_steps.map((s) => fillStep(s, n)),
  };
};

export const receptionText = (labels: string[], value: Reception | null, notRated: string): string =>
  value === null ? notRated : labels[value] ?? notRated;
