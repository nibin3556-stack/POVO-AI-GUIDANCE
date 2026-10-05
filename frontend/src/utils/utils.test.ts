import { describe, expect, it } from 'vitest';
import { call, target } from '../test/fixtures';
import { additionalKey, anyAnswered, callToFormValues, changedInputs, countAnswered, itemKey, toInputs } from './assessment';
import { deliveredTone, isChanged, isPostCallBullet, orderParticipants, reinforceScope, revealKey, tagTone } from './callPrep';
import { chipList, complianceLevel, firstPlaceholderRange, markExcerpts, severityCounts, splitPlaceholders } from './compliance';
import { cx } from './cx';
import { formatLongDate, formatMD, formatMDY, formatNumber, formatShortMD, nameInitials, splitHcps, splitMatch, truncate } from './format';
import { receptionFromX, stepReception } from './reception';
import { stepperState } from './steps';
import { countActiveFilters, EMPTY_FILTERS, filterParams, nextRoles, nextSort, sortParam, targetFullName, toggleValue } from './targets';
import { flaggedResult, profile, reference } from '../test/fixtures';
import { buildReferenceLookup, receptionText } from './reference';

describe('format', () => {
  it('formats ISO dates', () => {
    expect(formatLongDate('2026-10-13')).toBe('October 13, 2026');
    expect(formatMDY('2026-10-13')).toBe('10/13/2026');
    expect(formatMD('2026-10-03')).toBe('10/03');
    expect(formatShortMD('2026-10-09')).toBe('10/9');
    expect(formatMDY(null)).toBe('');
  });
  it('keeps the lowercase s of HCPs', () => {
    expect(splitHcps('12 HCPS')).toEqual([{ text: '12 HCPS', lowercase: false }]);
    expect(splitHcps('3 of 5 HCPs yet')).toEqual([
      { text: '3 of 5 HCP', lowercase: false },
      { text: 's', lowercase: true },
      { text: ' yet', lowercase: false },
    ]);
  });
  it('splits matches, truncates and formats numbers', () => {
    expect(splitMatch('Dana Whitaker', 'whit')).toEqual({ before: 'Dana ', match: 'Whit', after: 'aker' });
    expect(splitMatch('Dana', 'zz')).toBeNull();
    expect(truncate('abcdefghij', 6)).toBe('abcd…');
    expect(formatNumber(1234.56)).toBe('1,234.6');
    expect(nameInitials('Winters, John')).toBe('WI');
  });
});

describe('targets', () => {
  it('builds names, labels and sort params', () => {
    expect(targetFullName(target())).toBe('Dr. Winters, John, MD');
    expect(targetFullName(target({ role_type: 'PA', display_name: 'Kristen Casey' }))).toBe('Kristen Casey, PA');
    expect(sortParam({ key: 'decile', direction: 'asc' })).toBe('decile:asc');
    expect(nextSort({ key: 'decile', direction: 'desc' }, 'decile')).toEqual({ key: 'decile', direction: 'asc' });
    expect(nextSort({ key: 'decile', direction: 'asc' }, 'hs_patients')).toEqual({ key: 'hs_patients', direction: 'desc' });
  });
  it('serialises and applies filters', () => {
    const filters = { ...EMPTY_FILTERS, focus: ['jak', 'humira'], account: ['A1'] };
    expect(filterParams(filters)).toEqual({ focus: 'jak,humira', account_id: 'A1' });
    expect(countActiveFilters(filters)).toBe(2);
    expect(toggleValue(['a'], 'a')).toEqual([]);
  });
  it('toggles roles with empty meaning all', () => {
    const roles = ['HCP', 'NP', 'PA'] as const;
    expect(nextRoles([], 'NP', roles)).toEqual(['HCP', 'PA']);
    expect(nextRoles(['HCP', 'PA'], 'NP', roles)).toEqual([]);
  });
});

