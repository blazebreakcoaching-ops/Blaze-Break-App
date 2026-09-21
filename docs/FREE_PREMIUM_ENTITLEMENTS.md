# Free / Core / Performance / Executive Entitlements

**This document was retitled in place rather than replaced by a new
`B2C_PRICING.md`** — it already carried every cross-reference from
`docs/AI_COST_CONTROL.md`, `docs/API_PROVIDER_MAP.md`,
`docs/OUTSTANDING_TASKS.md`, `docs/OUTSTANDING_SECURITY_ITEMS.md`,
`docs/VENDOR_REGISTER.md`, `docs/SECURITY_ARCHITECTURE.md`, and
`docs/DEPLOY.md`, and the entitlement/capability/pricing content below is
one coherent subject, not several. Splitting it would have meant either
duplicating the capability matrix in two places or forcing every reader
to cross a doc boundary mid-explanation. This is a deliberate decision,
not an oversight — see the final report for the explicit flag.

Blaze Break has **four purchasable consumer tiers**, plus one
non-purchasable legacy tier that exists only for pre-existing customers:

| Tier | Monthly | Annual | Positioning |
|---|---|---|---|
| **Free** | £0 | — | Try Blaze Break for real, not a crippled demo |
| **Core** | £34.99 | £349 (2 months free) | The real product, full tools |
| **Performance** ⭐ *Most Popular* | £49.99 | £499 (2 months free) | Ascending Nova/insight depth for people actively rebuilding |
| **Executive** | £69.99 | £699 (2 months free) | Highest ceilings + Executive-coaching commercial benefits |
| **Legacy Premium** *(not purchasable)* | — | — | Grandfathered landing spot for every account that predates this tier model — see "Legacy Premium" below |

Monthly vs. annual is a billing cadence, not a separate tier. One
membership is meant to work across web, iOS, and Android, regardless of
where it was purchased (Stripe on web, Apple App Store, or Google Play).
**These are the agreed launch prices** (`entitlements.ts`'s `PLAN_PRICING`)
— nothing in this pass changed them; a genuine pricing-strategy concern
found during implementation is flagged in the final report instead of
silently adjusted here, per the product brief's explicit instruction.

**Executive+ is explicitly NOT implemented.** `PLAN_TIER_ORDER` in
`entitlements.ts` is the one place a future tier above Executive would be
inserted.

This document describes what actually exists today, what's deliberately
deferred, and what real Stripe/Apple/Google integration would require.
For the specific facts about legacy customers, see
`docs/LEGACY_CUSTOMER_MIGRATION.md`. For Stripe/Apple/Google product/price
mapping design, see `docs/STRIPE_PRODUCTS.md` and
`docs/MOBILE_SUBSCRIPTIONS.md`. For the exact steps a human takes to grant,
change, or cancel a subscription by hand today, see
`docs/MANUAL_BILLING_ACTIONS.md`.

## A naming collision, flagged rather than silently resolved

**"Executive" already names several unrelated things in this codebase**:
an Energy Budget task-type category, the `ExecutiveBoardReport.tsx`
PDF-report feature (org/manager tooling, unrelated to any personal
subscription tier), an "Executive/Founder" onboarding persona label, and
the pre-existing `executive_report` capability (a personal-insight report,
a *different* feature from `ExecutiveBoardReport.tsx` despite the similar
name). The new **Executive subscription tier** is a fifth, genuinely
distinct use of the same word. None of these were renamed — the product
brief's instruction was to flag the ambiguity rather than silently rename
either concept, since several of these names are already load-bearing UI
copy elsewhere in the product. Anywhere new copy references the
subscription tier, it should say "Executive plan" or "Executive tier"
explicitly rather than a bare "Executive," to avoid reader confusion with
the other four uses.

## The problem this replaced

Before this system existed at all, "Premium" was a UI-only concept:

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
never client-writable; that rule is field-agnostic, so it covers the
widened record shape below with no rule change needed). The record:

