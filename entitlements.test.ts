import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENTITLEMENT,
  ENTITLEMENT_PLANS,
  PURCHASABLE_PLANS,
  PLAN_TIER_ORDER,
  getEffectiveEntitlement,
  hasPaidEntitlement,
  effectivePlan,
  isUpgrade,
  isDowngrade,
  checkQuota,
  canUser,
  getCapability,
  CAPABILITIES,
  minutesUsedForSession,
  PLAN_PRICING,
  annualSavingsGbp,
  PERFORMANCE_IS_MOST_POPULAR,
  resolvePlanFromPriceId,
  validateAdminGrant,
  NullEntitlementProvider,
} from './entitlements';

describe('getEffectiveEntitlement', () => {
  it('a brand-new account with no stored record is Free/active', () => {
    expect(getEffectiveEntitlement(null)).toEqual(DEFAULT_ENTITLEMENT);
    expect(getEffectiveEntitlement(undefined)).toEqual(DEFAULT_ENTITLEMENT);
    expect(getEffectiveEntitlement({})).toEqual(DEFAULT_ENTITLEMENT);
  });

  it('an invalid or spoofed plan/status falls back to the default rather than being trusted', () => {
    expect(getEffectiveEntitlement({ plan: 'ultra_pro' } as any).plan).toBe('free');
    expect(getEffectiveEntitlement({ status: 'definitely_paid' } as any).status).toBe('active');
    expect(getEffectiveEntitlement({ billingSource: 'homemade' } as any).billingSource).toBeNull();
  });

  it('a valid stored record on a new-model plan is honestly reflected', () => {
    const record = getEffectiveEntitlement({
      plan: 'performance',
      status: 'active',
      billingSource: 'stripe',
      entitlementEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      providerSubscriptionId: 'sub_123',
    });
    expect(record.plan).toBe('performance');
    expect(record.billingSource).toBe('stripe');
    expect(record.entitlementEnd).toBe('2030-01-01T00:00:00.000Z');
    expect(record.cancelAtPeriodEnd).toBe(true);
    expect(record.providerSubscriptionId).toBe('sub_123');
  });

  it('a stored plan of the OLD "premium" value is transparently migrated to legacy_premium', () => {
    const record = getEffectiveEntitlement({ plan: 'premium' as any, status: 'active', billingSource: 'admin' });
    expect(record.plan).toBe('legacy_premium');
    expect(record.status).toBe('active');
    expect(record.billingSource).toBe('admin');
  });

  it('missing new fields default safely (cancelAtPeriodEnd false, provider IDs null)', () => {
    const record = getEffectiveEntitlement({ plan: 'core', status: 'active' });
    expect(record.cancelAtPeriodEnd).toBe(false);
    expect(record.providerCustomerId).toBeNull();
    expect(record.providerSubscriptionId).toBeNull();
    expect(record.providerProductId).toBeNull();
    expect(record.providerPriceId).toBeNull();
  });
});

