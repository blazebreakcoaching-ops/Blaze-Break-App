# Free / Premium Entitlements

Blaze Break has exactly two consumer tiers:

- **Free** — £0.
- **Blaze Break Premium** — £19.99/month or £179/year. Monthly vs. annual
  is a billing cadence, not a separate tier.

One Premium membership is meant to work across web, iOS, and Android,
regardless of where it was purchased (Stripe on web, Apple App Store, or
Google Play). This document describes what actually exists today, what's
deliberately deferred, and what real Stripe/Apple/Google integration would
require.

## The problem this replaced

Before this work, "Premium" was a UI-only concept:

- The tier value the app actually read was `stats.profile?.subscription`,
  loaded from `users/{uid}/user_stats/core` — and `firestore.rules`
  allowed a client to write anything into that document's `profile` map
  with no key or value validation. A user could open devtools and write
  `{profile: {subscription: 'pro'}}` directly via the Firestore SDK and
  unlock every UI-gated feature.
- No server route checked tier at all. Nova voice, diagnose, and every
  other feature were reachable by any authenticated user regardless of
  what the sidebar showed.
- There was no payment provider wired up anywhere (`billing-adapter.ts`
  already documented this honestly for the Enterprise org-billing side;
  the same was true, undocumented, for consumer billing).

Both are fixed: the client-writable field can no longer hold `subscription`
(`firestore.rules`, the `user_stats/core` "AA" rule), and there is now a
real server-authoritative entitlement record that every expensive route
actually checks.

## The entitlement model (`entitlements.ts`)

Stored at `users/{uid}/entitlements/status` — the same document that
already held a user's platform-admin `role`, and already had
`allow write: if false` in `firestore.rules` (backend/Admin SDK only,
never client-writable). The record:

```ts
{
  plan: 'free' | 'premium',
  status: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired',
  billingSource: 'stripe' | 'apple' | 'google' | 'organisation' | 'admin' | null,
  entitlementStart: string | null,   // ISO 8601
  entitlementEnd: string | null,     // ISO 8601, null = no fixed end
  renewalDate: string | null,        // ISO 8601
  lastVerifiedAt: string | null,     // ISO 8601
}
```

`hasPremiumEntitlement(record, now)` is the one question every route asks:
plan must be `'premium'`, status must be `'active'`, `'trial'`, or
`'grace'` (a deliberate choice to fail closed on `'past_due'` rather than
Stripe's own default of keeping access through a retry window — revisit
once real renewal-failure data exists), and `entitlementEnd` (if set) must
not have passed. A missing or malformed record defaults to Free/active —
which is also, honestly, what every account has today, since nothing was
ever enforced before this.

`GET /api/entitlements/me` lets the client read its own effective
plan/status/capabilities — informational only; nothing trusts what the
client does with it, since every gated route re-checks server-side.

## Capability quotas