```ts
{
  plan: 'free' | 'core' | 'performance' | 'executive' | 'legacy_premium',
  status: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired',
  billingSource: 'stripe' | 'apple' | 'google' | 'organisation' | 'admin' | null,
  entitlementStart: string | null,     // ISO 8601
  entitlementEnd: string | null,       // ISO 8601, null = no fixed end
  renewalDate: string | null,          // ISO 8601
  cancelAtPeriodEnd: boolean,          // told the provider to stop renewing; access continues to entitlementEnd
  providerCustomerId: string | null,
  providerSubscriptionId: string | null,
  providerProductId: string | null,
  providerPriceId: string | null,
  lastVerifiedAt: string | null,       // ISO 8601
}
```

`effectivePlan(record, now)` / `hasPaidEntitlement(record, now)` is the
question every route asks: status must be `'active'`, `'trial'`, or
`'grace'` (a deliberate choice to fail closed on `'past_due'` rather than
Stripe's own default of keeping access through a retry window — revisit
once real renewal-failure data exists), and `entitlementEnd` (if set) must
not have passed; otherwise the account is treated as Free regardless of
the stored `plan` value. A missing or malformed record also defaults to
Free/active.

`GET /api/entitlements/me` lets the client read its own effective
plan/status/capabilities — informational only; nothing trusts what the
client does with it, since every gated route re-checks server-side.
`GET /api/entitlements/pricing` returns the full tier/pricing/capability
matrix for the pricing page, generated from the same tables the quota
checks use, so the page can never drift from what's actually enforced.

## Legacy Premium

Every account whose `entitlements/status` doc predates this revision has
`plan: 'premium'` stored — the entire vocabulary before this tier model
existed. `getEffectiveEntitlement()` transparently coerces that value to
`'legacy_premium'` on every read. **There is no migration script and
never will be one for this purpose** — no batch job touches stored
Firestore documents; the read path itself reinterprets the old value
correctly, permanently. A legacy account is never silently moved onto
`core` or `performance`, and never silently loses access to anything it
already had.

`legacy_premium` is **not** one of the four purchasable plans
(`PURCHASABLE_PLANS` excludes it) and is **not** an accepted value for
`POST /api/admin/users/:uid/entitlement` — it is a read-path outcome only,
never something an admin (or anything else) assigns going forward. An
admin who wants to grant Premium-equivalent access to a *new* account
grants `performance` (the tier `legacy_premium` sits alongside in
`PLAN_TIER_ORDER` for upgrade/downgrade comparisons).

Per-capability, a legacy account keeps its exact old numeric limit
wherever that capability existed before this revision (`nova_text`: 400,
`nova_voice`: 20, `diagnose`: 50, `exports`: 20, `nova_manager_coach`: 30,
`resentment_analysis`: 50, `executive_report`: 50 — all unchanged from
the original Free/Premium figures, verified against the pre-revision
committed values during implementation). For the two capabilities that
are genuinely new (`nova_voice_minutes`, `sms_nudges`), a legacy account
gets a considered default rather than an implicit fallback:
`nova_voice_minutes` is uncapped (`limit: null`) because the old Premium
tier never had any monthly-minutes concept to be bound by — introducing a
cap now, even a generous one, would be a real reduction; `sms_nudges`
gets Performance's 10/month allowance, a new benefit that didn't exist
before and therefore can't be "reducing" anything by existing at a
specific number rather than being unlimited.

See `docs/LEGACY_CUSTOMER_MIGRATION.md` for the full picture, including
the one fact this pass could **not** verify from inside this sandbox (no
live Firestore access): how many real, non-admin-grant legacy records
actually exist in production today, and whether any have a real
`billingSource` (`'stripe'`/`'apple'`/`'google'`) that a currently-nonexistent
webhook would need to keep reconciling once real billing goes live.

## Capability matrix

Every gated or tier-differentiated feature is a capability with
independent per-plan configuration in `entitlements.ts`'s `CAPABILITIES`
map — never `if (plan === 'performance')` scattered through routes or
components. The intended call shape everywhere in the app is
`canUser(plan, capabilityId)` / `getCapability(plan, id)`.

### Real, server-enforced today

These have an actual route/counter behind them — a plan/limit combination
here is really checked, not just descriptive.