describe('hasPaidEntitlement / effectivePlan', () => {
  it('Free plan never counts as paid regardless of status', () => {
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, status: 'active' })).toBe(false);
  });

  it.each(['core', 'performance', 'executive', 'legacy_premium'] as const)('%s + active with no end date is entitled', (plan) => {
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan, status: 'active' })).toBe(true);
  });

  it('a paid plan + trial or grace still counts as entitled', () => {
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan: 'core', status: 'trial' })).toBe(true);
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan: 'core', status: 'grace' })).toBe(true);
  });

  it('a paid plan + past_due, cancelled, or expired does NOT count as entitled', () => {
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan: 'core', status: 'past_due' })).toBe(false);
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan: 'core', status: 'cancelled' })).toBe(false);
    expect(hasPaidEntitlement({ ...DEFAULT_ENTITLEMENT, plan: 'core', status: 'expired' })).toBe(false);
  });

  it('a paid record with a past entitlementEnd is no longer entitled, even if status is stale-active', () => {
    const record = { ...DEFAULT_ENTITLEMENT, plan: 'performance' as const, status: 'active' as const, entitlementEnd: '2020-01-01T00:00:00.000Z' };
    expect(hasPaidEntitlement(record, new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('a paid record with a future entitlementEnd remains entitled', () => {
    const record = { ...DEFAULT_ENTITLEMENT, plan: 'performance' as const, status: 'active' as const, entitlementEnd: '2030-01-01T00:00:00.000Z' };
    expect(hasPaidEntitlement(record, new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('effectivePlan mirrors hasPaidEntitlement as a plan label', () => {
    expect(effectivePlan(DEFAULT_ENTITLEMENT)).toBe('free');
    expect(effectivePlan({ ...DEFAULT_ENTITLEMENT, plan: 'executive', status: 'active' })).toBe('executive');
    expect(effectivePlan({ ...DEFAULT_ENTITLEMENT, plan: 'executive', status: 'cancelled' })).toBe('free');
  });
});

describe('plan tier ordering / upgrade-downgrade', () => {
  it('orders free < core < performance == legacy_premium < executive', () => {
    expect(PLAN_TIER_ORDER.free).toBeLessThan(PLAN_TIER_ORDER.core);
    expect(PLAN_TIER_ORDER.core).toBeLessThan(PLAN_TIER_ORDER.performance);
    expect(PLAN_TIER_ORDER.performance).toBe(PLAN_TIER_ORDER.legacy_premium);
    expect(PLAN_TIER_ORDER.performance).toBeLessThan(PLAN_TIER_ORDER.executive);
  });

  it('isUpgrade / isDowngrade reflect every real move in the product brief', () => {
    expect(isUpgrade('free', 'core')).toBe(true);
    expect(isUpgrade('free', 'performance')).toBe(true);
    expect(isUpgrade('free', 'executive')).toBe(true);
    expect(isUpgrade('core', 'performance')).toBe(true);
    expect(isUpgrade('core', 'executive')).toBe(true);
    expect(isUpgrade('performance', 'executive')).toBe(true);

    expect(isDowngrade('executive', 'performance')).toBe(true);
    expect(isDowngrade('executive', 'core')).toBe(true);
    expect(isDowngrade('performance', 'core')).toBe(true);
    expect(isDowngrade('core', 'free')).toBe(true);
    expect(isDowngrade('performance', 'free')).toBe(true);
  });

  it('legacy_premium upgrading to executive is a real upgrade; downgrading to core is a real downgrade', () => {
    expect(isUpgrade('legacy_premium', 'executive')).toBe(true);
    expect(isDowngrade('legacy_premium', 'core')).toBe(true);
  });

  it('a plan is neither an upgrade nor a downgrade from itself', () => {
    expect(isUpgrade('core', 'core')).toBe(false);
    expect(isDowngrade('core', 'core')).toBe(false);
  });

  it('legacy_premium is deliberately excluded from PURCHASABLE_PLANS', () => {
    expect(PURCHASABLE_PLANS).not.toContain('legacy_premium');
    expect(PURCHASABLE_PLANS).toEqual(['free', 'core', 'performance', 'executive']);
  });

  it('ENTITLEMENT_PLANS includes exactly the five real plan values', () => {
    expect([...ENTITLEMENT_PLANS].sort()).toEqual(['core', 'executive', 'free', 'legacy_premium', 'performance'].sort());
  });
});

describe('capability matrix', () => {
  it('every real capability id used by a route resolves for every plan without throwing', () => {
    const realCapabilities = ['nova_text', 'nova_voice', 'nova_voice_minutes', 'blame_voice', 'diagnose', 'exports', 'nova_manager_coach', 'resentment_analysis', 'executive_report', 'sms_nudges'] as const;
    for (const id of realCapabilities) {
      for (const plan of ENTITLEMENT_PLANS) {
        const cap = getCapability(plan, id);
        expect(typeof cap.enabled).toBe('boolean');
      }
    }
  });

  it('canUser mirrors getCapability(...).enabled', () => {
    expect(canUser('free', 'nova_text')).toBe(true);
    expect(canUser('free', 'sms_nudges')).toBe(false);
    expect(canUser('performance', 'sms_nudges')).toBe(true);
  });

  it('every ascending real tier has a limit >= the tier below it (or unlimited) for every daily/monthly quota capability', () => {
    const tierOrder = ['free', 'core', 'performance', 'executive'] as const;
    for (const cfg of Object.values(CAPABILITIES)) {
      for (let i = 1; i < tierOrder.length; i++) {
        const lower = cfg[tierOrder[i - 1]];
        const higher = cfg[tierOrder[i]];
        if (lower.limit === null || higher.limit === null) continue;
        expect(higher.limit).toBeGreaterThanOrEqual(lower.limit);
      }
    }
  });

  it('checkQuota allows use below the limit and blocks at/above it', () => {
    const limit = getCapability('free', 'nova_text').limit as number;
    expect(checkQuota('free', 'nova_text', 0).allowed).toBe(true);
    expect(checkQuota('free', 'nova_text', limit - 1).allowed).toBe(true);
    expect(checkQuota('free', 'nova_text', limit).allowed).toBe(false);
  });

  it('a capability with no limit (null) is always allowed regardless of usage so far', () => {
    expect(checkQuota('legacy_premium', 'nova_voice_minutes', 999999).allowed).toBe(true);
    expect(checkQuota('legacy_premium', 'nova_voice_minutes', 999999).limit).toBeNull();
  });

  it('a disabled capability is never allowed even with zero usage', () => {
    expect(checkQuota('free', 'sms_nudges', 0).allowed).toBe(false);
    expect(checkQuota('core', 'sms_nudges', 0).allowed).toBe(false);
  });

  it('Free voice SESSION access is the most tightly controlled capability, matching the product\'s stated intent', () => {
    expect(CAPABILITIES.nova_voice.free.limit).toBeLessThan(CAPABILITIES.nova_voice.performance.limit as number);
    expect(CAPABILITIES.nova_voice.free.limit).toBeLessThanOrEqual(CAPABILITIES.nova_text.free.limit as number);
  });

  it('nova_voice (session count, daily) and nova_voice_minutes (duration, monthly) are genuinely separate mechanisms', () => {
    expect(CAPABILITIES.nova_voice.core.resetPeriod).toBe('daily');
    expect(CAPABILITIES.nova_voice.core.unit).not.toBe('minutes');
    expect(CAPABILITIES.nova_voice_minutes.core.resetPeriod).toBe('monthly');
    expect(CAPABILITIES.nova_voice_minutes.core.unit).toBe('minutes');
  });

  it('legacy_premium has uncapped monthly Nova Live minutes (never bound by a monthly concept before this revision)', () => {
    expect(CAPABILITIES.nova_voice_minutes.legacy_premium.limit).toBeNull();
    // but the pre-existing daily session-count cap remains, unchanged from the old Premium tier
    expect(CAPABILITIES.nova_voice.legacy_premium.limit).toBe(20);
  });

  it('matches the product brief\'s exact initial Nova Live monthly minute allowances', () => {
    expect(CAPABILITIES.nova_voice_minutes.free.limit).toBe(10);
    expect(CAPABILITIES.nova_voice_minutes.core.limit).toBe(60);
    expect(CAPABILITIES.nova_voice_minutes.performance.limit).toBe(240);
    expect(CAPABILITIES.nova_voice_minutes.executive.limit).toBe(600);
  });

  it('matches the product brief\'s exact SMS allowances, and Free/Core get none', () => {
    expect(CAPABILITIES.sms_nudges.free.enabled).toBe(false);
    expect(CAPABILITIES.sms_nudges.core.enabled).toBe(false);
    expect(CAPABILITIES.sms_nudges.performance.limit).toBe(10);
    expect(CAPABILITIES.sms_nudges.executive.limit).toBe(30);
  });

  it('every capability with an eraseOnDeletion=false-shaped hard gate for Free is not silently also gated for every paid tier', () => {
    // predictive_insights and early_access are Performance+/Executive-only by design - confirms they're not accidentally blocked for every plan.
    expect(CAPABILITIES.predictive_insights.performance.enabled).toBe(true);
    expect(CAPABILITIES.predictive_insights.executive.enabled).toBe(true);
    expect(CAPABILITIES.early_access.executive.enabled).toBe(true);
    expect(CAPABILITIES.early_access.performance.enabled).toBe(false);
  });

  it('blame_voice is a hard binary gate: Free disabled, every paid tier (including legacy_premium) enabled and uncapped', () => {
    expect(CAPABILITIES.blame_voice.free.enabled).toBe(false);
    expect(CAPABILITIES.blame_voice.free.limit).toBe(0);
    expect(canUser('free', 'blame_voice')).toBe(false);
    for (const plan of ['core', 'performance', 'executive', 'legacy_premium'] as const) {
      expect(CAPABILITIES.blame_voice[plan].enabled).toBe(true);
      expect(CAPABILITIES.blame_voice[plan].limit).toBeNull();
      expect(canUser(plan, 'blame_voice')).toBe(true);
    }
  });

  it('coaching_benefits is Executive-only and never implies automatic human coaching inclusion beyond a declared benefit flag', () => {
    expect(CAPABILITIES.coaching_benefits.executive.enabled).toBe(true);
    expect(CAPABILITIES.coaching_benefits.performance.enabled).toBe(false);
    expect(CAPABILITIES.coaching_benefits.free.enabled).toBe(false);
  });
});

describe('minutesUsedForSession', () => {
  it('rounds up to the nearest whole minute', () => {
    expect(minutesUsedForSession(1)).toBe(1);
    expect(minutesUsedForSession(59_000)).toBe(1);
    expect(minutesUsedForSession(60_000)).toBe(1);
    expect(minutesUsedForSession(60_001)).toBe(2);
    expect(minutesUsedForSession(600_000)).toBe(10);
  });

  it('a zero or negative duration counts as zero minutes used', () => {
    expect(minutesUsedForSession(0)).toBe(0);
    expect(minutesUsedForSession(-500)).toBe(0);
  });
});

describe('pricing', () => {
  it('matches the agreed launch prices exactly', () => {
    expect(PLAN_PRICING.free).toEqual({ monthlyGbp: 0, annualGbp: null });
    expect(PLAN_PRICING.core).toEqual({ monthlyGbp: 34.99, annualGbp: 349 });
    expect(PLAN_PRICING.performance).toEqual({ monthlyGbp: 49.99, annualGbp: 499 });
    expect(PLAN_PRICING.executive).toEqual({ monthlyGbp: 69.99, annualGbp: 699 });
  });

  it('Performance is marked most popular', () => {
    expect(PERFORMANCE_IS_MOST_POPULAR).toBe(true);
  });

  it('annualSavingsGbp computes the real saving for each paid plan', () => {
    expect(annualSavingsGbp('core')).toBeCloseTo(34.99 * 12 - 349, 2);
    expect(annualSavingsGbp('performance')).toBeCloseTo(49.99 * 12 - 499, 2);
    expect(annualSavingsGbp('executive')).toBeCloseTo(69.99 * 12 - 699, 2);
  });

  it('Free has no annual saving to compute (no annual price at all)', () => {
    expect(annualSavingsGbp('free')).toBeNull();
  });

  it('resolvePlanFromPriceId looks up a provided price-ID map without inventing a mapping', () => {
    const map = { price_core_monthly: { plan: 'core' as const, cadence: 'monthly' as const } };
    expect(resolvePlanFromPriceId('price_core_monthly', map)).toEqual({ plan: 'core', cadence: 'monthly' });
    expect(resolvePlanFromPriceId('price_unknown', map)).toBeNull();
  });
});

describe('validateAdminGrant', () => {
  it('accepts a valid purchasable plan/status with no duration (no fixed end)', () => {
    expect(validateAdminGrant({ plan: 'performance', status: 'active' })).toEqual({ valid: true });
  });

  it('accepts a valid plan/status/durationDays', () => {
    expect(validateAdminGrant({ plan: 'core', status: 'active', durationDays: 30 })).toEqual({ valid: true });
  });

  it('rejects an invalid plan or status', () => {
    expect(validateAdminGrant({ plan: 'ultra', status: 'active' } as any).valid).toBe(false);
    expect(validateAdminGrant({ plan: 'performance', status: 'paid' } as any).valid).toBe(false);
  });

  it('rejects legacy_premium - it is a read-path migration outcome, never something an admin grants directly', () => {
    expect(validateAdminGrant({ plan: 'legacy_premium', status: 'active' } as any).valid).toBe(false);
  });

  it('rejects the old "premium" plan value outright (no longer a valid grant target)', () => {
    expect(validateAdminGrant({ plan: 'premium', status: 'active' } as any).valid).toBe(false);
  });

  it('rejects an out-of-range or non-integer durationDays', () => {
    expect(validateAdminGrant({ plan: 'performance', status: 'active', durationDays: 0 }).valid).toBe(false);
    expect(validateAdminGrant({ plan: 'performance', status: 'active', durationDays: 3651 }).valid).toBe(false);
    expect(validateAdminGrant({ plan: 'performance', status: 'active', durationDays: 1.5 }).valid).toBe(false);
  });
});

describe('NullEntitlementProvider', () => {
  it('honestly identifies itself as the null provider', () => {
    expect(new NullEntitlementProvider().name).toBe('null');
  });
});
