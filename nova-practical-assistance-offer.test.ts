import { describe, it, expect } from 'vitest';
import { validatePracticalAssistanceOffer } from './nova-practical-assistance-offer';

describe('validatePracticalAssistanceOffer', () => {
  it('rejects a missing or empty reason', () => {
    expect(validatePracticalAssistanceOffer({}).valid).toBe(false);
    expect(validatePracticalAssistanceOffer({ reason: '' }).valid).toBe(false);
    expect(validatePracticalAssistanceOffer({ reason: '   ' }).valid).toBe(false);
  });

  it('rejects a non-string reason', () => {
    expect(validatePracticalAssistanceOffer({ reason: 42 as any }).valid).toBe(false);
  });

  it('rejects an overlong reason', () => {
    expect(validatePracticalAssistanceOffer({ reason: 'x'.repeat(201) }).valid).toBe(false);
  });

  it('accepts a real, specific reason', () => {
    const result = validatePracticalAssistanceOffer({ reason: 'User said they are behind on three deadlines this week and asked for help organising them.' });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
