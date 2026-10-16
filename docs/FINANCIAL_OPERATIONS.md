# Financial Operations

Batch 1 for the "Financial Operations" capability from the Operations
Intelligence Hub audit - planning only, no code. This is the one
capability of the original nine that stayed explicitly blocked through
every other batch this session: there is no live payment processor
anywhere in this codebase, and activating one is a commercial decision
(processor choice, pricing go-live, real customer charges) the master
prompt's own guardrail reserves for explicit approval - "Do not activate
new paid tiers without explicit commercial approval," "Do not create
products, replace prices, alter subscriptions, or charge customers
without explicit approval." Nothing in this document installs a package,
adds a route, or can process a real payment.

## What already exists (verified against the real code, not assumed)

Before writing anything new, this batch checked what's actually there -
and found the groundwork is already thorough and accurate:

- **`entitlements.ts`** has a real, server-authoritative four-tier model
  (Free/Core/Performance/Executive) with an explicit adapter boundary:
  `EntitlementProvider` (today only `NullEntitlementProvider`, which
  never pretends a purchase was verified) and `resolvePlanFromPriceId` -
  a pure, provider-agnostic lookup from *any* provider's price/product
  ID to a `{ plan, cadence }` pair, already built and unit-tested.
  `PLAN_PRICING` is the one real source of truth for the launch prices
  (Core £34.99/mo or £349/yr, Performance £49.99/mo or £499/yr,
  Executive £69.99/mo or £699/yr; Free has no price at all).
- **`docs/STRIPE_PRODUCTS.md`** is a complete, accurate design for the
  web checkout + webhook handler: the exact products/prices to create in
  the Stripe Dashboard, the `STRIPE_PRICE_*` env-var shape the price map
  should load from (never hardcoded - test vs. live mode have different
  IDs), a `POST /api/billing/checkout-session` design (server-side price
  allowlist, `client_reference_id` set to the Firebase uid), and a
  `POST /api/webhooks/stripe` design (signature verification,
  idempotency on Stripe's event ID via the same `webhook_events/{eventId}`
  create-once pattern this codebase already uses for guardian alerts, and
  the four events that matter:
  `checkout.session.completed`/`customer.subscription.updated`/
  `customer.subscription.deleted`/`invoice.payment_failed`).
- **`docs/MOBILE_SUBSCRIPTIONS.md`** extends the identical model to Apple
  App Store and Google Play in-app purchases, so "one membership works
  across web, iOS, and Android" is a real design, not an assumption -
  same `entitlements/status` shape, `billingSource: 'apple'`/`'google'`
  instead of `'stripe'`.
- **`docs/OUTSTANDING_TASKS.md`** already lists the manual
  account-configuration checklist for whichever provider is picked up
  first (Stripe Dashboard products/prices, webhook endpoint URL,
  `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` via Secret Manager - same
  pattern every other provider credential in this codebase already uses).
- **`billing-adapter.ts`** (B2B/Enterprise org seats) is a *separate*
  system from consumer entitlements above - real seat-limit enforcement
  today, with its own `NullBillingProvider` stand-in. Do not confuse the
  two when picking this up; `docs/BILLING_ADMIN.md` covers that one.

Nothing here needed correcting - the existing design was checked line by
line against the real `entitlements.ts` code (price figures, the
`PriceMapping` type, `resolvePlanFromPriceId`'s signature) and matches
exactly.

## Staged rollout, in order

1. **Pick the processor and get real credentials.** Nothing below can be
   built against real behaviour until a Stripe (or Apple/Google) account
   with test-mode keys exists - building a webhook signature-verification
   handler against credentials that don't exist produces unverifiable
   code, not a real integration. This is the one step this document asks
   for approval on.
2. **Stripe web checkout first**, not mobile. It's the simplest of the
   three (no app-store review cycle, no native build pipeline, and this
   codebase already has no iOS/Android app referenced anywhere), and
   every other provider converges on the same `entitlements/status`
   shape once it exists - a strong smoke test for the adapter boundary
   itself before extending it.
3. **The webhook handler, built and tested against Stripe's test mode**
   (its CLI can replay real event payloads) before anything goes live -
   `checkout.session.completed` first (the only one that activates a new
   subscription), then `customer.subscription.updated`/`deleted`, then
   `invoice.payment_failed` last (the conservative `past_due`
   fail-closed behaviour `docs/OUTSTANDING_TASKS.md` already flags as a
   product decision worth revisiting once real renewal-failure data
   exists).
4. **Apple/Google mobile subscriptions**, once web Stripe is live and
   proven - each needs its own provider credential (App Store Connect
   API key; Play service-account key) neither of which exists yet, and
   each is meaningfully more work (receipt/JWS verification, native
   store review) than the web path.
5. **Organisation-sponsored auto-provisioning** (`billingSource:
   'organisation'` already exists in the schema, not wired to
   automatically grant/revoke when someone joins/leaves a
   Premium-sponsoring org) - deliberately last, since it bridges two
   already-separate systems (consumer entitlements and Enterprise org
   billing) and has no urgency until paid consumer billing is real.

## Decisions this document is explicitly surfacing, not making

- **Which processor to start with.** Stripe is the natural first pick
  for this stack (web-first product, no existing mobile app to integrate
  against) - but that's a recommendation, not a decision made here.
- **Test-mode-first rollout, or a faster path.** This document assumes
  building and proving the webhook handler in Stripe test mode before
  any real charge happens - the safer default, not the only option.
- **Whether the existing launch prices (Core/Performance/Executive)
  still hold**, or whether anything should change before going live with
  them for real. This document does not propose changing them.
- **The `past_due` grace-period behaviour** noted above - fail-closed
  today, worth revisiting with real data once live billing exists, not
  something to change speculatively now.

## What this document deliberately does not do

It does not install `stripe` or any billing SDK, does not add a live
route or webhook handler, does not create a Stripe/Apple/Google account,
and does not change any price, plan, or entitlement logic. The next real
step, once the processor and credentials are chosen, is building
`POST /api/billing/checkout-session` and `POST /api/webhooks/stripe`
against `docs/STRIPE_PRODUCTS.md`'s design - that is real engineering
work for a future, separately-approved batch, not something to begin
speculatively here.

## Batch 2: the code now exists (still not live)

Step 2-3 of the staged rollout above ("Stripe web checkout first," "the
webhook handler, built and tested") are now real, shipped code -
`stripe-billing.ts` (pure price/status resolution, fully unit-tested),
`POST /api/billing/checkout-session`, and `POST /api/webhooks/stripe` in
`server.ts`, both mock-tested against the `stripe` SDK's documented
shapes. See `docs/STRIPE_PRODUCTS.md`'s updated header for the exact
detail. Step 1 - "pick the processor and get real credentials" - is
still explicitly NOT done: there is no Stripe account, and the six
`STRIPE_PRICE_*`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` env vars
(`.env.example`) are all blank in every environment, so both routes
return a 503 "not configured" today. Steps 4 (Apple/Google) and 5
(organisation-sponsored auto-provisioning) remain exactly as staged -
untouched by this batch.
