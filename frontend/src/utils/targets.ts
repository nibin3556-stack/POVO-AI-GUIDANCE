import { FOCUS_COLORS, SEGMENT_COLORS } from '../constants/colors';
import type { Account, Facet, FilterGroup, RoleType, Participant, Target, TargetFilters, TargetSort, TierCode } from '../types/models';

export const TIER_NAMES: Record<TierCode, string> = { SH: 'Super High', MED: 'Medium', LOW: 'Low' };

export const tierName = (code: TierCode | null | undefined): string => (code ? TIER_NAMES[code] : '');

/** "Dr. Winters, John, MD" for a physician, "Kristen Casey, PA" for an NP or PA. */
export const targetFullName = (t: Pick<Target, 'role_type' | 'name' | 'display_name' | 'degree'>): string =>
  t.role_type === 'HCP' ? `Dr. ${t.name}, ${t.degree}` : `${t.display_name}, ${t.role_type}`;

export const participantFullName = (p: Participant): string => targetFullName(p);

export const focusColor = (code: string, facets?: Facet[]): string => {
  const fromFacet = facets?.find((f) => f.code === code)?.color_hex;
  return fromFacet ?? FOCUS_COLORS[code.toLowerCase()] ?? '#64748B';
};

export const focusLabel = (code: string, facets?: Facet[]): string => {
  const fromFacet = facets?.find((f) => f.code === code)?.label;
  if (fromFacet) return fromFacet;
  if (code.toLowerCase() === 'conventional') return 'Conventional therapy';
  if (code.toLowerCase() === 'jak') return 'JAK';
  return code.charAt(0).toUpperCase() + code.slice(1);
};

export const segmentColor = (code: string, hex?: string | null): string => hex || SEGMENT_COLORS[code] || '#156CB4';

export const EMPTY_FILTERS: TargetFilters = { focus: [], segment: [], tier: [], account: [], role: [] };

export const countActiveFilters = (filters: TargetFilters, groups: FilterGroup[] = ['focus', 'segment', 'tier', 'account']): number =>
  groups.filter((g) => filters[g].length > 0).length;

export const toggleValue = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export const sortParam = (sort: TargetSort): string => `${sort.key}:${sort.direction}`;

export const nextSort = (current: TargetSort, key: TargetSort['key']): TargetSort =>
  current.key === key
    ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
    : { key, direction: 'desc' };

/** Serialises filters for the query string: comma-separated lists, empty groups omitted. */
export const filterParams = (filters: TargetFilters): Record<string, string> => {
  const out: Record<string, string> = {};
  (Object.keys(filters) as FilterGroup[]).forEach((group) => {
    if (filters[group].length) out[group === 'account' ? 'account_id' : group] = filters[group].join(',');
  });
  return out;
};

/** Client-side filter used for account sub-tables (in-plan targets that pass the active filters). */
export const passesFilters = (t: Target, filters: TargetFilters): boolean => {
  const has = (group: FilterGroup, value: string | null) => !filters[group].length || (value !== null && filters[group].includes(value));
  return (
    t.is_in_call_plan &&
    has('focus', t.competitive_focus) &&
    has('segment', t.segment_code) &&
    has('tier', t.tier_code) &&
    has('account', t.account_id) &&
    has('role', t.role_type)
  );
};

export const ROLE_TYPES: RoleType[] = ['HCP', 'NP', 'PA'];

/** Empty list = every role shown. Returns the next "shown roles" list after toggling one role. */
export const nextRoles = (current: string[], role: string): string[] => {
  const shown = current.length ? current : ROLE_TYPES;
  const next = shown.includes(role) ? shown.filter((r) => r !== role) : [...shown, role];
  return next.length === ROLE_TYPES.length ? [] : next;
};


/** Accounts are few per territory: fetched once, filtered by account and main focus on the client. */
export const filterAccounts = (accounts: Account[], filters: TargetFilters): Account[] =>
  accounts.filter(
    (a) => (!filters.account.length || filters.account.includes(a.account_id)) && (!filters.focus.length || filters.focus.includes(a.main_focus)),
  );

