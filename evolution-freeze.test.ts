import { describe, it, expect } from 'vitest';
import { isEvolutionFrozen, validateFreezeToggleInput } from './evolution-freeze';

describe('isEvolutionFrozen', () => {
  it('is false for a missing doc (never frozen)', () => {
    expect(isEvolutionFrozen(null)).toBe(false);
    expect(isEvolutionFrozen(undefined)).toBe(false);
  });
  it('is false for a doc with frozen: false', () => {
    expect(isEvolutionFrozen({ frozen: false })).toBe(false);
  });
  it('is true only when frozen is exactly true', () => {
    expect(isEvolutionFrozen({ frozen: true })).toBe(true);
  });
  it('is false for a malformed frozen field rather than throwing', () => {
    expect(isEvolutionFrozen({ frozen: 'true' as any })).toBe(false);
    expect(isEvolutionFrozen({} as any)).toBe(false);
  });
});

describe('validateFreezeToggleInput', () => {
  it('accepts a valid freeze', () => {
    expect(validateFreezeToggleInput({ frozen: true, reason: 'Investigating a bad proposal apply.' })).toEqual({ valid: true });
  });
  it('accepts a valid unfreeze with no reason', () => {
    expect(validateFreezeToggleInput({ frozen: false })).toEqual({ valid: true });
    expect(validateFreezeToggleInput({ frozen: false, reason: null })).toEqual({ valid: true });
  });
  it('rejects a missing/non-boolean frozen field', () => {
    expect(validateFreezeToggleInput({}).valid).toBe(false);
    expect(validateFreezeToggleInput({ frozen: 'yes' }).valid).toBe(false);
  });
  it('rejects a non-string reason', () => {
    expect(validateFreezeToggleInput({ frozen: true, reason: 123 }).valid).toBe(false);
  });
  it('rejects a non-object input', () => {
    expect(validateFreezeToggleInput(null).valid).toBe(false);
    expect(validateFreezeToggleInput('x').valid).toBe(false);
  });
});
