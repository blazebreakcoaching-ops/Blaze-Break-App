# Outstanding security items

This is the security-specific backlog — what this hardening pass did
**not** do, and why, so it's a known list rather than a surprise later.
It is deliberately a separate file from `docs/OUTSTANDING_TASKS.md`,
which tracks commercial/cost-hardening gaps (Stripe/Apple/Google Play
billing, primarily) for a different audience and a different kind of
follow-up. Neither file should absorb the other — cross-referenced
below where they touch.

Everything genuinely fixed in this pass is in
`docs/SECURITY_HARDENING.md`, not repeated here. This file is only
what's still open.

## Resolved: unexpected-error responses leaking err.message (Security Operations Batch 3)

Audited every client-facing `error: err.message` site in `server.ts`
(~178 total). Found 65 in the unconditional `res.status(500).json({
error: err.message })` shape - the generic "we never anticipated this
specific failure" fallback, with no status-code branching on the
message at all. `err.message` reaching that branch was never authored
to be user-facing - it can be a raw Firestore/Admin-SDK error, a
third-party provider's own error text, or a bug's own "Cannot read
properties of undefined" - none of which are secrets, but none of which
should reach a client either.

Of those 65, 59 had **no server-side logging at all** before the
response - meaning the real error wasn't just over-exposed to the
client, it was invisible everywhere, including Cloud Logging. Fixed
both at once: added a shared `GENERIC_SERVER_ERROR` constant for the
client-facing message, and `logger.error(\`Unhandled error on
${req.method} ${req.path}\`, errorFields(err))` to every site that
didn't already log (the 6 that already logged their own labeled message
were left as they were - only their response body changed).

