import { describe, it, expect } from 'vitest';
import { memoryToolIsAllowed, allowedMemoryCategories, searchMemories, NovaMemoryDoc, NovaPermissions } from './nova-tools';

// This tool reads the same sensitive, permission-gated data
// (users/{uid}/nova_memories) that the app's own passive context
// injection is carefully consent-gated around. These tests exist to
// catch a regression in that gate specifically - the highest-consequence
// failure mode is this tool surfacing a memory the user never consented
// to Nova using in the first place.

const fullPerms: NovaPermissions = {
  allowNovaMemory: true,
  allowNovaUseSavedMemories: true,
  allowNovaRememberCoachingPreferences: true,
  allowNovaRememberRecoveryPatterns: true,
  allowNovaRememberGoals: true,
};

const baseMemory = (overrides: Partial<NovaMemoryDoc> = {}): NovaMemoryDoc => ({
  memoryType: 'user_goal',
  memoryText: 'Wants to leave the office by 6pm on Fridays',
  userApproved: true,
  reviewStatus: 'active',
  expiresAt: null,
  revoked: false,
  ...overrides,
});

describe('memoryToolIsAllowed: top-level consent gate', () => {
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

  it('accepts when both top-level flags are true', () => {
    expect(memoryToolIsAllowed(fullPerms)).toBe(true);
  });
});

describe('allowedMemoryCategories: sub-permission mapping', () => {
  it('returns no categories when no sub-permission is granted', () => {
    expect(allowedMemoryCategories({ allowNovaMemory: true, allowNovaUseSavedMemories: true })).toEqual([]);
  });

  it('includes goal categories only when that specific sub-permission is granted', () => {
    const cats = allowedMemoryCategories({ ...fullPerms, allowNovaRememberCoachingPreferences: false, allowNovaRememberRecoveryPatterns: false });
    expect(cats).toContain('user_goal');
    expect(cats).not.toContain('coaching_preference');
    expect(cats).not.toContain('recovery_preference');
  });

  it('includes all three category groups when all three sub-permissions are granted', () => {
    const cats = allowedMemoryCategories(fullPerms);
    expect(cats).toEqual(expect.arrayContaining([
      'coaching_preference', 'module_preference', 'privacy_preference',
      'recovery_preference', 'recurring_pattern',
      'user_goal',
    ]));
  });
});

describe('searchMemories: the actual tool result the model sees', () => {
  it('returns no results when the top-level gate is off, even with matching memories present', () => {
    const memories = [baseMemory()];
    const results = searchMemories({ ...fullPerms, allowNovaMemory: false }, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('returns no results for a category the user never opted into, even if it matches the query', () => {
    const perms: NovaPermissions = { allowNovaMemory: true, allowNovaUseSavedMemories: true, allowNovaRememberGoals: false, allowNovaRememberRecoveryPatterns: true };
    const memories = [baseMemory({ memoryType: 'user_goal', memoryText: 'Leave by 6pm Fridays' })];
    const results = searchMemories(perms, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('excludes a memory the user has not approved, even if it otherwise matches', () => {
    const memories = [baseMemory({ userApproved: false })];
    const results = searchMemories(fullPerms, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('excludes a memory that has been revoked', () => {
    const memories = [baseMemory({ revoked: true })];
    const results = searchMemories(fullPerms, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('excludes a memory with reviewStatus other than active', () => {
    const memories = [baseMemory({ reviewStatus: 'pending' })];
    const results = searchMemories(fullPerms, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('excludes a memory that has expired', () => {
    const memories = [baseMemory({ expiresAt: '2020-01-01T00:00:00.000Z' })];
    const results = searchMemories(fullPerms, memories, 'Friday');
    expect(results).toEqual([]);
  });

  it('includes a memory with no expiresAt at all', () => {
    const memories = [baseMemory({ expiresAt: null })];
    const results = searchMemories(fullPerms, memories, 'Friday');
    expect(results.length).toBe(1);
  });

  it('is case-insensitive when matching the query against memory text', () => {
    const memories = [baseMemory({ memoryText: 'Prefers FRIDAY afternoons for recovery blocks' })];
    const results = searchMemories(fullPerms, memories, 'friday');
    expect(results.length).toBe(1);
  });

  it('returns no results when the query does not match any memory text', () => {
    const memories = [baseMemory()];
    const results = searchMemories(fullPerms, memories, 'something unrelated entirely');
    expect(results).toEqual([]);
  });

  it('returns no results for an empty or whitespace-only query, rather than dumping every memory', () => {
    const memories = [baseMemory(), baseMemory({ memoryText: 'Something else entirely' })];
    expect(searchMemories(fullPerms, memories, '')).toEqual([]);
    expect(searchMemories(fullPerms, memories, '   ')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const memories = Array.from({ length: 20 }, (_, i) => baseMemory({ memoryText: `Friday note number ${i}` }));
    const results = searchMemories(fullPerms, memories, 'Friday', 3);
    expect(results.length).toBe(3);
  });

  it('formats results with the memory type as a readable, space-separated prefix', () => {
    const memories = [baseMemory({ memoryType: 'recurring_pattern', memoryText: 'Gets tired around 3pm' })];
    const results = searchMemories(fullPerms, memories, 'tired');
    expect(results[0]).toBe('[recurring pattern] Gets tired around 3pm');
  });

  it('handles an empty memories array without throwing', () => {
    expect(searchMemories(fullPerms, [], 'anything')).toEqual([]);
  });

  it('handles undefined perms without throwing', () => {
    expect(searchMemories(undefined, [baseMemory()], 'Friday')).toEqual([]);
  });
});