describe('assessment', () => {
  const withRows = call({
    assessments: [
      { participant_id: 'H2', category: 'messaging', point_id: 'M1', point_rank: 1, point_text: 't', was_raised: true, reception: 2, note: 'ok', compliance_status: 'passed', compliance_check_id: 'K' },
      { participant_id: 'H2', category: 'additional', point_id: 'additional', point_rank: 0, point_text: '', was_raised: true, reception: null, note: 'extra', compliance_status: 'unchecked', compliance_check_id: null },
    ],
  });
  it('maps a call to form values and back', () => {
    const values = callToFormValues(withRows);
    expect(values.additional_note).toBe('extra');
    expect(values.items[itemKey('H2', 'messaging', 'M1')]?.reception).toBe(2);
    expect(toInputs(values, 'H2')).toHaveLength(2);
    expect(additionalKey('H2')).toBe('H2|additional|additional');
  });
  it('counts and diffs', () => {
    const before = callToFormValues(withRows);
    const key = itemKey('H2', 'messaging', 'M1');
    const after = { ...before, items: { ...before.items, [key]: { ...before.items[key]!, note: 'changed' } } };
    expect(changedInputs(before, after, 'H2')).toHaveLength(1);
    expect(changedInputs(before, before, 'H2')).toHaveLength(0);
    expect(countAnswered(after, 'H2')).toBe(1);
    expect(countAnswered(after, 'H2', 'closing')).toBe(0);
    expect(anyAnswered(after)).toBe(true);
  });
});

describe('callPrep and compliance', () => {
  it('maps next-call tags and delivered points to tones', () => {
    expect(tagTone('Builds on well received')).toBe('well');
    expect(tagTone('Builds on moderate')).toBe('mod');
    expect(tagTone('New')).toBe('new');
    expect(tagTone('Something else')).toBe('other');
    const point = { point_id: 'x', rank: 1, pillar: null, text: 't', detail: null, detail_label: null, tags: [], previous_text: null, previous_rank: null } as const;
    expect(isChanged({ ...point, tags: [] })).toBe(false);
    const delivered = { ...point, tags: [], delivered_date: '2026-10-13', reception: 1 as const, label: 'Moderately Received', is_open: false };
    expect(deliveredTone(delivered)).toBe('good');
    expect(deliveredTone({ ...delivered, reception: 0 })).toBe('bad');
    expect(deliveredTone({ ...delivered, reception: null, is_open: true })).toBe('bad');
    expect(reinforceScope('H2', 'closing')).toBe('H2|closing');
    expect(isPostCallBullet('Last call note (Oct 13, 2026): x')).toBe(true);
    expect(revealKey('H2', 'closing', 2)).toBe('H2|closing|2');
    expect(orderParticipants(profile.participants, ['N11', 'H2']).map((p) => p.hcp_id)).toEqual(['N11', 'H2']);
  });
  it('summarises compliance issues', () => {
    expect(complianceLevel(flaggedResult.issues, 'high')).toBe('bad');
    expect(complianceLevel([{ ...flaggedResult.issues[0]!, severity: 'low' }])).toBe('ok');
    expect(severityCounts(flaggedResult.issues)).toEqual({ high: 1, med: 0, low: 0 });
    expect(markExcerpts('well damn it', ['damn'])).toEqual([
      { text: 'well ', marked: false },
      { text: 'damn', marked: true },
      { text: ' it', marked: false },
    ]);
    expect(splitPlaceholders('a [b] c').map((p) => p.marked)).toEqual([false, true, false]);
    expect(firstPlaceholderRange('x [y]')).toEqual([2, 5]);
    expect(chipList(flaggedResult.issues)).toBe('Vulgar');
  });
});

describe('small helpers', () => {
  it('cx, reception and steps', () => {
    expect(cx('a', false, null, 'b')).toBe('a b');
    expect(receptionFromX(0, 0, 100)).toBe(0);
    expect(receptionFromX(55, 0, 100)).toBe(1);
    expect(receptionFromX(200, 0, 100)).toBe(2);
    expect(stepReception(null, 1)).toBe(1);
    expect(stepReception(2, 1)).toBe(2);
    expect(stepReception(1, -1)).toBe(0);
    expect(stepperState(['a', 'b'], 2).map((s) => s.state)).toEqual(['done', 'run']);
  });
});

describe('reference lookups', () => {
  const ref = buildReferenceLookup(reference);
  it('labels and colours codes from GET /reference', () => {
    expect(ref.tierName('SH')).toBe('Super High');
    expect(ref.tierName(null)).toBe('');
    expect(ref.focusLabel('conventional')).toBe('Conventional therapy');
    expect(ref.focusColor('humira')).toBe('#7C3AED');
    expect(ref.segmentColor('conv')).toBe('#0E8A8A');
    expect(ref.channelTeam('opz')).toBe('Opz Sales');
    expect(ref.categoryLabel('objection')).toBe('Potential Objections');
    expect(ref.roleCodes).toEqual(['HCP', 'NP', 'PA']);
  });
  it('fills the reception labels', () => {
    expect(receptionText(ref.receptionLabels, 2, 'Not rated')).toBe('Well Received');
    expect(receptionText(ref.receptionLabels, null, 'Not rated')).toBe('Not rated');
  });
});