Exactly 2 sites were reverted after the full test suite caught them:
`POST /api/admin/admin-users/:uid/role` and `DELETE
/api/admin/admin-users/:uid` both call `assertNotLastPlatformOwner`,
which throws a message specifically authored to be shown to the admin
attempting the change ("Cannot remove or downgrade the last Platform
Owner") - a deliberately safe, UX-relevant message, not an
unanticipated failure. Both are commented in place as reviewed
exceptions, and `error-message-leak-guardrail.test.ts` pins the count at
exactly 2 so a future change can't silently reintroduce a real leak
without the test catching it.

**Deliberately not touched in this batch**: the ~100+ sites using the
conditional-ternary shape (`res.status(err.message?.includes("Forbidden")
? 403 : 500).json({ error: err.message })`) - these already recognize
specific, deliberately-thrown safe errors (`"Forbidden"`, `"Unauthorized"`,
`"not found"`, `"frozen"`) and give them real status codes, but still
return the raw `err.message` on the implicit 500 fallback branch
*within that same line* - the identical leak, just harder to fix
mechanically, since the status-code selection and the response body are
combined in one ternary expression and each site would need individual
restructuring (split the body into its own branch, not just the status
code) rather than a safe find-and-replace. Real, same-shaped residual
risk, left for a future batch rather than rushed here.

**Resolved in Security Operations Batch 4.** See below.

## Resolved: conditional-ternary err.message leak on the implicit 500 fallback (Security Operations Batch 4)

Restructured all 109 of the sites flagged above. Each
`res.status(err.message?.includes("X") ? CODE : ... : 500).json({ error:
err.message })` one-liner became an `if`/`else if`/`else` chain: every
recognized branch (`"Forbidden"` → 403, `"not found"` → 404, `"frozen"` →
423, `"Rejected"` → 400, `"Unauthorized"` → 401) still echoes `err.message`
unchanged - same reasoning as the admin-users exceptions in Batch 3, these
are deliberately-thrown, safe, user-facing messages. Only the final `else`
branch (the true "we never anticipated this" fallback) now returns
`GENERIC_SERVER_ERROR` and, like Batch 3, gets a `logger.error` call so the
real error is still captured. One site
(`POST /api/billing/checkout-session`) already had its own labeled
`logger.error("[STRIPE] Failed to create checkout session", ...)` call
immediately above the original ternary covering every branch, not just the
500 fallback - left alone rather than duplicated, matching how Batch 3
treated the 6 sites that already had their own logging.

Two sites were deliberately left as ternaries and untouched: both
Nova Manager Coach routes already return a hardcoded safe string
(`"Nova Manager Coach Sync Failure: A safe operational error occurred."`),
never `err.message`, on their 500 branch - there was no leak there to fix.

Ran the full test suite (2939 tests) unchanged after the sweep as the same
kind of audit Batch 3 used - nothing failed, meaning no test anywhere
relied on the specific text of a message that only ever reached the 500
fallback branch. `error-message-leak-guardrail.test.ts` gained two more
tests pinning the conditional-ternary leak pattern at exactly zero, with
its own sanity-check test against a synthetic string.

This closes the one item left open from Batch 3. No known
`err.message`-to-client leak sites remain in `server.ts`.

## Resolved: the same leak under a different catch-variable spelling (Security Operations Batch 5)

While scoping QA Batch 6 (MFA defensive catch-block coverage) and reading
nearby routes, found that `POST /api/twilio/send`'s catch block read
`catch (error: any) { ... res.status(500).json({ error: error.message
}); }` - the identical unconditional leak Batch 3 fixed, just spelled
`error` instead of `err`. Batch 3 and Batch 4's sweeps both searched
specifically for the literal text `err.message`, so anything spelled
`error.message` (or any other identifier) was invisible to either pass -
a real gap in the earlier audits, not a new kind of bug.

Searching `server.ts` for every `res.status(500).json({ error:
<identifier>.message` shape, across every identifier actually used as a
catch variable in this file (`err`, `error`, `e`), turned up exactly 14
sites spelled `error.message` (`e.message` never appeared in this shape
at all). Fixed identically to Batch 3: `GENERIC_SERVER_ERROR` on the
response, `logger.error` capturing the real error added to the 11 sites
that had no logging at all (3 already had their own labeled log line -
only their response body changed, same treatment Batch 3 gave its own 6
pre-logged sites). One site (`POST /api/guardian/alert`) also returns a
`userMessage` field alongside `error` - preserved unchanged, only the
`error` field's value was ever the leak.

Ran the full test suite unchanged after the sweep as the audit, same as
every prior batch in this series - nothing failed, meaning no test
anywhere relied on any of these 14 sites' leaked text.
`error-message-leak-guardrail.test.ts` gained two more tests pinning
this spelling variant at exactly zero, with its own sanity-check against
a synthetic string - kept as a separate pair of tests from the
`err.message` ones above rather than merged, since they're guarding
against two different ways the same mistake could come back.

No other catch-variable spelling in `server.ts` was found leaking this
way, but the possibility that a route introduces a fourth spelling this
audit didn't check for remains - same honesty the guardrail test's own
comments already practice about what a regex-based scanner can and can't
catch.

## Needs a human decision, not more code

- ~~**Data retention window.**~~ **Resolved 2026-09-28** — Option B
  (12-month inactivity expiry) decided and implemented. See
  `docs/DATA_RETENTION.md` for the decision record and
  `data-retention.ts`/`processInactivityRetentionSweep()` in `server.ts`
  for the implementation. Off by default until `RETENTION_SWEEP_ENABLED`
  is deliberately set in a given environment.
- ~~**Environment separation.**~~ **In progress, 2026-09-28** — confirmed
  there genuinely was no staging environment (local dev pointed at the
  real production project/database). Decision made: a fully separate
  Firebase/GCP project. Repo side is done — `.firebaserc` now declares
  `production`/`staging` project aliases, and `docs/DEPLOY.md` §10 has
  the complete one-time setup procedure (project creation, Firestore
  database, IAM, secrets, Cloud Run deploy). **Still open:** actually
  running that provisioning (steps 1–8 in §10) — needs GCP console/
  billing access this pass didn't have.

## Needs GCP Console/CLI access this session did not have

- **Confirm Firestore backup/PITR status.** See
  `docs/BACKUP_AND_RECOVERY.md` — this pass could not verify from inside
  the codebase whether Point-in-Time Recovery or scheduled exports are
  enabled on the named Enterprise-edition database, because that's
  project-level GCP configuration, not something set in code.
- **Confirm GitHub secret scanning + push protection is actually
  enabled** on the repository (`docs/DEPLOY.md` §6 recommends it; this
  pass could not check the repository's own Settings → Code security
  page).
- **Confirm 2FA is enabled on the Google account itself** behind
  `teampublication@gmail.com`/`teampublication@googlemail.com` — the
  hardcoded platform-owner identity throughout `server.ts`. This app's
  own 2FA feature (built in an earlier phase of this session) protects
  a Blaze Break account; it does nothing for the underlying Google
  account, and that Google account has broad implicit trust throughout
  this codebase (`requireAdmin`/`requirePlatformOwner` all special-case
  it). See `docs/MANUAL_SECURITY_ACTIONS.md`.
- **Runtime service-account IAM audit.** `docs/DEPLOY.md` §3 lists the
  roles this app actually needs; nothing in this pass could confirm the
  live service account doesn't hold broader roles than that (e.g. a
  leftover `roles/owner` grant from initial project setup). Worth a
  one-time `gcloud projects get-iam-policy` review.

