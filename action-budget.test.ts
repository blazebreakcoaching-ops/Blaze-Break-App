import { describe, it, expect } from 'vitest';
import {
  getEffectiveActionBudget, validateActionBudgetUpdate, canStartNewIntervention,
  DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS,
} from './action-budget';

describe('getEffectiveActionBudget', () => {
  it('returns the default when nothing is stored', () => {
    expect(getEffectiveActionBudget(undefined)).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
    expect(getEffectiveActionBudget(null)).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
  });

  it('returns the stored value when it is valid', () => {
    expect(getEffectiveActionBudget(5)).toBe(5);
  });

  it('falls back to the default for an out-of-range or non-integer stored value', () => {
    expect(getEffectiveActionBudget(0)).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
    expect(getEffectiveActionBudget(21)).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
    expect(getEffectiveActionBudget(2.5)).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
    expect(getEffectiveActionBudget('3')).toBe(DEFAULT_MAX_CONCURRENT_ACTIVE_INTERVENTIONS);
  });
});

describe('validateActionBudgetUpdate', () => {
  it('accepts a whole number within range', () => {
    expect(validateActionBudgetUpdate(5)).toEqual({ valid: true });
    expect(validateActionBudgetUpdate(1)).toEqual({ valid: true });
    expect(validateActionBudgetUpdate(20)).toEqual({ valid: true });
  });

  it('rejects out-of-range values', () => {
    expect(validateActionBudgetUpdate(0).valid).toBe(false);
    expect(validateActionBudgetUpdate(21).valid).toBe(false);
  });

  it('rejects a non-integer or non-number', () => {
    expect(validateActionBudgetUpdate(2.5).valid).toBe(false);
    expect(validateActionBudgetUpdate('3').valid).toBe(false);
    expect(validateActionBudgetUpdate(null).valid).toBe(false);
  });
});

describe('canStartNewIntervention', () => {
  it('allows starting a new intervention when under budget', () => {
    expect(canStartNewIntervention(2, 3)).toEqual({ allowed: true });
  });

  it('refuses to start a new intervention once at the budget limit', () => {
    const result = canStartNewIntervention(3, 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('3');
  });

  it('refuses when somehow over the limit, never just silently allowing it', () => {
    expect(canStartNewIntervention(5, 3).allowed).toBe(false);
  });
});
