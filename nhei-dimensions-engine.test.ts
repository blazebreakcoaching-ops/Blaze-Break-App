import { describe, it, expect } from 'vitest';
import {
  classifyByDimension,
  recordsAssociatedWithDimension,
  summarizeDimensionActivity,
  dimensionIsActive,
} from './nhei-dimensions-engine';
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

describe('dimensionIsActive - independent activation', () => {
  it('activates one dimension without requiring the others', () => {
    const records = [makeRecord({ id: 'a', dimensions: ['EMOTIONAL'] })];
    expect(dimensionIsActive(records, 'EMOTIONAL')).toBe(true);
    expect(dimensionIsActive(records, 'PHYSICAL')).toBe(false);
    expect(dimensionIsActive(records, 'MENTAL')).toBe(false);
    expect(dimensionIsActive(records, 'METAPHYSICAL')).toBe(false);
  });
});

describe('classifyByDimension - multiple associations, never merged', () => {
  it('keeps a multi-dimension event distinctly present in every dimension it touches', () => {
    const records = [makeRecord({ id: 'a', dimensions: ['MENTAL', 'EMOTIONAL'] })];
    const { byDimension } = classifyByDimension(records);
    expect(byDimension.MENTAL.map((r) => r.id)).toEqual(['a']);
    expect(byDimension.EMOTIONAL.map((r) => r.id)).toEqual(['a']);
    expect(byDimension.MENTAL[0]).toBe(byDimension.EMOTIONAL[0]);
  });

  it('buckets an untagged record as unclassified rather than guessing a dimension', () => {
    const records = [makeRecord({ id: 'a', dimensions: [] })];
    const { unclassified, byDimension } = classifyByDimension(records);
    expect(unclassified.map((r) => r.id)).toEqual(['a']);
    expect(Object.values(byDimension).every((bucket) => bucket.length === 0)).toBe(true);
  });

  it('handles an empty record set without error', () => {
    const { byDimension, unclassified } = classifyByDimension([]);
    expect(unclassified).toEqual([]);
    expect(Object.values(byDimension).every((bucket) => bucket.length === 0)).toBe(true);
  });
});

describe('summarizeDimensionActivity - never a diagnostic score', () => {
  it('reports plain counts and id lists only', () => {
    const records = [
      makeRecord({ id: 'a', dimensions: ['PHYSICAL'], confirmationState: 'user_confirmed', occurredAt: '2026-01-01T00:00:00Z' }),
      makeRecord({ id: 'b', dimensions: ['PHYSICAL'], confirmationState: 'user_disputed', occurredAt: '2026-01-05T00:00:00Z' }),
    ];
    const summaries = summarizeDimensionActivity(records);
    const physical = summaries.find((s) => s.dimension === 'PHYSICAL')!;
    expect(physical.evidenceCount).toBe(2);
    expect(physical.confirmedCount).toBe(1);
    expect(physical.disputedCount).toBe(1);
    expect(physical.evidenceIds).toEqual(['a', 'b']);
    expect(Object.keys(physical).sort()).toEqual(
      ['confirmedCount', 'dimension', 'disputedCount', 'earliestOccurredAt', 'evidenceCount', 'evidenceIds', 'latestOccurredAt'].sort(),
    );
  });

  it('always returns all four dimensions, even ones with zero evidence', () => {
    const summaries = summarizeDimensionActivity([]);
    expect(summaries.map((s) => s.dimension).sort()).toEqual(['EMOTIONAL', 'MENTAL', 'METAPHYSICAL', 'PHYSICAL']);
    expect(summaries.every((s) => s.evidenceCount === 0)).toBe(true);
  });
});

describe('recordsAssociatedWithDimension', () => {
  it('returns only records tagged with the requested dimension', () => {
    const records = [
      makeRecord({ id: 'a', dimensions: ['METAPHYSICAL'] }),
      makeRecord({ id: 'b', dimensions: ['PHYSICAL'] }),
    ];
    expect(recordsAssociatedWithDimension(records, 'METAPHYSICAL').map((r) => r.id)).toEqual(['a']);
  });
});
