# Stripe product/price mapping — real code, mock-tested, not live-verified

**Update:** the checkout-session and webhook routes this document
describes are now real, built, and fully mock-tested code — `stripe` is a
real npm dependency, `POST /api/billing/checkout-session` and
`POST /api/webhooks/stripe` both exist in `server.ts`, and the pure
price/status-resolution logic lives in `stripe-billing.ts`
(`stripe-billing.test.ts`, `stripe-billing.route.test.ts`). **What has
NOT changed: there is still no real Stripe account, and no
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*` configured
anywhere** - both routes fail closed with a clear "not configured" 503
until those exist (see `.env.example`). Everything below was tested by
mocking the `stripe` SDK's documented shapes, the same way every other
provider in this codebase (Gemini, Firebase, Twilio) is mocked in tests -
it has never been run against Stripe's real API, even in test mode. The
original design (left below, unchanged except for this notice) was
checked line-by-line against the real `entitlements.ts` code before this
batch started and the implementation follows it exactly - no mapping,
price figure, or event-handling decision here was improvised.

The one thing still genuinely missing before this can go live: a real
Stripe account with the three products/six prices below actually created,
and its real secret/webhook-signing keys in the deployed environment's
secrets (see `docs/OUTSTANDING_TASKS.md`). That step was explicitly out of
scope for this batch - it requires a commercial decision (a real Stripe
account, real prices going live) this document's own original text
flagged as needing separate approval, not something to do speculatively
inside a code-writing pass.

## The mapping shape (now wired into stripe-billing.ts)

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

## Checkout Session (built)

`POST /api/billing/checkout-session` (`server.ts`):

1. `authenticateFirebaseUser` — the caller must already have a Blaze
   Break account (this app's anonymous-then-linked auth pattern, see
   `src/lib/auth.tsx`).
2. Accepts a `priceId` from a fixed, server-side allowlist built from the
   env vars above (`buildPriceIdMap` in `stripe-billing.ts`) — never an
   arbitrary client-supplied Stripe price ID, to prevent a client
   requesting an unlisted/discounted price.
3. Creates a Stripe Checkout Session with `client_reference_id` set to
   the caller's Firebase uid — this is how the webhook below knows which
   `users/{uid}/entitlements/status` doc to write to, without trusting
   anything the client sends at webhook time.
4. Returns the Checkout Session URL for the client to redirect to.

## Webhook handler (built)

`POST /api/webhooks/stripe` (`server.ts`), fed raw (unparsed) request
bodies by a dedicated `express.raw()` branch in the body-parser routing
near the top of the file — `stripe.webhooks.constructEvent` verifies the
`Stripe-Signature` header against the exact bytes Stripe sent, which a
re-serialized JSON body (even byte-identical) would fail:

1. Verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` via
   `stripe.webhooks.constructEvent` — never trusts an unsigned request
   claiming to be Stripe; a bad signature is rejected with 400.
2. Is idempotent on Stripe's own event ID, via a `webhook_events/{eventId}`
   create-once Firestore doc — the identical idempotency-key pattern this
   codebase already uses for guardian alerts
   (`guardian_alerts` idempotency, see `guardian-alert.route.test.ts`),
   so a duplicate delivery (Stripe's own retry behaviour) never double-
   applies an entitlement change.
3. Handles exactly the four events this document always specified, via
   `stripe-billing.ts`'s pure `resolveStripeSubscriptionPatch`/
   `buildPastDuePatch`:
   - `checkout.session.completed` — retrieves the full subscription (the
     checkout session itself doesn't carry a price ID), resolves its
     price via `resolvePlanFromPriceId`, and writes `plan`/`status`/
     `billingSource: 'stripe'`/`providerCustomerId`/
     `providerSubscriptionId`/`providerPriceId`/`lastVerifiedAt` into
     `entitlements/status` for the uid in `client_reference_id`.
   - `customer.subscription.updated` — re-resolves plan/status (covers
     upgrades, downgrades, and `cancel_at_period_end` toggling —
     `cancelAtPeriodEnd` in the entitlement record maps directly to
     Stripe's own field of the same meaning). Resolves the uid from
     `subscription.metadata.firebaseUid` when present, otherwise by
     looking up the existing entitlement record carrying the same
     `providerCustomerId` (this event never carries
     `client_reference_id` — that field only ever exists on the
     Checkout Session itself).
   - `customer.subscription.deleted` — same resolver; Stripe sends
     `status: 'canceled'` on the subscription object itself, which maps
     to `status: 'cancelled'` and sets `entitlementEnd` to the period end.
   - `invoice.payment_failed` — a narrower, merge-only patch
     (`buildPastDuePatch`): flips only `status` to `'past_due'` via the
     same `providerCustomerId` lookup, never touching `plan` (the invoice
     doesn't reliably carry one) - `hasPaidEntitlement()` already treats
     `past_due` as access-ending immediately (a deliberate, conservative,
     already-documented product decision — see
     `docs/FREE_PREMIUM_ENTITLEMENTS.md` — not something this batch
     changes).
4. All four ultimately write the same shape into `entitlements/status`
   that Apple/Google webhooks would (see `docs/MOBILE_SUBSCRIPTIONS.md`)
   — nothing else in the app needs to change when any provider is added,
   that's the entire point of the `EntitlementProvider` adapter boundary.
   An event whose price ID isn't in the allowlist (or any other
   unresolvable event) is logged and skipped, never writing a half-formed
   entitlement — but is still marked processed in `webhook_events`, since
   the *delivery* was handled correctly even if its data wasn't
   actionable.

## What is still deliberately not done

This batch does not create a real Stripe account, does not configure any
real `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*` value
anywhere, and does not run against Stripe's real API even in test mode —
that is a commercial/account-setup step or the next phase of work, see
`docs/OUTSTANDING_TASKS.md` for the manual account-configuration
checklist. It also does not add a Command Centre UI tab for any of this
(same discipline as every other Operations Intelligence Hub batch this
session) and does not touch Apple/Google mobile subscriptions
(`docs/MOBILE_SUBSCRIPTIONS.md`, explicitly staged after web Stripe in
`docs/FINANCIAL_OPERATIONS.md`).
