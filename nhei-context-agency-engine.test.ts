import { describe, it, expect } from 'vitest';
import { summariseAvailableEvidence, MIN_RECORDS_FOR_CONTEXT_SUMMARY } from './nhei-context-agency-engine';
import { type NheiEvidenceRecord } from './nhei-types';

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

describe('summariseAvailableEvidence - descriptive only, never a verdict', () => {
  it('flags insufficient evidence below the minimum record count', () => {
    const records = Array.from({ length: MIN_RECORDS_FOR_CONTEXT_SUMMARY - 1 }, (_, i) => makeRecord({ id: `e${i}` }));
    const summary = summariseAvailableEvidence(records);
    expect(summary.insufficientEvidence).toBe(true);
  });

  it('does not flag insufficient evidence at or above the minimum', () => {
    const records = Array.from({ length: MIN_RECORDS_FOR_CONTEXT_SUMMARY }, (_, i) => makeRecord({ id: `e${i}` }));
    const summary = summariseAvailableEvidence(records);
    expect(summary.insufficientEvidence).toBe(false);
  });

  it('counts confirmation states correctly', () => {
    const records = [
      makeRecord({ id: 'a', confirmationState: 'user_confirmed' }),
      makeRecord({ id: 'b', confirmationState: 'user_disputed' }),
      makeRecord({ id: 'c', confirmationState: 'unconfirmed' }),
      makeRecord({ id: 'd', confirmationState: 'not_applicable' }),
    ];
    const summary = summariseAvailableEvidence(records);
    expect(summary.confirmedCount).toBe(1);
    expect(summary.disputedCount).toBe(1);
    expect(summary.unconfirmedCount).toBe(1);
    expect(summary.totalEvidenceCount).toBe(4);
  });

  it('never produces a bandwidth/capacity verdict field of any kind', () => {
    const summary = summariseAvailableEvidence([makeRecord({ id: 'a' })]);
    expect(Object.keys(summary)).not.toContain('bandwidth');
    expect(Object.keys(summary)).not.toContain('score');
    expect(Object.keys(summary)).not.toContain('assessment');
    expect(Object.keys(summary).sort()).toEqual(
      [
        'bySelfSystem', 'bySourceType', 'byDimension', 'confirmedCount',
        'disputedCount', 'insufficientEvidence', 'totalEvidenceCount', 'unconfirmedCount',
      ].sort(),
    );
  });

  it('handles an empty record set', () => {
    const summary = summariseAvailableEvidence([]);
    expect(summary.insufficientEvidence).toBe(true);
    expect(summary.totalEvidenceCount).toBe(0);
  });
});
