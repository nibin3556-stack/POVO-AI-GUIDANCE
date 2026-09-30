import type { ComplianceIssue, Severity } from '../types/models';

export type ComplianceLevel = 'bad' | 'rev' | 'ok';

const LEVEL: Record<Severity, ComplianceLevel> = { high: 'bad', med: 'rev', low: 'ok' };

/** The modal label comes from the highest severity: high = Non-compliant, med = Needs review, low = Minor issue. */
export const complianceLevel = (issues: ComplianceIssue[], maxSeverity?: Severity | null): ComplianceLevel => {
  if (maxSeverity) return LEVEL[maxSeverity];
  if (issues.some((i) => i.severity === 'high')) return 'bad';
  if (issues.some((i) => i.severity === 'med')) return 'rev';
  return 'ok';
};

export const levelSeverity = (level: ComplianceLevel): Severity => (level === 'bad' ? 'high' : level === 'rev' ? 'med' : 'low');

export const severityCounts = (issues: ComplianceIssue[]): Record<Severity, number> => ({
  high: issues.filter((i) => i.severity === 'high').length,
  med: issues.filter((i) => i.severity === 'med').length,
  low: issues.filter((i) => i.severity === 'low').length,
});

export interface MarkedPart {
  text: string;
  marked: boolean;
}

/** Splits `text` so every flagged excerpt can be wrapped in <mark>. Case-insensitive, longest excerpts first. */
export const markExcerpts = (text: string, excerpts: string[]): MarkedPart[] => {
  const words = excerpts
    .flatMap((e) => e.split(/,\s*/))
    .map((w) => w.trim())
    .filter((w) => w && w.length < 80 && w !== text.trim())
    .sort((a, b) => b.length - a.length);
  if (!words.length) return [{ text, marked: false }];
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, marked: words.some((w) => w.toLowerCase() === part.toLowerCase()) }));
};

/** Splits a suggested rewrite so [placeholders] can be highlighted. */
export const splitPlaceholders = (text: string): MarkedPart[] =>
  text
    .split(/(\[[^\]]*\])/)
    .filter(Boolean)
    .map((part) => ({ text: part, marked: /^\[[^\]]*\]$/.test(part) }));

/** Position of the first [placeholder] so the input can select it. */
export const firstPlaceholderRange = (text: string): [number, number] | null => {
  const match = /\[[^\]]*\]/.exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
};

export const chipList = (issues: ComplianceIssue[]): string => issues.map((i) => i.chip).join(' · ');
