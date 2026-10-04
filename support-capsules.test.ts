import { describe, it, expect } from 'vitest';
import {
  computeCapsuleExpiresAt,
  isCapsuleActive,
  deriveEffectiveSharing,
  isValidCapsuleCategory,
  isValidCapsuleExpiryType,
  isValidCapsuleExpiryInput,
  SUPPORT_CAPSULE_CATEGORIES,
} from './support-capsules';

describe('computeCapsuleExpiresAt', () => {
  it('until_off never expires', () => {
    expect(computeCapsuleExpiresAt('until_off', '2026-01-01T10:00:00.000Z')).toBeNull();
  });

  it('today expires at the end of the same day', () => {
    const result = computeCapsuleExpiresAt('today', '2026-01-01T10:00:00.000Z');
    expect(result).not.toBeNull();
    expect(new Date(result!).toISOString().startsWith('2026-01-01')).toBe(true);
    expect(new Date(result!).getTime()).toBeGreaterThan(new Date('2026-01-01T10:00:00.000Z').getTime());
  });

  it('seven_days expires exactly 7 days after startAt', () => {
    const result = computeCapsuleExpiresAt('seven_days', '2026-01-01T10:00:00.000Z');
    const expected = new Date('2026-01-08T10:00:00.000Z').getTime();
    expect(new Date(result!).getTime()).toBe(expected);
  });

  it('until_date expires at the end of the chosen date', () => {
    const result = computeCapsuleExpiresAt('until_date', '2026-01-01T10:00:00.000Z', '2026-01-15');
    expect(new Date(result!).toISOString().startsWith('2026-01-15')).toBe(true);
  });
});

describe('isCapsuleActive', () => {
  it('is always active when expiresAt is null (until_off)', () => {
    expect(isCapsuleActive({ expiresAt: null }, '2030-01-01T00:00:00.000Z')).toBe(true);
  });

  it('is active before its expiry and inactive after', () => {
    const capsule = { expiresAt: '2026-01-05T00:00:00.000Z' };
    expect(isCapsuleActive(capsule, '2026-01-04T00:00:00.000Z')).toBe(true);
    expect(isCapsuleActive(capsule, '2026-01-06T00:00:00.000Z')).toBe(false);
  });
});

describe('isValidCapsuleCategory / isValidCapsuleExpiryType', () => {
  it('accepts only the four real categories', () => {
    for (const category of SUPPORT_CAPSULE_CATEGORIES) expect(isValidCapsuleCategory(category)).toBe(true);
    expect(isValidCapsuleCategory('viewJournal')).toBe(false);
    expect(isValidCapsuleCategory(undefined)).toBe(false);
  });

  it('accepts only the four implemented expiry types - never until_completed/one_time, which have no real behaviour yet', () => {
    expect(isValidCapsuleExpiryType('today')).toBe(true);
    expect(isValidCapsuleExpiryType('seven_days')).toBe(true);
    expect(isValidCapsuleExpiryType('until_date')).toBe(true);
    expect(isValidCapsuleExpiryType('until_off')).toBe(true);
    expect(isValidCapsuleExpiryType('until_completed')).toBe(false);
    expect(isValidCapsuleExpiryType('one_time')).toBe(false);
  });
});

describe('isValidCapsuleExpiryInput', () => {
  const now = '2026-01-01T00:00:00.000Z';

  it('always valid for non-until_date types regardless of untilDate', () => {
    expect(isValidCapsuleExpiryInput('until_off', undefined, now)).toBe(true);
    expect(isValidCapsuleExpiryInput('today', 'garbage', now)).toBe(true);
  });

  it('rejects a missing, malformed, or past untilDate for until_date', () => {
    expect(isValidCapsuleExpiryInput('until_date', undefined, now)).toBe(false);
    expect(isValidCapsuleExpiryInput('until_date', 'not-a-date', now)).toBe(false);
    expect(isValidCapsuleExpiryInput('until_date', '2025-01-01', now)).toBe(false);
  });

  it('accepts a real future untilDate for until_date', () => {
    expect(isValidCapsuleExpiryInput('until_date', '2026-06-01', now)).toBe(true);
  });
});

describe('deriveEffectiveSharing', () => {
  const now = '2026-01-10T00:00:00.000Z';

  it('a category with no capsule and no legacy fallback is never shared by default', () => {
    const result = deriveEffectiveSharing([], now);
    expect(result).toEqual({ viewGoals: false, viewMilestones: false, viewEnergyStats: false, sendPings: false });
  });

  it('an active capsule makes its category shared', () => {
    const result = deriveEffectiveSharing([{ category: 'viewGoals', expiresAt: null }], now);
    expect(result.viewGoals).toBe(true);
    expect(result.viewMilestones).toBe(false);
  });

  it('an expired capsule makes its category NOT shared, even though a capsule exists', () => {
    const result = deriveEffectiveSharing([{ category: 'viewGoals', expiresAt: '2026-01-01T00:00:00.000Z' }], now);
    expect(result.viewGoals).toBe(false);
  });

  it('falls back to the legacy boolean only for categories with no capsule at all', () => {
    const result = deriveEffectiveSharing(
      [{ category: 'viewGoals', expiresAt: null }],
      now,
      { viewGoals: false, viewMilestones: true, sendPings: true }
    );
    // viewGoals has its own (active) capsule - legacy value is ignored for it.
    expect(result.viewGoals).toBe(true);
    // viewMilestones and sendPings have no capsule - legacy value applies.
    expect(result.viewMilestones).toBe(true);
    expect(result.sendPings).toBe(true);
    // viewEnergyStats has no capsule and no legacy entry - defaults false.
    expect(result.viewEnergyStats).toBe(false);
  });
});
