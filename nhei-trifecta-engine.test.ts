import { describe, it, expect } from 'vitest';
import {
  classifyBySelfSystem,
  recordsAssociatedWithSelfSystem,
  summarizeSelfSystemActivity,
  selfSystemIsActive,
} from './nhei-trifecta-engine';
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

describe('selfSystemIsActive - independent activation', () => {
  it('reports a self-system active even when no other self-system has any evidence at all', () => {
    const records = [makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'] })];
    expect(selfSystemIsActive(records, 'INTERNAL_SELF')).toBe(true);
    expect(selfSystemIsActive(records, 'RELATIONAL_SELF')).toBe(false);
    expect(selfSystemIsActive(records, 'PERCEIVED_RECEIVED_SELF')).toBe(false);
  });

  it('each self-system activates independently of the others being tagged on the same record', () => {
    const records = [
      makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'] }),
      makeRecord({ id: 'b', selfSystems: ['RELATIONAL_SELF'] }),
    ];
    expect(selfSystemIsActive(records, 'INTERNAL_SELF')).toBe(true);
    expect(selfSystemIsActive(records, 'RELATIONAL_SELF')).toBe(true);
    expect(selfSystemIsActive(records, 'PERCEIVED_RECEIVED_SELF')).toBe(false);
  });
});

describe('classifyBySelfSystem - multiple associations, never merged', () => {
  it('keeps a multi-tagged experience distinctly present in every self-system it touches', () => {
    const records = [makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF'] })];
    const { bySelfSystem } = classifyBySelfSystem(records);
    expect(bySelfSystem.INTERNAL_SELF.map((r) => r.id)).toEqual(['a']);
    expect(bySelfSystem.PERCEIVED_RECEIVED_SELF.map((r) => r.id)).toEqual(['a']);
    // Not merged into one combined label - the same record object appears
    // whole in both buckets, nothing about it is altered or summarised away.
    expect(bySelfSystem.INTERNAL_SELF[0]).toBe(bySelfSystem.PERCEIVED_RECEIVED_SELF[0]);
  });

  it('does not treat the three self-systems as mutually exclusive', () => {
    const records = [
      makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'] }),
      makeRecord({ id: 'b', selfSystems: ['RELATIONAL_SELF'] }),
      makeRecord({ id: 'c', selfSystems: ['PERCEIVED_RECEIVED_SELF'] }),
      makeRecord({ id: 'd', selfSystems: ['INTERNAL_SELF', 'RELATIONAL_SELF', 'PERCEIVED_RECEIVED_SELF'] }),
    ];
    const { bySelfSystem } = classifyBySelfSystem(records);
    expect(bySelfSystem.INTERNAL_SELF.map((r) => r.id)).toEqual(['a', 'd']);
    expect(bySelfSystem.RELATIONAL_SELF.map((r) => r.id)).toEqual(['b', 'd']);
    expect(bySelfSystem.PERCEIVED_RECEIVED_SELF.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('buckets an untagged record as unclassified rather than guessing a self-system', () => {
    const records = [makeRecord({ id: 'a', selfSystems: [] })];
    const { unclassified, bySelfSystem } = classifyBySelfSystem(records);
    expect(unclassified.map((r) => r.id)).toEqual(['a']);
    expect(Object.values(bySelfSystem).every((bucket) => bucket.length === 0)).toBe(true);
  });

  it('handles an empty record set without error', () => {
    const { bySelfSystem, unclassified } = classifyBySelfSystem([]);
    expect(unclassified).toEqual([]);
    expect(Object.values(bySelfSystem).every((bucket) => bucket.length === 0)).toBe(true);
  });
});

describe('summarizeSelfSystemActivity - never a score or personality verdict', () => {
  it('reports plain counts and id lists only, never a percentage or dominant-type label', () => {
    const records = [
      makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'], confirmationState: 'user_confirmed', occurredAt: '2026-01-01T00:00:00Z' }),
      makeRecord({ id: 'b', selfSystems: ['INTERNAL_SELF'], confirmationState: 'user_disputed', occurredAt: '2026-01-03T00:00:00Z' }),
    ];
    const summaries = summarizeSelfSystemActivity(records);
    const internal = summaries.find((s) => s.selfSystem === 'INTERNAL_SELF')!;
    expect(internal.evidenceCount).toBe(2);
    expect(internal.confirmedCount).toBe(1);
    expect(internal.disputedCount).toBe(1);
    expect(internal.earliestOccurredAt).toBe('2026-01-01T00:00:00Z');
    expect(internal.latestOccurredAt).toBe('2026-01-03T00:00:00Z');
    expect(internal.evidenceIds).toEqual(['a', 'b']);
    // The summary object is limited to exactly these descriptive fields -
    // no score, no percentage, no "dominant self" field exists at all.
    expect(Object.keys(internal).sort()).toEqual(
      ['confirmedCount', 'disputedCount', 'earliestOccurredAt', 'evidenceCount', 'evidenceIds', 'latestOccurredAt', 'selfSystem'].sort(),
    );
  });

  it('always returns all three self-systems, even ones with zero evidence', () => {
    const summaries = summarizeSelfSystemActivity([]);
    expect(summaries.map((s) => s.selfSystem).sort()).toEqual(['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF', 'RELATIONAL_SELF']);
    expect(summaries.every((s) => s.evidenceCount === 0)).toBe(true);
  });
});

describe('recordsAssociatedWithSelfSystem', () => {
  it('returns only records tagged with the requested self-system', () => {
    const records = [
      makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'] }),
      makeRecord({ id: 'b', selfSystems: ['RELATIONAL_SELF'] }),
    ];
    expect(recordsAssociatedWithSelfSystem(records, 'INTERNAL_SELF').map((r) => r.id)).toEqual(['a']);
  });
});
