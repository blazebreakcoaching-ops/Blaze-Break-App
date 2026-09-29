# Data retention — decided: Option B, 12-month inactivity expiry

**Decision (2026-09-28):** Option B below — inactivity-based account
expiry. An account with no Firebase Auth sign-in for 12 months is
deleted, with a warning email sent 30 days beforehand so a returning
user only has to sign in once to cancel it. Chosen over Option A (no
change) because it closes the "abandoned account holds data forever"
gap — the weakest part of the previous no-op state — for proportionate
engineering effort, without touching any active user's data or trend
features. Option C (category-specific windows with derived data
persisting) is a legitimate future evolution once the product and
revenue justify that larger rewrite, but wasn't judged worth doing
pre-revenue.

## Implementation

- `data-retention.ts` — pure decision logic (`evaluateRetentionAction`),
  unit-tested in `data-retention.test.ts`.
- `processInactivityRetentionSweep()` in `server.ts` — the actual I/O:
  pages through Firebase Auth's own `listUsers()` (which already tracks
  `lastSignInTime` natively — no new per-user activity field needed),
  evaluates each account, sends the warning email
  (`buildInactivityWarningEmail`, `brevo-templates.ts`) or deletes via
  `eraseUserAccount()` — the same routine
  `POST /api/user/delete-account` uses, so there is exactly one deletion
  code path in the app.
- Runs daily via `node-cron`, gated by the `RETENTION_SWEEP_ENABLED` env
  var (defaults **off** — same kill-switch pattern as
  `NUDGE_SCHEDULER_ENABLED`; must be turned on deliberately per
  environment, never just by merging code). Also respects `TEST_MODE`
  the same way the nudge scheduler's own cron registration does.
- The warning timestamp (`users/{uid}.retentionWarningSentAt`) is
  admin-SDK-only — `firestore.rules`'s client `update` rule on
  `users/{uid}` already uses a strict field allowlist that excludes it,
  so no rules change was needed for this to be safe from client
  tampering.
- `audit_logs` is untouched by this sweep, consistent with account
  deletion generally (see "What actually happens today" below) — it's a
  compliance trail that must outlive the account it records.

**Before turning `RETENTION_SWEEP_ENABLED` on in production:** confirm
`APP_URL` is set (used to build the sign-in link in the warning email)
and that Brevo is configured, or the warning email step will silently
no-op for accounts without a deliverable email.

---

*The rest of this document is preserved as the original options analysis
that led to the decision above.*

## What actually happens today

**There is no automated data retention or deletion job anywhere in this
codebase.** The one scheduled job that exists (`node-cron`, `server.ts`)
is `processNudgeSchedules` — it sends scheduled nudges, it does not
delete anything. Personal data persists in Firestore indefinitely until
one of these happens:

- The user deletes their own account (`POST /api/user/delete-account`) —
  this removes their root document, every subcollection beneath it
  (`recursiveDelete`), and every registered "stray" top-level collection
  keyed by their `userId` (see `user-data-collections.ts`,
  `docs/SECURITY_ARCHITECTURE.md` §9) — **except** `audit_logs`, which is
  deliberately kept as a compliance trail that must outlive the account
  it records (it's exported to the user on request, just never erased).
- A platform admin manually removes something via an admin route.
- An organisation's own data policy (`org-data-policy.ts`,
  `docs/DATA_POLICY.md`) sets `retentionPeriodDays` — but this field is
  **only meaningful today if the org has also turned on
  `allowContentRetentionForDebugging`, `allowModelTraining`, or
  `allowProductAnalytics`**, none of which currently have any real
  pipeline reading them (see `docs/DATA_POLICY.md`'s own "what this does
  NOT cover yet"). For an org that hasn't touched those flags — which is
  every org today — `retentionPeriodDays` doesn't actually cause
  anything to be deleted.

In short: **account deletion is the only real retention mechanism that
exists.** A user who never deletes their account has their check-ins,
mood pulses, Nova conversation memory, guardian contacts, and every other
piece of personal data in this app kept forever.

## Why this matters enough to decide, not just leave

This app holds burnout/wellbeing data — check-ins, mood, stress signals,
Nova conversation context, in some cases guardian/support-circle contact
details. GDPR's storage-limitation principle (Art. 5(1)(e)) expects
personal data to be kept "no longer than is necessary" for the purpose it
was collected for, with a defined retention rationale — "forever, because
no one built expiry" is not a defensible answer if ever asked. This
doesn't mean immediate action is required; it means the absence of a
decision is itself the thing to fix.

## Options, with real tradeoffs

### Option A — No change: keep data indefinitely, rely on user-initiated deletion only

- **Pro:** Zero engineering cost. Matches what many consumer apps
  actually do. A user who wants their historical trend data (energy over
  months, recovery velocity) keeps it available for as long as they want
  it.
- **Con:** Weakest privacy posture of the options here. An account a
  person opened once and never touched again keeps their data forever
  with no prompt to reconsider. Least defensible against a storage-
  limitation challenge.
- **When it's the right call:** If the product's value genuinely depends
  on long-horizon personal trend data (which several features here do —
  Recovery Velocity Map, long-term consistency indices), and the team
  judges that value outweighs the privacy cost, this is a legitimate,
  deliberate choice — not just inertia — **as long as it's written down
  as a decision**, not left as an accident.

### Option B — Inactivity-based account expiry (e.g., delete/anonymize after N months of no sign-in)

- **Pro:** Bounds the "abandoned account holding data forever" case
  without touching active users at all.
- **Con:** Needs real engineering: a scheduled job, a grace-period
  warning email (this app already has Brevo wired up for exactly this
  kind of transactional email), and careful handling so a returning user
  isn't surprised by data that's quietly gone. Also needs a considered
  answer for what "inactive" means for an anonymous-then-upgraded
  account that may have long gaps between visits by design (burnout
  recovery is not a daily-habit app for everyone).
- **What N should be** is exactly the kind of number this document
  won't invent — 6 months, 12 months, and 24 months are all defensible
  depending on how the product frames itself; the tradeoff is shorter =
  more privacy-protective and more disruptive to a legitimately
  infrequent user, longer = the reverse.

### Option C — Category-specific retention windows (e.g., raw daily check-ins age out after N days, but aggregate/derived summaries persist)

- **Pro:** Most privacy-protective option that doesn't sacrifice the
  product's actual value proposition — long-horizon trend features
  (Recovery Velocity Map, Habit Consistency Index) could be built to run
  off periodically-computed aggregates rather than raw daily records, so
  the raw granular data (which is the more sensitive layer) can expire
  while the derived insight the user actually wants to see persists.
- **Con:** By far the most engineering work of the three options — it
  requires deciding, collection by collection, what's "raw" vs.
  "derived," building the aggregation step for anything that needs to
  survive its raw data's expiry, and a real migration for existing data.
  This is a multi-feature project, not a quick fix.
- **When it's the right call:** If the team wants the strongest privacy
  posture without giving up long-term product value, and is willing to
  invest real engineering time — this is the "do it properly" option,
  not the fast one.

### A fourth option worth naming explicitly: do nothing now, but document the decision

Choosing Option A today is fine. What isn't fine is choosing it *by
default* with no record that it was actually considered. At minimum,
this document itself, updated with whichever option is chosen and why,
is the artifact that turns "we never got around to it" into "we
evaluated this and decided X for reason Y" — which is the actual
regulatory-defensible position, independent of which option is picked.

## What this document is NOT proposing

- A specific number of days/months for anything.
- A recommendation between A/B/C — that's a product and legal call, not
  an engineering one, and depends on factors (business priorities, legal
  risk appetite, actual regulatory exposure) this document can't assess.
- A claim that any retention policy is currently implemented — see "What
  actually happens today" above.

## Related

- `docs/DATA_POLICY.md` — the org-level `retentionPeriodDays` field this
  document explains the current real-world scope of.
- `docs/SECURITY_ARCHITECTURE.md` §9 and `user-data-collections.ts` — the
  account-deletion mechanism that is, today, the only real retention
  control in this app.
- `docs/OUTSTANDING_SECURITY_ITEMS.md` — tracks this as an open decision.
