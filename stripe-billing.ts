// Financial Operations - Stripe web checkout + webhook handler (pure logic).
//
// This is the real-code follow-up to docs/STRIPE_PRODUCTS.md's design (which
// stays accurate - this file implements exactly what that document specified,
// nothing more). server.ts owns the I/O: the lazy Stripe client, the raw-body
// webhook route, the Firestore read/write into users/{uid}/entitlements/status,
// and webhook_events/{eventId} idempotency (mirroring the guardian-alert
// idempotency-key-as-document-ID pattern). This file is the pure, fully unit-
// tested math in between - resolving a price ID or Stripe subscription status
// into the EntitlementRecord patch this app's existing entitlements.ts model
// already expects, so nothing downstream needs to know a Stripe webhook wrote
// it rather than an admin grant.
//
// IMPORTANT: this still cannot be live-verified against a real Stripe account
// from this environment - there is no STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET
// configured anywhere, same as every other provider credential in this
// codebase before it goes live. Mock-tested against the `stripe` SDK's
// documented shapes, not run against Stripe's real API.

import { EntitlementPlan, EntitlementStatus, PriceMapping, resolvePlanFromPriceId } from './entitlements';

// ---- Price ID allowlist ----------------------------------------------------
// Built from environment variables, never hardcoded - test vs. live Stripe
// mode have entirely different price IDs (docs/STRIPE_PRODUCTS.md). An
// env var that isn't set is simply omitted, not a crash - lets a deploy go
// live with fewer than all six prices configured (e.g. monthly-only at
// first) without every other route breaking.
const PRICE_ENV_KEYS: Record<string, PriceMapping> = {
  STRIPE_PRICE_CORE_MONTHLY: { plan: 'core', cadence: 'monthly' },
  STRIPE_PRICE_CORE_ANNUAL: { plan: 'core', cadence: 'annual' },
  STRIPE_PRICE_PERFORMANCE_MONTHLY: { plan: 'performance', cadence: 'monthly' },
  STRIPE_PRICE_PERFORMANCE_ANNUAL: { plan: 'performance', cadence: 'annual' },
  STRIPE_PRICE_EXECUTIVE_MONTHLY: { plan: 'executive', cadence: 'monthly' },
  STRIPE_PRICE_EXECUTIVE_ANNUAL: { plan: 'executive', cadence: 'annual' },
};

// Maps real Stripe price IDs (the env values) to their plan/cadence -
// this map's own keys ARE the server-side allowlist the checkout-session
// route validates a client-supplied priceId against, exactly as
// docs/STRIPE_PRODUCTS.md specifies ("never an arbitrary client-supplied
// Stripe price ID").
export function buildPriceIdMap(env: Record<string, string | undefined> = process.env): Record<string, PriceMapping> {
  const map: Record<string, PriceMapping> = {};
  for (const [envKey, mapping] of Object.entries(PRICE_ENV_KEYS)) {
    const priceId = env[envKey];
    if (priceId) map[priceId] = mapping;
  }
  return map;
}

export { resolvePlanFromPriceId };

// ---- Status mapping ---------------------------------------------------
// Stripe's own subscription statuses: incomplete, incomplete_expired,
// trialing, active, past_due, canceled, unpaid, paused. This app's
// EntitlementStatus vocabulary (entitlements.ts) is deliberately smaller -
// every Stripe status maps onto it rather than widening the app's own
// model to match a specific provider's vocabulary (the whole point of the
// EntitlementProvider adapter boundary). incomplete/incomplete_expired/
// paused all map to 'expired' - none of them represent a subscription that
// should grant access.
export function mapStripeSubscriptionStatus(stripeStatus: string): EntitlementStatus {
  switch (stripeStatus) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled': return 'cancelled';
    default: return 'expired';
  }
}

// ---- Price extraction from a Stripe subscription object -------------------
// Modern Stripe API versions return `price` as a full expanded object on
// each subscription item by default (no `expand` param needed) - this
// reads only the one field this app actually needs, and degrades to null
// (never throws) if the shape is ever different than expected.
export function extractPriceIdFromSubscriptionItems(
  items: { data?: Array<{ price?: { id?: string } | string | null }> } | null | undefined
): string | null {
  const first = items?.data?.[0]?.price;
  if (!first) return null;
  if (typeof first === 'string') return first;
  return typeof first.id === 'string' ? first.id : null;
}

// ---- Subscription event -> entitlement patch -------------------------------
// Covers checkout.session.completed (after server.ts retrieves the full
// subscription) and customer.subscription.updated/deleted - all three are
// "here is the current state of a subscription" events, and Stripe sends
// status: 'canceled' on the subscription object itself for a deletion, so
// one resolver correctly handles all three rather than three near-duplicate
// ones.
export interface StripeSubscriptionEventInput {
  priceId: string | null;
  stripeStatus: string;
  cancelAtPeriodEnd: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: number | null; // Stripe's native unix-seconds shape
  priceIdMap: Record<string, PriceMapping>;
}

export interface StripeEntitlementPatch {
  plan: EntitlementPlan;
  status: EntitlementStatus;
  billingSource: 'stripe';
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPriceId: string | null;
  entitlementEnd: string | null;
  renewalDate: string | null;
  lastVerifiedAt: string;
}

export interface StripeSubscriptionResolution {
  ok: boolean;
  reason?: 'missing_price_id' | 'unknown_price_id';
  patch?: StripeEntitlementPatch;
}

export function resolveStripeSubscriptionPatch(
  input: StripeSubscriptionEventInput,
  now: Date = new Date()
): StripeSubscriptionResolution {
  if (!input.priceId) return { ok: false, reason: 'missing_price_id' };
  const mapping = resolvePlanFromPriceId(input.priceId, input.priceIdMap);
  if (!mapping) return { ok: false, reason: 'unknown_price_id' };

  const status = mapStripeSubscriptionStatus(input.stripeStatus);
  const periodEndIso = typeof input.currentPeriodEnd === 'number' ? new Date(input.currentPeriodEnd * 1000).toISOString() : null;

  return {
    ok: true,
    patch: {
      plan: mapping.plan,
      status,
      billingSource: 'stripe',
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      providerCustomerId: input.customerId,
      providerSubscriptionId: input.subscriptionId,
      providerPriceId: input.priceId,
      // A still-live subscription's period end is its next renewal date; a
      // cancelled one's is when access actually stops - never both at once.
      entitlementEnd: status === 'cancelled' ? periodEndIso : null,
      renewalDate: status === 'cancelled' ? null : periodEndIso,
      lastVerifiedAt: now.toISOString(),
    },
  };
}

// ---- invoice.payment_failed -------------------------------------------
// Deliberately NOT a full resolveStripeSubscriptionPatch-shaped patch -
// this event doesn't carry a reliable price/plan on the invoice itself,
// and docs/STRIPE_PRODUCTS.md's design only asks for one thing here:
// flip status to 'past_due' on the existing record (which
// hasPaidEntitlement() in entitlements.ts already treats as access-ending
// immediately - the documented, deliberately conservative fail-closed
// behaviour, unchanged by this file). A merge-only patch, not a full
// record, so plan/billingSource/provider IDs already on file are left
// untouched.
export interface PastDuePatch {
  status: 'past_due';
  lastVerifiedAt: string;
}

export function buildPastDuePatch(now: Date = new Date()): PastDuePatch {
  return { status: 'past_due', lastVerifiedAt: now.toISOString() };
}
