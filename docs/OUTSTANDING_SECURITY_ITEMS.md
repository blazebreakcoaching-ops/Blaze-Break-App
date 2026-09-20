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

## Needs a human decision, not more code

- **Data retention window.** No automated retention/deletion exists
  today beyond user-initiated account deletion — see
  `docs/DATA_RETENTION.md` for the real options (A: keep indefinitely
  and document that as the deliberate choice, B: inactivity-based
  expiry, C: category-specific windows with derived-data persisting).
  This document does not pick one; someone with product/legal authority
  needs to.
- **Environment separation.** Nothing in this codebase or its docs
  describes a separate staging environment/GCP project distinct from
  production — every reference (`docs/DEPLOY.md`, `firebase.json`)
  points at one named Firestore database. Either a staging environment
  genuinely doesn't exist yet (in which case: is that an acceptable risk
  for this app's current stage, or worth setting up before the next
  major schema/rules change?), or one exists but isn't documented (in
  which case: document it, and confirm it isn't accidentally pointed at
  the same Firestore database or running with `NODE_ENV=production`
  settings that assume it's the real production deploy). This needs
  someone who actually knows the current GCP project layout to answer —
  it cannot be determined from the code alone.

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
- **`app/applet/` legacy scripts directory.** Excluded from TypeScript
  checking and from this hardening pass's scope (per
  `.github/workflows/ci.yml`'s own exclusion) — contains an older copy of
  some components (e.g. `ConnectedRecoveryModules.tsx`) with the same
  Firestore access patterns as the real app. Not shipped, not reachable
  by a real user, but worth confirming it's genuinely dead code (not
  imported anywhere) rather than leaving that as an assumption.