| Capability | Free | Core | Performance | Executive | Legacy Premium |
|---|---|---|---|---|---|
| `nova_text` (Nova chat messages/day, fair-use) | 40 | 300 | 600 | 1000 | 400 |
| `nova_voice` (Live voice sessions/day) | 1 | 4 | 10 | 20 | 20 |
| `nova_voice_minutes` (Live voice cumulative minutes/month) | 10 | 60 | 240 | 600 | unlimited |
| `diagnose` (AI narrative on the check-in; deterministic scoring is always free) | 5/day | 30/day | 50/day | 80/day | 50/day |
| `exports` (GDPR Art. 15/20 full data export — see note below) | 1/day | 3/day | 20/day | 20/day | 20/day |
| `nova_manager_coach` (org-manager feature; gated by org role, not personal plan) | 3/day | 3/day | 30/day | 30/day | 30/day |
| `resentment_analysis` | 5/day | 30/day | 50/day | 50/day | 50/day |
| `executive_report` (personal intelligence report — also stands in for "weekly/monthly intelligence report," see below) | 5/day | 30/day | 50/day | 80/day | 50/day |
| `sms_nudges` (tier SMS allowance — separate from Guardian Support, see below) | 0 (push/in-app/email) | 0 (push/in-app/email) | 10/month | 30/month | 10/month |

**`exports` is never a paywall.** The daily limit is abuse protection
against scripted repeated full-account pulls, not a restriction on the
underlying data-access right — Free's 1/day is deliberately still
enabled and was verified against the pre-existing committed figure during
this revision (a bug where Free was briefly set to `enabled: false` was
caught by the test suite and fixed before this ships; see the final
report).

