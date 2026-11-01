# Apple App Store / Google Play subscription mapping — design only

**2026-11-01 status correction: the repo DOES contain an Expo/React Native
native app under `mobile/`, with `mobile/eas.json`, `mobile/app.json`,
and limited Phase 1 tabs (Pulse/Check-in/Reset).** Earlier claims below
that no native iOS/Android app exists are historical and no longer true.
The mobile app does **not** yet implement native App Check, Nova's complete
journey, StoreKit/Play Billing, receipt verification or store server
notifications. This remains a **design**, not a deployed billing flow.

The existing `entitlements.ts` subscription model is designed to share
one entitlement across web, iOS and Android regardless of where it was
purchased, but payment receipts, store webhooks, restore purchases and
real-device testing still need implementation. The current pricing table
(Free/Core/Performance/Executive at £0/£34.99/£49.99/£69.99 monthly)
is **not** the latest proposed commercial price architecture; see
`docs/MOBILE_FIRST_RELEASE_AND_PRICING_RECONCILIATION.md` before
creating any storefront product IDs or charging users. No real store
account or required API credential has been verified in this review.

## The shared target: one entitlement record, three possible sources

Whichever store a customer subscribes through, the result should be the
identical `entitlements/status` shape Stripe writes
(`plan`/`status`/`billingSource`/`providerCustomerId`/
`providerSubscriptionId`/`providerProductId`/`providerPriceId`/
`lastVerifiedAt`) — `billingSource: 'apple'` or `'google'` instead of
`'stripe'`, same fields otherwise. `resolvePlanFromPriceId` in
`entitlements.ts` is provider-agnostic by design: it takes whatever
identifier a provider uses (a Stripe price ID, an Apple product ID, a
Google Play product ID/base-plan ID) and a map to `PriceMapping`, so the
same function serves all three once each provider's own product IDs are
configured.

## Products to create

Mirroring the three Stripe products in `docs/STRIPE_PRODUCTS.md` exactly
(same three paid tiers, same monthly/annual cadence, same launch prices
converted to each store's currency/rounding conventions — App Store
Connect and Play Console both require setting a price tier per region
rather than an exact figure, so the GBP figures in
`entitlements.ts`'s `PLAN_PRICING` are the source of truth to round to,
not a separate number to invent):

- **App Store Connect** (historical price-tier design; reconcile before creation): 3 auto-renewable subscription products (Core,
  Performance, Executive), each offered at both a monthly and annual
  duration — Apple's subscription groups let one group contain
  multiple durations of the same conceptual product, so a single
  subscription group per tier (not per tier×cadence) is the natural
  fit, letting a customer switch monthly↔annual within the same tier
  without it looking like a downgrade to a different group.
- **Google Play Console** (historical price-tier design; reconcile before creation): 3 subscription products (Core, Performance,
  Executive), each with a monthly and an annual base plan.

## Apple: receipt verification + Server Notifications v2

1. **Client side** (not built — the Expo iOS app has no StoreKit purchase integration yet):
   after a successful `SKPaymentTransaction`/StoreKit 2 purchase, the app
   would send the resulting signed transaction/receipt to a new
   `POST /api/billing/apple/verify-purchase` alongside the caller's
   Firebase auth token.
2. **Server side** (not built): verify the receipt/JWS against Apple's
   servers using an App Store Connect API key (not the deprecated
   shared-secret verifyReceipt endpoint, which Apple is deprecating in
   favour of the App Store Server API), then resolve the product ID via
   `resolvePlanFromPriceId` and write the entitlement record as above.
3. **App Store Server Notifications v2** (not built): a webhook endpoint
   Apple calls on renewal/cancellation/refund/price-increase-consent
   events, JWS-signed by Apple — verify the signature, then handle
   `SUBSCRIBED`, `DID_RENEW`, `EXPIRED`, `DID_CHANGE_RENEWAL_STATUS`
   (maps to `cancelAtPeriodEnd`), and `REFUND` by updating the same
   entitlement record. This is the primary way Apple keeps a subscription
   state current server-side without the client needing to be open.

## Google Play: Developer API + Real-time Developer Notifications

1. **Client side** (not built — no Android app exists in this repo to
   modify): after a successful Google Play Billing purchase, the app
   would send the resulting purchase token to a new
   `POST /api/billing/google/verify-purchase` alongside the caller's
   Firebase auth token.
2. **Server side** (not built): verify the purchase token against the
   Play Developer API (`purchases.subscriptionsv2.get`) using a Google
   Cloud service account with the Play Developer API enabled, resolve the
   base-plan/product ID via `resolvePlanFromPriceId`, write the
   entitlement record.
3. **Real-time Developer Notifications** (not built): a Pub/Sub topic
   Google publishes subscription lifecycle events to
   (`SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_CANCELED`,
   `SUBSCRIPTION_ON_HOLD`, etc.) — a Cloud Run/Cloud Function subscriber
   would verify and process these the same way the Stripe/Apple webhooks
   do, keeping the entitlement record current without requiring the app
   to be open.

## Cross-platform "restored purchase" design

A customer who subscribed on iOS and later signs into Blaze Break on the
web should see their Performance (or whichever tier) access without
re-purchasing — this already works today for free, structurally, because
entitlement is looked up by Firebase uid, not by platform: whichever
provider's webhook/verification wrote the record, every platform reads
the identical `entitlements/status` doc. The one piece that genuinely
needs building when mobile apps exist is the **restore-purchases button**
each store's guidelines require (Apple explicitly requires a visible
"Restore Purchases" action) — server-side, this would just re-run the
same verify-purchase route the original purchase used, which is
idempotent by design (writing the same resolved plan/status again is a
no-op in effect).

## What this document deliberately does not do

It does not create or extend the existing Expo iOS/Android app,
does not install any Apple/Google SDK, does not add a live verification
route, and does not guess at App Store Server API / Play Developer API
response shapes beyond what's documented in each platform's own public
API reference. See `docs/OUTSTANDING_TASKS.md` for the manual
App-Store-Connect/Play-Console configuration checklist this already
lists as a prerequisite.
