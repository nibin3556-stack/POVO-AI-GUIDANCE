/** Design tokens from the POC (spec §9). The CSS @theme in styles/index.css mirrors these. */
export const COLORS = {
  bg: '#D9E2EC',
  ink: '#0F1F33',
  ink2: '#1E3350',
  ink3: '#334155',
  blue: '#156CB4',
  blued: '#115088',
  navy: '#12406E',
  sky: '#2388D4',
  bluet: '#EAF3FB',
  bluet2: '#C7DDF0',
  line: '#C4CFDC',
  line2: '#D5DEE8',
  warn: '#B45309',
  warnb: '#F59E0B',
  warnbg: '#FEF3C7',
  warnbd: '#F0C26B',
  green: '#15803D',
  greenb: '#2FA84F',
  greenbg: '#E9F5EE',
  greenbd: '#BFE0CB',
  purple: '#6D5BD0',
  purple2: '#5A48B8',
  purplel: '#7C6BD6',
  teal: '#0E8A8A',
  red: '#DC2626',
  red2: '#B91C1C',
  white: '#FFFFFF',
} as const;

export const SHADOWS = {
  e1: '0 1px 3px rgba(16,40,80,.10)',
  e2: '0 4px 14px rgba(16,40,80,.12)',
  pop: '0 10px 28px rgba(8,22,44,.18)',
  menu: '0 14px 36px rgba(8,22,44,.22)',
  modal: '0 26px 70px rgba(8,22,44,.38)',
} as const;

/** Chart series colours. */
export const CHART_COLORS = {
  writing: '#2FA84F',
  yetToWrite: '#F2B45C',
  jak: '#156CB4',
  nonJak: '#7C6BD6',
  track: '#E6ECF3',
  grid: '#CBD5E1',
  axis: '#334155',
} as const;

export type TierCode = 'SH' | 'MED' | 'LOW';

/** Tier chip colours (background / text / border). */
export const TIER_CHIP: Record<TierCode, { bg: string; fg: string; border: string }> = {
  SH: { bg: '#C9EFC9', fg: '#1B5E20', border: '#9ED79E' },
  MED: { bg: '#F8E6A6', fg: '#7A5200', border: '#E9CE6D' },
  LOW: { bg: '#F6CDD9', fg: '#8E2447', border: '#E9A3B8' },
};

/** Tier bands behind the decile chart. */
export const TIER_BAND: Record<TierCode, { fill: string; stroke: string; text: string }> = {
  SH: { fill: '#E6F5E6', stroke: '#B9DFB9', text: '#1B5E20' },
  MED: { fill: '#FFF5D1', stroke: '#EAD58A', text: '#7A5200' },
  LOW: { fill: '#EEEAFB', stroke: '#CFC6F0', text: '#5A48B8' },
};

export type RoleType = 'HCP' | 'NP' | 'PA';

export const ROLE_COLORS: Record<RoleType, string> = {
  HCP: '#12406E',
  PA: '#5A48B8',
  NP: '#0B6B57',
};

export const RECEPTION_COLORS = ['#C2410C', '#D97706', '#15803D'] as const;
