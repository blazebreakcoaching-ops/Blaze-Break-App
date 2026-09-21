# Stripe product/price mapping — design only, not a live integration

**There is no `stripe` npm dependency in `package.json`, no Stripe account
configured anywhere in this codebase, and no webhook handler.** This
document is the design for the price-ID-to-plan mapping a real Stripe
integration would plug into `entitlements.ts`'s adapter boundary —
written so that work is scoped and bounded, not built speculatively
against credentials that don't exist (the same reasoning
`billing-adapter.ts` already gives for Enterprise billing, and
`docs/FREE_PREMIUM_ENTITLEMENTS.md`'s "What real Stripe/Apple/Google
wiring would add" section gives for the webhook handler itself). Nothing
in this file is deployed or callable today.

## The mapping shape (already built, unwired)

`entitlements.ts` exports:

```ts
export interface PriceMapping {
  plan: Exclude<EntitlementPlan, 'legacy_premium'>;
  cadence: 'monthly' | 'annual';
}

export const resolvePlanFromPriceId = (
  priceId: string,
  priceIdMap: Record<string, PriceMapping>
): PriceMapping | null => priceIdMap[priceId] ?? null;
```

`legacy_premium` is deliberately excluded from `PriceMapping`'s `plan`
type — no real Stripe price should ever resolve to it; it is a read-path
migration outcome only (see `docs/LEGACY_CUSTOMER_MIGRATION.md`), never
something a checkout or webhook assigns.

The `priceIdMap` itself is intentionally **not** hardcoded in this file
or in `entitlements.ts` — real Stripe price IDs are environment-specific
(test mode vs. live mode have entirely different IDs) and shouldn't be
compiled into the codebase. When Stripe is actually wired up, the map
should be built from environment variables (matching this codebase's
existing `.env.example` convention for every other provider credential),
one entry per price:

```
STRIPE_PRICE_CORE_MONTHLY=price_...
STRIPE_PRICE_CORE_ANNUAL=price_...
STRIPE_PRICE_PERFORMANCE_MONTHLY=price_...
STRIPE_PRICE_PERFORMANCE_ANNUAL=price_...
STRIPE_PRICE_EXECUTIVE_MONTHLY=price_...
STRIPE_PRICE_EXECUTIVE_ANNUAL=price_...
```

(No Free price — Free has no Stripe product at all, matching
`PLAN_PRICING.free.annualGbp === null` in `entitlements.ts`.)

## Products/prices to create in the Stripe Dashboard

Three products (one per paid tier — Free is not a Stripe product), each
with two recurring prices (monthly, annual), matching the launch figures
in `entitlements.ts`'s `PLAN_PRICING` / `docs/FREE_PREMIUM_ENTITLEMENTS.md`
exactly:

| Product | Monthly price | Annual price |
|---|---|---|
| Blaze Break Core | £34.99/month | £349/year |
| Blaze Break Performance | £49.99/month | £499/year |
| Blaze Break Executive | £69.99/month | £699/year |

These are the agreed launch prices; this document does not propose
changing them (see the final report for a flagged concern, if any, rather
than a silent change here).

## Checkout Session design

A `POST /api/billing/checkout-session` (not built) would:

1. `authenticateFirebaseUser` — the caller must already have a Blaze
   Break account (this app's anonymous-then-linked auth pattern, see
   `src/lib/auth.tsx`).
2. Accept a `priceId` from a fixed, server-side allowlist built from the
   env vars above — never an arbitrary client-supplied Stripe price ID,
   to prevent a client requesting an unlisted/discounted price.
3. Create a Stripe Checkout Session with `client_reference_id` (or
   `metadata.firebaseUid`) set to the caller's Firebase uid — this is how
   the webhook below knows which `users/{uid}/entitlements/status` doc to
   write to, without trusting anything the client sends at webhook time.
4. Return the Checkout Session URL for the client to redirect to.

## Webhook handler design

A `POST /api/webhooks/stripe` (not built) would:

1. Verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` via
   `stripe.webhooks.constructEvent` — never trust an unsigned request
   claiming to be Stripe.
2. Be idempotent on Stripe's own event ID, via a `webhook_events/{eventId}`
   create-once Firestore doc — the identical idempotency-key pattern this
   codebase already uses for guardian alerts
   (`guardian_alerts` idempotency, see `guardian-alert.route.test.ts`),
   so a duplicate delivery (Stripe's own retry behaviour) never double-
   applies an entitlement change.
3. Handle at minimum:
   - `checkout.session.completed` — resolve the price ID via
     `resolvePlanFromPriceId`, write `plan`/`status: 'active'`/
     `billingSource: 'stripe'`/`providerCustomerId`/
     `providerSubscriptionId`/`providerPriceId`/`lastVerifiedAt` into
     `entitlements/status` for the uid in `client_reference_id`.
   - `customer.subscription.updated` — re-resolve plan/status (covers
     upgrades, downgrades, and `cancel_at_period_end` toggling —
     `cancelAtPeriodEnd` in the entitlement record maps directly to
     Stripe's own field of the same meaning).
   - `customer.subscription.deleted` — `status: 'cancelled'`.
   - `invoice.payment_failed` — `status: 'past_due'`, which
     `hasPaidEntitlement()` already treats as access-ending immediately
     (a deliberate, conservative, already-documented product decision —
     see `docs/FREE_PREMIUM_ENTITLEMENTS.md` — not something this
     document changes).
4. All three ultimately write the same shape into `entitlements/status`
   that Apple/Google webhooks would (see `docs/MOBILE_SUBSCRIPTIONS.md`)
   — nothing else in the app needs to change when any provider is added,
   that's the entire point of the `EntitlementProvider` adapter boundary.

## What this document deliberately does not do

It does not install the `stripe` npm package, does not add a live route,
does not fabricate a working checkout, and does not guess at Stripe API
behaviour beyond what's documented in Stripe's own public API reference.
Building the handler above against a real (even test-mode) Stripe account
is the next real step when picked up — see
`docs/OUTSTANDING_TASKS.md` for the manual account-configuration
checklist this already lists.
