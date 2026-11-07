import { describe, it, expect } from 'vitest';
import {
  validateEvidenceRecord,
  validateEvidenceRecords,
  excludeDisputedInterpretations,
  bucketByTag,
  isValidSelfSystem,
  isValidDimension,
  isValidEvidenceSourceType,
  isValidTemporalRelationType,
  type NheiEvidenceRecord,
  type SelfSystem,
  SELF_SYSTEMS,
} from './nhei-types';

const validInput = {
  id: 'ev1',
  sourceType: 'USER_REPORTED_EVENT',
  timeUncertainty: 'unknown',
  evidenceQuality: 'medium',
  confirmationState: 'not_applicable',
  selfSystems: [],
  dimensions: [],
};

describe('validateEvidenceRecord', () => {
  it('accepts a minimal, well-formed record', () => {
    const result = validateEvidenceRecord(validInput);
    expect(result.ok).toBe(true);
    expect(result.record?.id).toBe('ev1');
    expect(result.errors).toEqual([]);
  });

  it('rejects non-object input rather than throwing', () => {
    expect(validateEvidenceRecord(null).ok).toBe(false);
    expect(validateEvidenceRecord('a string').ok).toBe(false);
    expect(validateEvidenceRecord(42).ok).toBe(false);
    expect(validateEvidenceRecord(undefined).ok).toBe(false);
  });

  it('rejects an invalid sourceType rather than coercing it to a guess', () => {
    const result = validateEvidenceRecord({ ...validInput, sourceType: 'MADE_UP_TYPE' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('sourceType'))).toBe(true);
  });

  it('rejects an invalid selfSystems entry', () => {
    const result = validateEvidenceRecord({ ...validInput, selfSystems: ['NOT_A_REAL_SELF'] });
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed occurredAt rather than silently dropping it', () => {
    const result = validateEvidenceRecord({ ...validInput, occurredAt: 'not-a-date' });
    expect(result.ok).toBe(false);
  });

  it('accepts multiple simultaneous self-system and dimension tags on one record', () => {
    const result = validateEvidenceRecord({
      ...validInput,
      selfSystems: ['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF'],
      dimensions: ['EMOTIONAL', 'MENTAL'],
    });
    expect(result.ok).toBe(true);
    expect(result.record?.selfSystems).toEqual(['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF']);
    expect(result.record?.dimensions).toEqual(['EMOTIONAL', 'MENTAL']);
  });

  it('strips any field outside the known contract rather than carrying it through', () => {
    const sneaky = { ...validInput, debugRawContent: 'I feel like a failure because of my brother' };
    const result = validateEvidenceRecord(sneaky);
    expect(result.ok).toBe(true);
    expect(Object.keys(result.record as object)).not.toContain('debugRawContent');
    expect(JSON.stringify(result.record)).not.toContain('I feel like a failure');
  });

  it('requires EXTERNALLY_VERIFIED_EVENT to not be left unconfirmed', () => {
    const result = validateEvidenceRecord({
      ...validInput,
      sourceType: 'EXTERNALLY_VERIFIED_EVENT',
      confirmationState: 'unconfirmed',
    });
    expect(result.ok).toBe(false);
  });

  it('accepts EXTERNALLY_VERIFIED_EVENT with a confirmed/not_applicable state', () => {
    const result = validateEvidenceRecord({
      ...validInput,
      sourceType: 'EXTERNALLY_VERIFIED_EVENT',
      confirmationState: 'not_applicable',
    });
    expect(result.ok).toBe(true);
  });
});

describe('validateEvidenceRecords (batch)', () => {
  it('partitions valid and invalid records independently', () => {
    const { valid, invalid } = validateEvidenceRecords([validInput, { bogus: true }, { ...validInput, id: 'ev2' }]);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(1);
  });

  it('handles an empty input array without error', () => {
    const { valid, invalid } = validateEvidenceRecords([]);
    expect(valid).toEqual([]);
    expect(invalid).toEqual([]);
  });
});

describe('type guards', () => {
  it('reject unknown/invalid enum values', () => {
    expect(isValidSelfSystem('MADE_UP')).toBe(false);
    expect(isValidDimension('MADE_UP')).toBe(false);
    expect(isValidEvidenceSourceType('MADE_UP')).toBe(false);
    expect(isValidTemporalRelationType('CORRELATION')).toBe(false); // deliberately not a valid value
    expect(isValidTemporalRelationType('MADE_UP')).toBe(false);
  });

  it('accept every real enum value', () => {
    expect(isValidSelfSystem('INTERNAL_SELF')).toBe(true);
    expect(isValidDimension('PHYSICAL')).toBe(true);
    expect(isValidEvidenceSourceType('SYSTEM_HYPOTHESIS')).toBe(true);
    expect(isValidTemporalRelationType('SEQUENCE')).toBe(true);
  });
});

function makeRecord(overrides: Partial<NheiEvidenceRecord>): NheiEvidenceRecord {
  return {
    id: 'ev1',
    sourceType: 'USER_REPORTED_EVENT',
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: [],
    dimensions: [],
    relatedEventIds: [],
    ...overrides,
  };
}

describe('excludeDisputedInterpretations', () => {
  it('removes only records the user has disputed', () => {
    const records = [
      makeRecord({ id: 'a', confirmationState: 'user_confirmed' }),
      makeRecord({ id: 'b', confirmationState: 'user_disputed' }),
      makeRecord({ id: 'c', confirmationState: 'unconfirmed' }),
    ];
    const result = excludeDisputedInterpretations(records);
    expect(result.map((r) => r.id)).toEqual(['a', 'c']);
  });
});

describe('bucketByTag', () => {
  it('places a multi-tagged record into every matching bucket, unmerged', () => {
    const records = [makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF', 'RELATIONAL_SELF'] })];
    const { buckets, unclassified } = bucketByTag<SelfSystem>(records, (r) => r.selfSystems, SELF_SYSTEMS);
    expect(buckets.INTERNAL_SELF.map((r) => r.id)).toEqual(['a']);
    expect(buckets.RELATIONAL_SELF.map((r) => r.id)).toEqual(['a']);
    expect(buckets.PERCEIVED_RECEIVED_SELF).toEqual([]);
    expect(unclassified).toEqual([]);
  });

  it('places an untagged record into unclassified rather than any bucket', () => {
    const records = [makeRecord({ id: 'a', selfSystems: [] })];
    const { buckets, unclassified } = bucketByTag<SelfSystem>(records, (r) => r.selfSystems, SELF_SYSTEMS);
    expect(SELF_SYSTEMS.every((s) => buckets[s].length === 0)).toBe(true);
    expect(unclassified.map((r) => r.id)).toEqual(['a']);
  });
});
