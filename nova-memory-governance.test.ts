import { describe, it, expect } from 'vitest';
import {
  NOVA_MEMORY_DATA_ZONE, deriveCanonicalKey, evidenceStateLabel, summarizeMemoryHealth, MemoryHealthEntry,
} from './nova-memory-governance';

describe('deriveCanonicalKey', () => {
  it('matches the exact source::type pairing updateNovaMemoryBySourceAndType dedups on', () => {
    expect(deriveCanonicalKey('Onboarding', 'profile')).toBe('Onboarding::profile');
  });

  it('is stable and order-sensitive - source and type are not interchangeable', () => {
    expect(deriveCanonicalKey('A', 'B')).not.toBe(deriveCanonicalKey('B', 'A'));
  });
});

describe('evidenceStateLabel', () => {
  it('maps every real stored confidence value to a label', () => {
    expect(evidenceStateLabel('low')).toBe('Observed Once');
    expect(evidenceStateLabel('medium')).toBe('Repeated');
    expect(evidenceStateLabel('high')).toBe('Behaviourally Supported');
    expect(evidenceStateLabel('verified')).toBe('System Verified');
  });

  it('never throws or invents a label for an unrecognised value', () => {
    expect(evidenceStateLabel('made_up')).toBe('Unknown');
    expect(evidenceStateLabel(null)).toBe('Unknown');
    expect(evidenceStateLabel(undefined)).toBe('Unknown');
  });
});

describe('NOVA_MEMORY_DATA_ZONE', () => {
  it('is the one real data zone every Nova memory belongs to', () => {
    expect(NOVA_MEMORY_DATA_ZONE).toBe('private_recovery_vault');
  });
});

describe('summarizeMemoryHealth', () => {
  const entry = (overrides: Partial<MemoryHealthEntry>): MemoryHealthEntry => ({
    ownerUid: 'uid_1', type: 'profile', confidence: 'high', canonicalKey: 'source::profile', ...overrides,
  });

  it('counts totals, users, and breakdowns correctly', () => {
    const summary = summarizeMemoryHealth([
      entry({ ownerUid: 'uid_1' }),
      entry({ ownerUid: 'uid_2', type: 'state', confidence: 'verified' }),
    ]);
    expect(summary.totalMemories).toBe(2);
    expect(summary.usersScanned).toBe(2);
    expect(summary.byType).toEqual({ profile: 1, state: 1 });
    expect(summary.byConfidence).toEqual({ high: 1, verified: 1 });
  });

  it('flags a real duplicate: two memories, same owner, same canonical key', () => {
    const summary = summarizeMemoryHealth([
      entry({ ownerUid: 'uid_1', canonicalKey: 'Onboarding::profile' }),
      entry({ ownerUid: 'uid_1', canonicalKey: 'Onboarding::profile' }),
    ]);
    expect(summary.duplicateCandidateGroups).toBe(1);
    expect(summary.duplicateCandidateMemories).toBe(2);
  });

  it('does NOT flag the same canonical key across two different users as a duplicate', () => {
    const summary = summarizeMemoryHealth([
      entry({ ownerUid: 'uid_1', canonicalKey: 'Onboarding::profile' }),
      entry({ ownerUid: 'uid_2', canonicalKey: 'Onboarding::profile' }),
    ]);
    expect(summary.duplicateCandidateGroups).toBe(0);
    expect(summary.duplicateCandidateMemories).toBe(0);
  });

  it('counts freeform memories with no canonical key honestly, not as zero duplicates', () => {
    const summary = summarizeMemoryHealth([
      entry({ canonicalKey: null }),
      entry({ canonicalKey: null }),
    ]);
    expect(summary.memoriesWithoutCanonicalKey).toBe(2);
    expect(summary.duplicateCandidateGroups).toBe(0);
  });

  it('treats a missing confidence as "unknown" rather than throwing', () => {
    const summary = summarizeMemoryHealth([entry({ confidence: null })]);
    expect(summary.byConfidence.unknown).toBe(1);
  });

  it('handles an empty input without error', () => {
    expect(summarizeMemoryHealth([])).toEqual({
      totalMemories: 0, usersScanned: 0, byType: {}, byConfidence: {},
      duplicateCandidateGroups: 0, duplicateCandidateMemories: 0, memoriesWithoutCanonicalKey: 0,
    });
  });
});