Rather than `if (premium)` scattered through routes and components, each
expensive/fair-use-relevant feature is a capability with independent
Free/Premium daily limits (`entitlements.ts`'s `CAPABILITIES` map):

| Capability | Free (daily) | Premium (daily) |
|---|---|---|
| `nova_text` (Nova chat messages) | 40 | 400 |
| `nova_voice` (Live voice sessions) | 1 | 20 |
| `diagnose` (AI narrative on the check-in - the deterministic scoring itself is always free) | 5 | 50 |
| `exports` (full account data export) | 1 | 20 |

These are **internal operating defaults** — conservative but generous
enough that no real existing usage pattern breaks (nothing was ever
enforced before this branch). They're centrally defined in one file, not
hardcoded per-route, and are meant to be tuned after real production
telemetry exists (see `docs/API_PROVIDER_MAP.md` / the cost-usage admin
view) — not treated as permanent.

Enforcement is a Firestore-backed daily counter
(`users/{uid}/usage_counters/{YYYY-MM-DD}`, itself
`allow read, write: if false` in rules — a client that could read or reset
its own counter could defeat the whole system), incremented on each
allowed use via `checkAndReserveCapability()` in `server.ts`. This is a
soft, best-effort guard, not a billing-grade lock: a request that's
allowed and a nearly-simultaneous one racing it could both pass. That
trade-off is deliberate — the goal is stopping runaway or abusive usage,
not metering to the exact request (the existing `express-rate-limit`
limiters in this codebase already make the same trade-off).

When a Free account hits a quota:

- **Nova chat** — a clear 429 with a friendly message suggesting Premium.
  There's no meaningful degraded chat experience, so this is a hard stop.
- **Diagnose** — the deterministic archetype/scores always compute
  regardless of quota; only the optional AI narrative is gated, falling
  through to the same static fallback text already used when Gemini
  itself is unavailable. The check-in itself never breaks.
- **Nova Live voice** — the WebSocket handshake refuses with a message
  pointing back to text chat (see `docs/AI_COST_CONTROL.md`).
- **Export** — 429 with a plain "try again tomorrow." The daily limit
  (1/day Free, 20/day Premium) is far more generous than GDPR's own
  "without undue delay, within one month" requirement, so this is abuse
  protection, not a restriction on the underlying data-access right.

## Granting Premium today

**There is no live Stripe/Apple/Google integration in this codebase.**
`billing-adapter.ts` already documented the same honest gap for
Enterprise org billing; `entitlements.ts` follows the identical pattern —
`EntitlementProvider` is an adapter interface, and only
`NullEntitlementProvider` exists. The one real, working way to grant
Premium today is `POST /api/admin/users/:uid/entitlement`
(`requireAdmin`-gated): a platform admin sets `plan`/`status`/optional
`durationDays` by hand. `billingSource` is always forced to `'admin'`
server-side — never taken from the request body — so an admin grant can
never be mistaken for a real provider record a webhook would later
reconcile. This is meant for beta testers, support cases, and manual
comps while no payment processor is live.

### What real Stripe/Apple/Google wiring would add

None of this exists yet; it's scoped here so it's a known, bounded amount
of future work rather than a surprise:

- **Stripe** (web): a `stripe` npm dependency (not currently installed), a
  Checkout Session creation endpoint that sets `client_reference_id` or
  metadata to the Firebase uid, and a `POST /api/webhooks/stripe` handler
  verifying `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` via
  `stripe.webhooks.constructEvent`, idempotent on Stripe's event ID
  (a `webhook_events/{eventId}` create-once doc, same pattern the guardian
  alert idempotency key already uses), handling
  `checkout.session.completed`, `customer.subscription.updated/deleted`,
  and `invoice.payment_failed` by writing the resulting
  plan/status/billingSource: `'stripe'` into `entitlements/status`.
- **Apple App Store**: server-side receipt/JWS verification and App Store
  Server Notifications v2 (Apple's Firebase-format webhook), needing an
  App Store Connect API key.
- **Google Play**: Play Developer API verification and Real-time Developer
  Notifications (Pub/Sub), needing a Play service-account key.
- All three ultimately write the same shape into `entitlements/status`, so
  nothing else in the app needs to change when they're added — that's the
  point of the adapter boundary.

This was **not** built speculatively against providers with no real
account/credentials to test against (same reasoning `billing-adapter.ts`
already gave for org billing) — building an untestable webhook handler
would be worse than an honest gap. See `docs/OUTSTANDING_TASKS.md` for
what to configure in each provider's console when this is picked up.

## Organisation-sponsored access

`billingSource: 'organisation'` exists in the schema for an org's
sponsored-Premium seat, but automatic provisioning/revocation (granting it
when someone joins a Premium-sponsoring org, revoking it when they leave)
is not wired up — today an admin would use the same manual grant endpoint.
This is a deliberate scope line: the existing Enterprise billing system
(`billing-adapter.ts`, `organisations/{orgId}.billing`) governs seats at
the org level and was left untouched; bridging it to individual consumer
entitlements automatically is real, separate work (see
`docs/OUTSTANDING_TASKS.md`). When an employee leaves a sponsoring org,
their organisation-sourced Premium access should end, but their personal
Blaze Break account/Nova/journal data must NOT become organisation
property — this principle was already established for the Enterprise
backend and applies identically here once auto-provisioning is built.

## Tier matrix

| Capability | Free | Premium |
|---|---|---|
| Core account, web/iOS/Android | Yes | Yes |
| Core wellbeing tools (Energy Budget, Recovery Plan, journaling) | Full | Full |
| Nova text | 40 messages/day | 400 messages/day (fair-use) |
| Nova Live voice | 1 session/day | 20 sessions/day (fair-use) |
| Check-in (deterministic scoring) | Full | Full |
| Check-in AI narrative | 5/day | 50/day |
| Data export | 1/day | 20/day |
| History/insights, Ally nudges | Full | Full |

No other permanent feature-level Free/Premium split exists in the product
today beyond these capability quotas — this document is the source of
truth for the matrix, per the hardening brief's instruction not to invent
arbitrary limits where the architecture should instead stay tunable.