## Deliberately not built — infrastructure investment, not a code fix

- **Automated alerting on the new security-relevant logs.** This pass
  added logging for rate-limit rejections and failed MFA attempts
  (`docs/SECURITY_HARDENING.md`), but nothing watches those logs and
  alerts a human — see `docs/INCIDENT_RESPONSE.md` §5. A Cloud Monitoring
  log-based alert on a spike in `[RATE LIMIT]` or `[MFA] Failed
  verification attempt` lines is a concrete, low-effort next step.
- **Google Cloud Armor (WAF) in front of the service.** Not configured.
  `docs/DEPLOY.md` §6 already names this as a "before scale"
  consideration; still true, still not done.
- **A distributed/coordinated-abuse detection layer.** Current abuse
  control (rate limiters + entitlement quotas) is per-IP/per-account.
  Detecting the same actor spread across many IPs/accounts would need
  either Cloud Armor's adaptive protection or a purpose-built layer —
  neither exists today.

## Explicitly out of scope for this pass (cross-referenced elsewhere)

- **Payments (Stripe/Apple/Google Play).** No billing integration is
  wired up at all — see `docs/OUTSTANDING_TASKS.md` and
  `docs/FREE_PREMIUM_ENTITLEMENTS.md`. This has no bearing on the
  security baseline of what *is* built (Firestore, auth, Nova,
  notifications, RBAC) — see the final report's two-verdict structure.
- **A real, live penetration test.** Nothing in this pass constitutes
  one, and nothing in this codebase's documentation should ever claim
  it does. Budget for a professional review is already flagged in
  `docs/DEPLOY.md` §6 as appropriate for an app holding mental-health-
  adjacent data, once the product's scale/funding justifies it.
- **SOC 2 / ISO 27001 certification.** Not pursued, not claimed. If
  Enterprise customers eventually require one, that's a real,
  multi-month compliance project (policies, evidence collection, an
  external auditor) — this hardening pass is a reasonable technical
  foundation for that future work, not a substitute for it.
- **Clinical/legal review of Guardian Tier 3 escalation.** Explicitly
  called out as its own external dependency, separate from this
  document, in the final security report.

## Lower-priority, real but non-urgent

- **`npm audit` moderate advisories** — a few transitive issues inside
  `firebase-admin`'s own dependency tree (`@google-cloud/storage` →
  `teeny-request`/`retry-request`), already tracked in
  `docs/DEPLOY.md` §6. Needs a major `firebase-admin` version bump,
  which is a deliberate, tested change, not an `npm audit fix --force`.
- **Load/DoS resilience testing.** No load-testing suite exists proving
  behaviour under sustained real traffic beyond the per-request rate
  limiters — see `docs/SECURITY_TESTING.md`'s "what automated testing
  does NOT cover."
- ~~**`app/applet/` legacy scripts directory.**~~ **Resolved (Security
  Operations Batch 2).** Confirmed genuinely dead code, not an
  assumption: zero references from `src/`, `server.ts`, `package.json`,
  `vite.config.ts`, any CI workflow, or anywhere else in the repo outside
  this item's own description. Its one component
  (`ConnectedRecoveryModules.tsx`) was a stale 182-line early-stage copy
  of the real, actively-imported 1088-line
  `src/components/ConnectedRecoveryModules.tsx` — different Firestore
  access patterns than the file it was superseded by, sitting unreferenced
  in the repo. Once confirmed dead, that's a real liability to leave in
  place (an old, divergent copy of security-relevant code someone could
  mistake for current), not something worth merely re-flagging — the
  whole `app/` directory has been deleted, and the now-unnecessary
  exclusions it needed (`tsconfig.json`'s `exclude`, `ci.yml`'s
  `--ignore-pattern app/`) removed with it.
