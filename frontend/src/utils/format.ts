import dayjs from 'dayjs';

const ISO = 'YYYY-MM-DD';

const parse = (iso: string) => dayjs(iso, ISO);

const isValidIso = (iso: string | null | undefined): iso is string => Boolean(iso) && parse(iso as string).isValid();

/** "October 13, 2026" */
export const formatLongDate = (iso: string | null | undefined): string =>
  isValidIso(iso) ? parse(iso).format('MMMM D, YYYY') : '';

/** "10/13/2026" */
export const formatMDY = (iso: string | null | undefined): string => (isValidIso(iso) ? parse(iso).format('MM/DD/YYYY') : '');

/** "10/13" */
export const formatMD = (iso: string | null | undefined): string => (isValidIso(iso) ? parse(iso).format('MM/DD') : '');

/** "10/9" (no zero padding, the weekly axis tick). */
export const formatShortMD = (iso: string | null | undefined): string => (isValidIso(iso) ? parse(iso).format('M/D') : '');

export const formatYear = (iso: string | null | undefined): string => (isValidIso(iso) ? parse(iso).format('YYYY') : '');

/** "Oct 13" */
export const formatMonthDay = (iso: string | null | undefined): string => (isValidIso(iso) ? parse(iso).format('MMM D') : '');

/** Thousands separators, at most one decimal. */
export const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
};

export const formatPct = (value: number | null | undefined): string => `${Math.round(value ?? 0)}%`;

export const truncate = (text: string, max: number): string => {
  const value = text.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 2).trimEnd()}…`;
};

export interface TextSegment {
  text: string;
  lowercase: boolean;
}

/**
 * Copy rule: "HCPs" always keeps a lowercase "s", even inside labels styled in
 * all caps. Splits the text so the "s" can be rendered with `normal-case`.
 */
export const splitHcps = (text: string): TextSegment[] => {
  const parts = text.split('HCPs');
  const out: TextSegment[] = [];
  parts.forEach((part, index) => {
    const isLast = index === parts.length - 1;
    const head = isLast ? part : `${part}HCP`;
    if (head) out.push({ text: head, lowercase: false });
    if (!isLast) out.push({ text: 's', lowercase: true });
  });
  return out;
};

/** Case-insensitive split of `text` around the first occurrence of `query`, for <mark> highlighting. */
export const splitMatch = (text: string, query: string): { before: string; match: string; after: string } | null => {
  const q = query.trim();
  if (!q) return null;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return null;
  return { before: text.slice(0, index), match: text.slice(index, index + q.length), after: text.slice(index + q.length) };
};

/** First two letters of a "Last, First" name, for the call prep avatar. */
export const nameInitials = (name: string): string => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

export const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
