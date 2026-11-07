import { describe, it, expect } from 'vitest';
import {
  validateExtractionCandidate,
  validateExtractionBatch,
  toNheiEvidenceRecord,
  isValidNheiExtractableSourceType,
} from './nhei-extraction-types';

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'c1', abstain: false, sourceType: 'USER_REPORTED_EVENT',
    selfSystems: ['RELATIONAL_SELF'], dimensions: [], relativeOrder: 0,
    timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [],
    ...overrides,
  };
}

describe('validateExtractionCandidate', () => {
  it('accepts a well-formed candidate', () => {
    expect(validateExtractionCandidate(candidate()).ok).toBe(true);
  });

  it('rejects a trusted/privileged sourceType - the schema cannot even express one', () => {
    expect(isValidNheiExtractableSourceType('EXTERNALLY_VERIFIED_EVENT')).toBe(false);
    expect(isValidNheiExtractableSourceType('SYSTEM_HYPOTHESIS')).toBe(false);
    expect(isValidNheiExtractableSourceType('USER_CONFIRMED_INTERPRETATION')).toBe(false);
    const result = validateExtractionCandidate(candidate({ sourceType: 'EXTERNALLY_VERIFIED_EVENT' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer or negative relativeOrder', () => {
    expect(validateExtractionCandidate(candidate({ relativeOrder: 1.5 })).ok).toBe(false);
    expect(validateExtractionCandidate(candidate({ relativeOrder: -1 })).ok).toBe(false);
  });

  it('rejects a non-boolean abstain', () => {
    expect(validateExtractionCandidate(candidate({ abstain: 'yes' })).ok).toBe(false);
  });

  it('strips any unknown field (e.g. a raw-text field a model should never emit, but might anyway)', () => {
    const result = validateExtractionCandidate(candidate({ rawQuote: 'exact words the user said' }));
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.candidate)).not.toContain('exact words the user said');
  });

  it('rejects an invalid selfSystems/dimensions value', () => {
    expect(validateExtractionCandidate(candidate({ selfSystems: ['NOT_A_SELF_SYSTEM'] })).ok).toBe(false);
    expect(validateExtractionCandidate(candidate({ dimensions: ['NOT_A_DIMENSION'] })).ok).toBe(false);
  });
});

describe('validateExtractionBatch', () => {
  it('separates valid, invalid, and abstained candidates', () => {
    const result = validateExtractionBatch([
      candidate({ candidateId: 'ok' }),
      candidate({ candidateId: 'abst', abstain: true }),
      { candidateId: 'bad' }, // missing required fields
    ]);
    expect(result.valid.map((c) => c.candidateId)).toEqual(['ok']);
    expect(result.abstained.map((c) => c.candidateId)).toEqual(['abst']);
    expect(result.invalid).toHaveLength(1);
  });

  it('bounds an oversized batch rather than accepting it in full', () => {
    const many = Array.from({ length: 50 }, (_, i) => candidate({ candidateId: `c${i}` }));
    const result = validateExtractionBatch(many);
    expect(result.valid.length).toBeLessThan(50);
    expect(result.rejectedForBatchLimit).toBeGreaterThan(0);
  });

  it('handles an empty batch', () => {
    const result = validateExtractionBatch([]);
    expect(result.valid).toEqual([]);
    expect(result.abstained).toEqual([]);
  });
});

describe('toNheiEvidenceRecord', () => {
  it('converts a valid candidate, always forcing confirmationState to not_applicable - never user_confirmed', () => {
    const result = toNheiEvidenceRecord(candidate() as any, 'batch1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.confirmationState).toBe('not_applicable');
      expect(result.record.id).toBe('extracted_batch1_c1');
      expect(result.record.reportedOrder).toBe(0);
    }
  });

  it('namespaces relatedEventIds the same way as the record id', () => {
    const result = toNheiEvidenceRecord(candidate({ relatedCandidateIds: ['c2'] }) as any, 'batch1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.relatedEventIds).toEqual(['extracted_batch1_c2']);
  });
});
