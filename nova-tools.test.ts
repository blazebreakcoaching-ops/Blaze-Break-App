import { describe, it, expect } from 'vitest';
import {
  memoryToolIsAllowed,
  searchMemories,
  isValidRecoveryDuration,
  isValidMemoryType,
  isValidWritableConfidence,
  validateMemoryWrite,
  toolsAreEnabled,
  MAX_MEMORY_CONTENT_LENGTH,
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

describe('isValidWritableConfidence: the model can propose low/medium/high, never verified', () => {
  it('accepts low, medium, and high', () => {
    expect(isValidWritableConfidence('low')).toBe(true);
    expect(isValidWritableConfidence('medium')).toBe(true);
    expect(isValidWritableConfidence('high')).toBe(true);
  });

  it('rejects verified, even though it is a real ConfidenceLevel value elsewhere in the app - it is reserved for deterministic system computations, not a probabilistic conversational inference', () => {
    expect(isValidWritableConfidence('verified')).toBe(false);
  });

  it('rejects non-string and nonsense input', () => {
    expect(isValidWritableConfidence(1)).toBe(false);
    expect(isValidWritableConfidence(null)).toBe(false);
    expect(isValidWritableConfidence('certain')).toBe(false);
  });
});

describe('validateMemoryWrite: the single gate every proposed memory write must pass', () => {
  const validArgs = { type: 'preference', content: 'Prefers ending meetings 5 minutes early', confidence: 'medium' };

  it('accepts a fully valid write', () => {
    expect(validateMemoryWrite(validArgs)).toEqual({ valid: true });
  });

  it('rejects an invalid or hallucinated memory type', () => {
    const result = validateMemoryWrite({ ...validArgs, type: 'goal' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a real memory type/);
  });

  it('rejects empty content', () => {
    expect(validateMemoryWrite({ ...validArgs, content: '' }).valid).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    expect(validateMemoryWrite({ ...validArgs, content: '   ' }).valid).toBe(false);
  });

  it('rejects non-string content', () => {
    expect(validateMemoryWrite({ ...validArgs, content: 12345 }).valid).toBe(false);
  });

  it('rejects content over the length cap', () => {
    const tooLong = 'a'.repeat(MAX_MEMORY_CONTENT_LENGTH + 1);
    const result = validateMemoryWrite({ ...validArgs, content: tooLong });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/300 characters or fewer/);
  });

  it('accepts content exactly at the length cap', () => {
    const exactLength = 'a'.repeat(MAX_MEMORY_CONTENT_LENGTH);
    expect(validateMemoryWrite({ ...validArgs, content: exactLength }).valid).toBe(true);
  });

  it('rejects a proposed "verified" confidence specifically - the safety-critical case', () => {
    const result = validateMemoryWrite({ ...validArgs, confidence: 'verified' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a valid confidence level/);
  });

  it('rejects missing confidence', () => {
    expect(validateMemoryWrite({ type: 'preference', content: 'Something' }).valid).toBe(false);
  });

  it('checks type before content, so the first error surfaced is always type when both are invalid', () => {
    const result = validateMemoryWrite({ type: 'nonsense', content: '', confidence: 'verified' });
    expect(result.error).toMatch(/not a real memory type/);
  });
});

describe('toolsAreEnabled: the kill switch for Nova tool use, independent of provider selection', () => {
  it('defaults to enabled when the env var is unset', () => {
    expect(toolsAreEnabled(undefined)).toBe(true);
  });

  it('defaults to enabled for an empty string', () => {
    expect(toolsAreEnabled('')).toBe(true);
  });

  it('disables only on the exact string "false"', () => {
    expect(toolsAreEnabled('false')).toBe(false);
  });

  it('does not disable on unexpected or malformed values, so a typo cannot silently turn tools off', () => {
    expect(toolsAreEnabled('False')).toBe(true);
    expect(toolsAreEnabled('0')).toBe(true);
    expect(toolsAreEnabled('no')).toBe(true);
    expect(toolsAreEnabled('disabled')).toBe(true);
  });
});
