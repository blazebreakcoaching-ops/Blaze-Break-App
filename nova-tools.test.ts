import { describe, it, expect } from 'vitest';
import {
  memoryToolIsAllowed,
  searchMemories,
  isValidRecoveryDuration,
  isValidMemoryType,
  NovaMemoryDoc,
  NovaPermissions,
} from './nova-tools';

// This tool reads real, actively-written Nova memories
// (users/{uid}/nova_memories, in nova-brain.ts's real schema). These
// tests exist to catch a regression in the consent gate specifically -
// the highest-consequence failure mode is this tool surfacing memory
// data the user never consented to Nova using in the first place.

const fullPerms: NovaPermissions = {
  allowNovaMemory: true,
  allowNovaUseSavedMemories: true,
};

const baseMemory = (overrides: Partial<NovaMemoryDoc> = {}): NovaMemoryDoc => ({
  type: 'preference',
  content: 'Wants to leave the office by 6pm on Fridays',
  source: 'Boundary Rehearsal',
  confidence: 'medium',
  canEdit: true,
  ...overrides,
});

describe('memoryToolIsAllowed: consent gate', () => {
  it('rejects when perms is undefined', () => {
    expect(memoryToolIsAllowed(undefined)).toBe(false);
  });

  it('rejects when perms is null', () => {
    expect(memoryToolIsAllowed(null)).toBe(false);
  });

  it('rejects when allowNovaMemory is false', () => {
    expect(memoryToolIsAllowed({ ...fullPerms, allowNovaMemory: false })).toBe(false);
  });

  it('rejects when allowNovaUseSavedMemories is false', () => {
    expect(memoryToolIsAllowed({ ...fullPerms, allowNovaUseSavedMemories: false })).toBe(false);
  });

  it('rejects when both flags are simply absent', () => {
    expect(memoryToolIsAllowed({})).toBe(false);
  });

  it('accepts when both flags are true', () => {
    expect(memoryToolIsAllowed(fullPerms)).toBe(true);
  });
});

describe('searchMemories: the actual tool result the model sees', () => {
  it('returns no results when the consent gate is off, even with matching memories present', () => {
    const memories = [baseMemory()];
    const results = searchMemories({ ...fullPerms, allowNovaMemory: false }, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('is case-insensitive when matching the query against memory content', () => {
    const memories = [baseMemory({ content: 'Prefers FRIDAY afternoons for recovery blocks' })];
    const results = searchMemories(fullPerms, memories, 'friday');
    expect(results.length).toBe(1);
  });

  it('returns no results when the query does not match any memory content', () => {
    const memories = [baseMemory()];
    const results = searchMemories(fullPerms, memories, 'something unrelated entirely');
    expect(results).toEqual([]);
  });

  it('returns no results for an empty or whitespace-only query, rather than dumping every memory', () => {
    const memories = [baseMemory(), baseMemory({ content: 'Something else entirely' })];
    expect(searchMemories(fullPerms, memories, '')).toEqual([]);
    expect(searchMemories(fullPerms, memories, '   ')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const memories = Array.from({ length: 20 }, (_, i) => baseMemory({ content: `Friday note number ${i}` }));
    const results = searchMemories(fullPerms, memories, 'Friday', 3);
    expect(results.length).toBe(3);
  });

  it('formats results with the memory type as a prefix', () => {
    const memories = [baseMemory({ type: 'trigger', content: 'Gets tired around 3pm' })];
    const results = searchMemories(fullPerms, memories, 'tired');
    expect(results[0]).toBe('[trigger] Gets tired around 3pm');
  });

  it('handles an empty memories array without throwing', () => {
    expect(searchMemories(fullPerms, [], 'anything')).toEqual([]);
  });

  it('handles undefined perms without throwing', () => {
    expect(searchMemories(undefined, [baseMemory()], 'Friday')).toEqual([]);
  });

  it('skips a malformed memory document (missing content) rather than throwing', () => {
    const memories = [{ type: 'preference' } as NovaMemoryDoc, baseMemory()];
    expect(() => searchMemories(fullPerms, memories, 'Friday')).not.toThrow();
  });
});

describe('isValidRecoveryDuration: guards against a hallucinated duration reaching the UI as if it were real', () => {
  it('accepts every value actually present in the app catalog', () => {
    expect(isValidRecoveryDuration('30s')).toBe(true);
    expect(isValidRecoveryDuration('2m')).toBe(true);
    expect(isValidRecoveryDuration('5m')).toBe(true);
    expect(isValidRecoveryDuration('10m')).toBe(true);
    expect(isValidRecoveryDuration('20m')).toBe(true);
  });

  it('rejects a plausible-looking but nonexistent duration', () => {
    expect(isValidRecoveryDuration('15m')).toBe(false);
    expect(isValidRecoveryDuration('1m')).toBe(false);
    expect(isValidRecoveryDuration('30m')).toBe(false);
  });

  it('rejects non-string input rather than throwing', () => {
    expect(isValidRecoveryDuration(30)).toBe(false);
    expect(isValidRecoveryDuration(null)).toBe(false);
    expect(isValidRecoveryDuration(undefined)).toBe(false);
    expect(isValidRecoveryDuration({})).toBe(false);
  });

  it('is case-sensitive - the catalog keys are lowercase', () => {
    expect(isValidRecoveryDuration('2M')).toBe(false);
    expect(isValidRecoveryDuration('20M')).toBe(false);
  });
});

describe('isValidMemoryType: guards against a hallucinated memory category being persisted as if it were real', () => {
  it('accepts every value nova-brain.ts actually writes', () => {
    expect(isValidMemoryType('profile')).toBe(true);
    expect(isValidMemoryType('trigger')).toBe(true);
    expect(isValidMemoryType('state')).toBe(true);
    expect(isValidMemoryType('rule')).toBe(true);
    expect(isValidMemoryType('preference')).toBe(true);
  });

  it('rejects a plausible-looking but nonexistent type', () => {
    expect(isValidMemoryType('goal')).toBe(false);
    expect(isValidMemoryType('habit')).toBe(false);
  });

  it('rejects non-string input rather than throwing', () => {
    expect(isValidMemoryType(1)).toBe(false);
    expect(isValidMemoryType(null)).toBe(false);
    expect(isValidMemoryType(undefined)).toBe(false);
  });
});
