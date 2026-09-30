import { describe, expect, it } from 'vitest';
import { reference } from '../test/fixtures';
import { buildAssessmentSchema } from './assessmentSchema';

const assessmentSchema = buildAssessmentSchema(reference.limits);
import { impersonationLookupSchema } from './impersonationSchema';

const item = { participant_id: 'H2', category: 'messaging', point_id: 'M1', point_rank: 1, point_text: 't', was_raised: true, reception: 1, note: 'fine' };

describe('impersonationLookupSchema', () => {
  it('accepts names and ids of 2+ characters', async () => {
    await expect(impersonationLookupSchema.validate({ q: 'Dana' })).resolves.toEqual({ q: 'Dana' });
    await expect(impersonationLookupSchema.validate({ q: '3351' })).resolves.toBeTruthy();
  });
  it('rejects empty and 1-character queries', async () => {
    await expect(impersonationLookupSchema.validate({ q: '  ' })).rejects.toThrow('Type a name, Employee ID or Network ID');
    await expect(impersonationLookupSchema.validate({ q: 'D' })).rejects.toThrow('Type at least 2 characters');
  });
});

describe('assessmentSchema', () => {
  it('accepts valid rows and an additional note', async () => {
    await expect(assessmentSchema.validate({ items: { 'H2|messaging|M1': item }, additional_note: 'x' })).resolves.toBeTruthy();
    await expect(assessmentSchema.validate({ items: {}, additional_note: '' })).resolves.toBeTruthy();
  });
  it('limits notes to 200 and the additional note to 600 characters', async () => {
    await expect(assessmentSchema.validate({ items: { k: { ...item, note: 'a'.repeat(201) } }, additional_note: '' })).rejects.toThrow('200');
    await expect(assessmentSchema.validate({ items: {}, additional_note: 'a'.repeat(601) })).rejects.toThrow('600');
  });
  it('rejects an out-of-range reception', async () => {
    await expect(assessmentSchema.validate({ items: { k: { ...item, reception: 3 } }, additional_note: '' })).rejects.toThrow();
  });
});
