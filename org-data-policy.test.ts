import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DATA_POLICY,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  getEffectiveDataPolicy,
  validateDataPolicyUpdate,
} from './org-data-policy';

describe('DEFAULT_DATA_POLICY', () => {
  it('is fully locked down - no training, no analytics, no debug retention', () => {
    expect(DEFAULT_DATA_POLICY.allowModelTraining).toBe(false);
    expect(DEFAULT_DATA_POLICY.allowProductAnalytics).toBe(false);
    expect(DEFAULT_DATA_POLICY.allowContentRetentionForDebugging).toBe(false);
  });
});

describe('getEffectiveDataPolicy', () => {
  it('a brand new org (no stored policy at all) gets the fully safe default', () => {
    expect(getEffectiveDataPolicy(null)).toEqual(DEFAULT_DATA_POLICY);
    expect(getEffectiveDataPolicy(undefined)).toEqual(DEFAULT_DATA_POLICY);
    expect(getEffectiveDataPolicy({})).toEqual(DEFAULT_DATA_POLICY);
  });

  it('allowModelTraining defaults to false even if every other field is stored', () => {
    const result = getEffectiveDataPolicy({
      allowProductAnalytics: true,
      allowContentRetentionForDebugging: true,
      retentionPeriodDays: 90,
      // allowModelTraining deliberately omitted
    } as any);
    expect(result.allowModelTraining).toBe(false);
  });

  it('a stored true value for allowModelTraining is honestly reflected - this function never silently overrides an explicit choice', () => {
    expect(getEffectiveDataPolicy({ allowModelTraining: true } as any).allowModelTraining).toBe(true);
  });

  it('anything other than the literal boolean true is treated as false - no truthy coercion', () => {
    expect(getEffectiveDataPolicy({ allowModelTraining: 1 } as any).allowModelTraining).toBe(false);
    expect(getEffectiveDataPolicy({ allowModelTraining: 'true' } as any).allowModelTraining).toBe(false);
  });

  it('an out-of-range or malformed retentionPeriodDays falls back to the default rather than being silently clamped to something arbitrary', () => {
    expect(getEffectiveDataPolicy({ retentionPeriodDays: -5 } as any).retentionPeriodDays).toBe(DEFAULT_DATA_POLICY.retentionPeriodDays);
    expect(getEffectiveDataPolicy({ retentionPeriodDays: 99999 } as any).retentionPeriodDays).toBe(DEFAULT_DATA_POLICY.retentionPeriodDays);
    expect(getEffectiveDataPolicy({ retentionPeriodDays: NaN } as any).retentionPeriodDays).toBe(DEFAULT_DATA_POLICY.retentionPeriodDays);
    expect(getEffectiveDataPolicy({ retentionPeriodDays: 'thirty' } as any).retentionPeriodDays).toBe(DEFAULT_DATA_POLICY.retentionPeriodDays);
  });

  it('a valid in-range retentionPeriodDays is preserved exactly', () => {
    expect(getEffectiveDataPolicy({ retentionPeriodDays: 7 } as any).retentionPeriodDays).toBe(7);
    expect(getEffectiveDataPolicy({ retentionPeriodDays: MIN_RETENTION_DAYS } as any).retentionPeriodDays).toBe(MIN_RETENTION_DAYS);
    expect(getEffectiveDataPolicy({ retentionPeriodDays: MAX_RETENTION_DAYS } as any).retentionPeriodDays).toBe(MAX_RETENTION_DAYS);
  });
});

describe('validateDataPolicyUpdate', () => {
  const valid = { allowModelTraining: false, allowProductAnalytics: true, allowContentRetentionForDebugging: false, retentionPeriodDays: 30 };

  it('accepts a fully-specified, in-range policy', () => {
    expect(validateDataPolicyUpdate(valid)).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateDataPolicyUpdate(null).valid).toBe(false);
    expect(validateDataPolicyUpdate(undefined).valid).toBe(false);
    expect(validateDataPolicyUpdate('not an object').valid).toBe(false);
    expect(validateDataPolicyUpdate(42).valid).toBe(false);
  });

  it('rejects a non-boolean flag', () => {
    expect(validateDataPolicyUpdate({ ...valid, allowModelTraining: 'yes' }).valid).toBe(false);
    expect(validateDataPolicyUpdate({ ...valid, allowProductAnalytics: 1 }).valid).toBe(false);
  });

  it('rejects a missing flag rather than defaulting it silently', () => {
    const { allowModelTraining, ...missing } = valid;
    expect(validateDataPolicyUpdate(missing).valid).toBe(false);
  });

  it('rejects a non-integer, out-of-range, or non-numeric retentionPeriodDays', () => {
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: 0 }).valid).toBe(false);
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: MAX_RETENTION_DAYS + 1 }).valid).toBe(false);
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: 30.5 }).valid).toBe(false);
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: 'thirty' }).valid).toBe(false);
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: NaN }).valid).toBe(false);
  });

  it('accepts the exact boundary values', () => {
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: MIN_RETENTION_DAYS }).valid).toBe(true);
    expect(validateDataPolicyUpdate({ ...valid, retentionPeriodDays: MAX_RETENTION_DAYS }).valid).toBe(true);
  });

  it('returns a specific, actionable error message', () => {
    const res = validateDataPolicyUpdate({ ...valid, allowModelTraining: 'nope' });
    expect(res.error).toMatch(/allowModelTraining/);
  });
});
