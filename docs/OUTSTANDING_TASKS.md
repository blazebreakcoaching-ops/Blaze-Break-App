# Outstanding Tasks — Commercial/Cost Hardening

What this pass did NOT do, organized by why, so it's a known backlog
rather than a surprise. See `docs/FREE_PREMIUM_ENTITLEMENTS.md`,
`docs/AI_COST_CONTROL.md`, and `docs/NOTIFICATION_ARCHITECTURE.md` for
what WAS done.

## Needs real provider credentials (can't be built untestable)

- **Stripe checkout + webhook handler.** No `stripe` npm dependency
  installed, no live/test Stripe account configured here. Building a
  webhook signature-verification handler against credentials that don't
  exist would be unverifiable code, not a real integration — deliberately
  not done, matching the same honest gap `billing-adapter.ts` already
  documented for Enterprise billing. Scoped in detail in
  `docs/FREE_PREMIUM_ENTITLEMENTS.md`.
- **Apple App Store Server Notifications v2 + receipt verification.**
  Needs an App Store Connect API key.
- **Google Play Real-time Developer Notifications + Play Developer API
  verification.** Needs a Play service-account key.

**Manual configuration needed when these are picked up:**
- Stripe: create the product/prices (£19.99/mo, £179/yr), a webhook
  endpoint pointed at `/api/webhooks/stripe` (once built), and the
  `STRIPE_WEBHOOK_SECRET`/`STRIPE_SECRET_KEY` env vars via Secret Manager
  (same pattern `docs/DEPLOY.md` already uses for every other secret).
- Apple: App Store Connect subscription products matching the same
  pricing, an App Store Server Notifications v2 URL, and a server API key.
- Google Play: subscription products, a Pub/Sub topic for RTDN, and a
  service account with the Play Developer API enabled.
- Firebase/Google Cloud: nothing new required for entitlements
  specifically — the `entitlements/status` and `usage_counters`
  subcollections use the existing Firestore/Admin SDK setup.
  `firebase deploy --only firestore:rules,firestore:indexes` ships the
  updated rule (blocking `profile.subscription`). The
  `usage_counters.updatedAt` collection-group index this pass needs is
  **not** deployed that way, though — this project's Firestore database
  is Enterprise edition, which doesn't support `fieldOverrides` via
  `firebase deploy` at all. Create it directly instead; see the "Firestore
  Enterprise edition" section of `docs/DEPLOY.md` for the exact command
  and why.

## Needs a product/scope decision (not a unilateral code change)

- **Organisation-sponsored Premium auto-provisioning.** The
  `billingSource: 'organisation'` schema value exists; wiring it to
  actually grant/revoke Premium when someone joins/leaves a
  Premium-sponsoring org is real, separate work bridging the existing
  Enterprise billing system to consumer entitlements. Left as a manual
  admin-grant task for now.
- **Quiet hours on the ally-nudge SMS scheduler.** `NotificationRouter`
  was wired into the push pulse-check scheduler but deliberately not into
  the ally-nudge scheduler, which already has its own explicit per-user
  schedule configuration (a stronger, more specific signal than the
  general preference doc). Layering the general quiet-hours check on top
  changes a person's already-configured schedule's actual behavior —
  worth doing, but a product call, not assumed here.
- **`past_due` grace behavior.** `hasPremiumEntitlement()` currently fails
  closed on `past_due` (access ends immediately on a failed renewal
  attempt) rather than Stripe's own default of a grace/retry window. This
  is a real product decision about how forgiving to be on payment
  failure, made conservatively for now — revisit with real
  renewal-failure data once live billing exists.

## Real findings, correctly scoped below this pass's priorities

- **Write-time aggregate counters** for check-ins/energy budgets/mood
  pulses/etc., replacing the now-bounded-but-still-per-request
  `getNovaContextAndMetadata` reads with true O(1) counters updated on
  write. The read-bounding fix in this pass gets the overwhelming
  majority of the cost benefit for a fraction of the risk; the full
  counter rewrite touches every write path across the app and deserves
  its own careful, isolated pass.
- **Gemini Live context-window compression** using Google's own supported
  compression/sliding-window features, if/when available for the SDK
  version in use — not adopted speculatively without confirming
  compatibility.
- **A genuine complexity-based AI model router** (escalate to a more
  capable model only when a conversation signals real difficulty, rather
  than each route's fixed model choice). Not built — the fixed-model
  routing already in place is reasonable for now; this is a real future
  optimisation, not a correctness gap.
- **Configured spend budgets + automated "protection mode."** The
  cost-estimate visibility (`GET /api/admin/cost-usage`) and the pure
  `evaluateBudgetAlert()` threshold logic both exist and are tested; there
  is no scheduled job checking real spend against a configured monthly
  budget and no automated response (cheaper-model fallback, throttling)
  when a threshold is crossed. Needs a real budget figure and a real
  alert destination (email/Slack) to be meaningful, neither of which
  exists yet.
- **Data retention policy.** No TTL/cleanup exists for
  `anxiety_reset_events`, `audit_logs`, or other accumulating collections
  for *active* accounts (account *deletion* is solid — `recursiveDelete`
  plus an explicit erasure sweep, already audited as correct). Deciding
  real retention windows per collection is a policy decision this pass
  didn't make unilaterally.
- **Marketing email infrastructure** (batching, suppression lists,
  consent tracking beyond the existing invite opt-in) — not built,
  because no marketing email is currently sent. Build it when it's
  actually needed, not speculatively.

## Carried over from the prior (product safety) hardening pass

These were already identified and deliberately deferred before this
commercial-hardening pass began; still open:

- `AnxietyResetMode.tsx`'s per-user `safetyLevel` field, in tension with
  the Guardian spec's "no risk classification" rule — needs a product
  scope decision.
- The Firestore-rules gap on `user_stats/{uid}.supportCircle`'s `role`
  field (server-side `isRealGuardian` is the real enforcement point).
- The fully general k-anonymity guarantee on org dashboards (the specific
  demonstrated differencing attack is closed; defending every possible
  team-combination attack is a larger design question).
- Solfeggio/432Hz branding and unhedged "Fact:" claims in the nutrition
  module.

## What's already correct and needed no change (confirmed by audit)

Listed so they're not re-investigated later: raw voice audio is never
persisted; there's no duplicate transcription pipeline; there's no
Cloud Storage usage anywhere to optimise; Firestore composite indexes are
adequate for current query shapes; the frontend already code-splits by
route; App Check enforcement and CORS are already correctly scoped;
Firestore Security Rules already correctly block every entitlement/role/
billing field from direct client writes except the one gap this pass
found and fixed (`profile.subscription`); the existing scheduled jobs use
targeted, indexed queries rather than full user-base scans.
