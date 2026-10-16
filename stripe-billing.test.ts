import { describe, it, expect } from 'vitest';
import {
  buildPriceIdMap, mapStripeSubscriptionStatus, extractPriceIdFromSubscriptionItems,
  resolveStripeSubscriptionPatch, buildPastDuePatch,
} from './stripe-billing';

describe('buildPriceIdMap', () => {
  it('builds a map keyed by price ID from the configured env vars', () => {
    const map = buildPriceIdMap({
      STRIPE_PRICE_CORE_MONTHLY: 'price_core_m',
      STRIPE_PRICE_PERFORMANCE_ANNUAL: 'price_perf_a',
    });
    expect(map).toEqual({
      price_core_m: { plan: 'core', cadence: 'monthly' },
      price_perf_a: { plan: 'performance', cadence: 'annual' },
    });
  });

  it('omits any price whose env var is unset, never fabricating an entry', () => {
    const map = buildPriceIdMap({});
    expect(map).toEqual({});
  });

  it('builds all six entries when every env var is configured', () => {
    const map = buildPriceIdMap({
      STRIPE_PRICE_CORE_MONTHLY: 'p1', STRIPE_PRICE_CORE_ANNUAL: 'p2',
      STRIPE_PRICE_PERFORMANCE_MONTHLY: 'p3', STRIPE_PRICE_PERFORMANCE_ANNUAL: 'p4',
      STRIPE_PRICE_EXECUTIVE_MONTHLY: 'p5', STRIPE_PRICE_EXECUTIVE_ANNUAL: 'p6',
    });
    expect(Object.keys(map)).toHaveLength(6);
    expect(map.p5).toEqual({ plan: 'executive', cadence: 'monthly' });
  });
});

describe('mapStripeSubscriptionStatus', () => {
  it('maps trialing/active/past_due/unpaid/canceled to this app\'s vocabulary', () => {
    expect(mapStripeSubscriptionStatus('trialing')).toBe('trial');
    expect(mapStripeSubscriptionStatus('active')).toBe('active');
    expect(mapStripeSubscriptionStatus('past_due')).toBe('past_due');
    expect(mapStripeSubscriptionStatus('unpaid')).toBe('past_due');
    expect(mapStripeSubscriptionStatus('canceled')).toBe('cancelled');
  });

  it('maps incomplete/incomplete_expired/paused/anything unrecognised to expired', () => {
    expect(mapStripeSubscriptionStatus('incomplete')).toBe('expired');
    expect(mapStripeSubscriptionStatus('incomplete_expired')).toBe('expired');
    expect(mapStripeSubscriptionStatus('paused')).toBe('expired');
    expect(mapStripeSubscriptionStatus('some_future_stripe_status')).toBe('expired');
  });
});

describe('extractPriceIdFromSubscriptionItems', () => {
  it('reads the price id from an expanded price object', () => {
    expect(extractPriceIdFromSubscriptionItems({ data: [{ price: { id: 'price_123' } }] })).toBe('price_123');
  });

  it('reads the price id when the SDK returns a bare string', () => {
    expect(extractPriceIdFromSubscriptionItems({ data: [{ price: 'price_456' }] })).toBe('price_456');
  });

  it('returns null for missing/malformed shapes rather than throwing', () => {
    expect(extractPriceIdFromSubscriptionItems(null)).toBeNull();
    expect(extractPriceIdFromSubscriptionItems(undefined)).toBeNull();
    expect(extractPriceIdFromSubscriptionItems({})).toBeNull();
    expect(extractPriceIdFromSubscriptionItems({ data: [] })).toBeNull();
    expect(extractPriceIdFromSubscriptionItems({ data: [{ price: {} }] })).toBeNull();
  });
});

describe('resolveStripeSubscriptionPatch', () => {
  const priceIdMap = { price_core_m: { plan: 'core' as const, cadence: 'monthly' as const } };

  it('rejects when there is no price id at all', () => {
    const result = resolveStripeSubscriptionPatch({
      priceId: null, stripeStatus: 'active', cancelAtPeriodEnd: false,
      customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: null, priceIdMap,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_price_id' });
  });

  it('rejects a price id that is not in the server-side allowlist', () => {
    const result = resolveStripeSubscriptionPatch({
      priceId: 'price_unknown', stripeStatus: 'active', cancelAtPeriodEnd: false,
      customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: null, priceIdMap,
    });
    expect(result).toEqual({ ok: false, reason: 'unknown_price_id' });
  });

  it('builds a full entitlement patch for an active subscription, with renewalDate set and entitlementEnd null', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const periodEnd = Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000);
    const result = resolveStripeSubscriptionPatch({
      priceId: 'price_core_m', stripeStatus: 'active', cancelAtPeriodEnd: false,
      customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: periodEnd, priceIdMap,
    }, now);
    expect(result.ok).toBe(true);
    expect(result.patch).toEqual({
      plan: 'core', status: 'active', billingSource: 'stripe', cancelAtPeriodEnd: false,
      providerCustomerId: 'cus_1', providerSubscriptionId: 'sub_1', providerPriceId: 'price_core_m',
      entitlementEnd: null, renewalDate: '2026-07-01T00:00:00.000Z', lastVerifiedAt: now.toISOString(),
    });
  });

  it('puts the period end on entitlementEnd (never renewalDate) once the subscription is cancelled', () => {
    const periodEnd = Math.floor(new Date('2026-07-01T00:00:00.000Z').getTime() / 1000);
    const result = resolveStripeSubscriptionPatch({
      priceId: 'price_core_m', stripeStatus: 'canceled', cancelAtPeriodEnd: true,
      customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: periodEnd, priceIdMap,
    });
    expect(result.patch?.status).toBe('cancelled');
    expect(result.patch?.renewalDate).toBeNull();
    expect(result.patch?.entitlementEnd).toBe('2026-07-01T00:00:00.000Z');
  });

  it('carries cancelAtPeriodEnd through unchanged for a still-live subscription set to cancel later', () => {
    const result = resolveStripeSubscriptionPatch({
      priceId: 'price_core_m', stripeStatus: 'active', cancelAtPeriodEnd: true,
      customerId: 'cus_1', subscriptionId: 'sub_1', currentPeriodEnd: null, priceIdMap,
    });
    expect(result.patch?.status).toBe('active');
    expect(result.patch?.cancelAtPeriodEnd).toBe(true);
  });
});

describe('buildPastDuePatch', () => {
  it('returns only status and lastVerifiedAt, never touching plan/billingSource', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(buildPastDuePatch(now)).toEqual({ status: 'past_due', lastVerifiedAt: now.toISOString() });
  });
});