**`nova_voice` (daily session count) and `nova_voice_minutes` (monthly
cumulative minutes) are deliberately two separate capabilities, not one
capability with an extra field.** Before this revision there was no
concept of monthly minutes at all — only a daily session count, each
session separately capped at a fixed per-session ceiling
(`NOVA_LIVE_MAX_SESSION_MS`, unchanged). Nova Live now checks both: the
daily session-count gate at connection start (unchanged mechanism), and
the monthly-minutes gate also at connection start (a session that would
push the account over its monthly minutes doesn't open), with the actual
minutes used recorded at `endSession` via
`minutesUsedForSession(elapsedMs)`, rounding up to the nearest whole
minute.

**"Weekly personalised intelligence report" (Performance) / "monthly
Executive intelligence report" (Executive)** from the product brief are
implemented as increased *access frequency* to the existing, already-
secured `executive_report` capability/route, not as new scheduled/
auto-delivered report infrastructure. Building an actual cron-scheduled,
auto-generated-and-delivered report is real, separate future work — see
`weekly_intelligence`/`monthly_executive_report` below, which declare the
depth difference without inventing that delivery mechanism.

### `sms_nudges` and the Guardian Support exemption

`sms_nudges` sits **alongside**, not in place of, `sms-guardrails.ts`'s
pre-existing aggregate abuse cap (150/month, 20/day, across the
`ally_nudge` and `manual_send` SMS categories) — whichever ceiling is hit
first blocks. Both checks live in the same code path in
`sendTwilioMessage` (`server.ts`), gated by the identical
`usageSubjectToCap` condition that already excluded `guardian_alert` from
the abuse cap before this revision existed.

**Guardian Support SMS (the one-tap guardian call request) is exempt from
both caps, on every tier including Free — this is not a policy applied on
top, it is architecturally impossible for it to be gated**, because
`guardian_alert` never enters the `usageSubjectToCap` branch either check
lives in. Route tests in `guardian-alert.route.test.ts` prove this
end-to-end: a Free-tier account with no `sms_nudges` allowance at all can
still send a guardian alert, a guardian alert still sends when the
general SMS aggregate cap is already exhausted, and sending one never
consumes the `sms_nudges` counter.

### Declared / tier-differentiated, not yet independently server-enforced

These are configured accurately per tier so the pricing page and tier
matrix are consistent and data-driven, but do **not** yet have a
corresponding route/feature that independently reads them to gate access.
Building real enforcement for all of these would mean touching a dozen
unrelated features' write paths in the same pass that shipped the tier
model above — flagged here explicitly (and in the final report) rather
than left as a silent gap, so it's a known, prioritisable backlog:

`core_tools`, `daily_checkin`, `energy_budget`, `recovery_plans`,
`nova_memory`, `history` (retention-window depth), `pattern_recognition`,
`predictive_insights`, `ally_nudges`, `weekly_intelligence`,
`monthly_executive_report`, `advanced_personalisation`, `priority_ai`
(no real request-priority routing infrastructure exists — see
`docs/AI_COST_CONTROL.md`'s own honesty note), `premium_content`,
`early_access`, `coaching_benefits` (a discount/priority-booking benefit
for the separate, human 1:1 Executive Coaching commercial product — never
automatic inclusion of coaching itself in the subscription).

## What every plan gets regardless of tier — never paywalled

The following are never gated by plan, on any tier including Free, and
never will be: account security (2FA, session management), privacy
controls, account deletion, crisis/help routing and safety features,
essential accessibility, consent controls, and basic protection of user
data (including the GDPR export above). **A user must never see "Upgrade
to Performance for safety."** Guardian Support SMS specifically is exempt
from the SMS tier allowance, as detailed above — not a general SMS
allowance, a specifically protected safety path.

Enforcement of the numeric capabilities above is a Firestore-backed
daily/monthly counter (`users/{uid}/usage_counters/{YYYY-MM-DD}` or
`{month-YYYY-MM}`, itself with no client rule at all — default-deny —
so a client can neither read nor reset its own counter), incremented on
each allowed use. This is a soft, best-effort guard, not a billing-grade
lock: a request that's allowed and a nearly-simultaneous one racing it
could both pass. That trade-off is deliberate — the goal is stopping
runaway or abusive usage, not metering to the exact request (the existing
`express-rate-limit` limiters in this codebase already make the same
trade-off).

## Granting a plan today

**There is no live Stripe/Apple/Google integration in this codebase.**
`billing-adapter.ts` already documented the same honest gap for
Enterprise org billing; `entitlements.ts` follows the identical pattern —
`EntitlementProvider` is an adapter interface, and only
`NullEntitlementProvider` exists. The one real, working way to grant a
plan today is `POST /api/admin/users/:uid/entitlement`
(`requireAdmin`-gated): a platform admin sets `plan` (one of `free`,
`core`, `performance`, `executive` — `legacy_premium` is rejected, see
above)/`status`/optional `durationDays` by hand. `billingSource` is
always forced to `'admin'` server-side — never taken from the request
body — so an admin grant can never be mistaken for a real provider record
a webhook would later reconcile. The route now also logs whether a given
grant was an upgrade, downgrade, or lateral move relative to the
account's prior plan, for audit-trail clarity. See
`docs/MANUAL_BILLING_ACTIONS.md` for the exact steps a human takes.

### What real Stripe/Apple/Google wiring would add

None of this exists yet; it's scoped here so it's a known, bounded amount
of future work rather than a surprise. See `docs/STRIPE_PRODUCTS.md` and
`docs/MOBILE_SUBSCRIPTIONS.md` for the price-ID-to-plan mapping design
(`resolvePlanFromPriceId` in `entitlements.ts`) this is built to receive.

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
sponsored-plan seat, but automatic provisioning/revocation (granting it
when someone joins a sponsoring org, revoking it when they leave) is not
wired up — today an admin would use the same manual grant endpoint,
granting `performance` (the one plan the existing manual-grant path
resolves an org seat to today). This is a deliberate scope line: the
existing Enterprise billing system (`billing-adapter.ts`,
`organisations/{orgId}.billing`) governs seats at the org level and was
left untouched; bridging it to individual consumer entitlements
automatically is real, separate work (see `docs/OUTSTANDING_TASKS.md`).
When an employee leaves a sponsoring org, their organisation-sourced
access should end, but their personal Blaze Break account/Nova/journal
data must NOT become organisation property — this principle was already
established for the Enterprise backend and applies identically here once
auto-provisioning is built.
