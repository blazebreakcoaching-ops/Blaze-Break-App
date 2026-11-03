# Blaze Break — whole-app legacy gap audit and release register

**Date:** 2026-11-03  
**Repository:** blazebreakcoaching-ops/Blaze-Break-App  
**Branch:** cto/cross-platform-gap-closeout-20261103  
**Audit baseline:** 17adce089f3db7c8a32c724fe5da77fb570492c4  
**Scope:** Source/architecture and documentation sweep across approximately 1,024 tracked files, 380 test/spec files and 286 Express route definitions. This was NOT a line-by-line independent execution of all files. No cloud credentials, full local build, authenticated staging, device binary, network provider or production deployment were available in this GitHub-only review.

## CTO verdict

**NOT VERIFIED FOR RELEASE.** Previous QA success belongs to older commits. These fixes require fresh integrated tests and release review.

## Legacy gaps fixed in source this round

| Defect | Code area | SHA |
| --- | --- | --- |
| Authenticated web API helper could attach Firebase tokens to a caller-provided off-origin URL; consumed error streams and mutated caller request bodies | src/lib/secure-api.ts, api-route-boundary.ts and tests | 581830d |
| Existing uppercase legal document IDs needed a compatibility fix in the new URL boundary | api-route-boundary.ts/tests | ff68b79 |
| Firebase Auth Blocking Functions used default Firestore instead of named database | functions/src/index.ts, firebase-target.ts/tests | cf299aa |
| Cloud Run server overwrote Google project identity with production web config, breaking staging isolation | server.ts, firebase-runtime-target.ts/tests, DEPLOY.md | 60aa14c |
| Web MFA status-check failure was treated as no MFA and allowed client UI to open | auth.tsx, MfaChallenge.tsx | dde804f |
| Administrator roster admin_users/UID was omitted from user export/deletion | server.ts, user-data-collections registry and tests; last-owner guard first | 4db8f97 |
| Admin role-change/delete endpoints echoed arbitrary unexpected provider/database errors | server.ts and admin-users route tests | b51d703 |
| Public site had no robots.txt or sitemap.xml | Public homepage-only discovery files and test | 3b6513d |
| Main-branch push automatically deployed Cloud Run and Firestore rules/indexes without release approval | deploy.yml changed to workflow_dispatch only, test and DEPLOY.md | 9f93b5 |

These are GitHub commits, NOT test passes, Firebase operations, production deployments or product approvals.

## Priority 0 — unresolved safety and production isolation

1. **Direct Firestore MFA boundary:** firestore.rules isOwner(uid) checks signed-in UID only; it does not enforce a second-factor proof. Server REST routes separately enforce signed MFA-session tokens, but browser/native Firestore SDK reads are not protected by that Express middleware. The web AuthProvider also reads Firestore before resolving its MFA screen. Client UI gates do not close this. Requires a secure migration proposal and emulator-backed enforcement; DO NOT blindly modify isOwner or existing customers may be locked out.
2. **Project-isolation activation:** the new Cloud Run mismatch guard intentionally refuses incorrect production/staging Firebase configuration. The web bundle still embeds tracked production firebase-applet-config.json. Staging needs its own separate Firebase web build, named Firestore DB, runtime project identity, and measured negative/positive staging boot tests. Deployed configuration is unknown.
3. **Automatic release trigger on main:** removed only on the dev branch. Main still has the prior production-push behaviour until a reviewed integration, so a merge can have side effects. Coordinate exact cutover order and rollback. No production merge authorised.

## Priority 1 — must be owned before the relevant capability launches

- Security PR #140 is still open, with some sanitizer work already in newer development ancestry. Independently review the entire diff and merge dependencies; never assume file similarity is sign-off.
- Full root, functions, mobile and browser verification is NOT RUN on this branch. Historical Report 35 unit/browser passes are not evidence for the latest changes.
- Stripe checkout/webhooks are coded and mocked but Stripe test/live secrets, prices, signed live events, renewal/refund/past_due treatment and entitlement sync are not verified. Apple App Store and Google Play server purchase verification/notifications are not built. Existing prices and tier assignments require a founder decision; do not activate unapproved changes.
- entitlements.ts explicitly calls out many capability-tier declarations that are not independently backend-enforced (for example energy_budget, nova_memory, history, predictive_insights). Validate exposed paid promises against actual enforced routes.
- Expo native has App Check source and theme UI but still needs Firebase registered Android/iOS apps, attestation, compatible expo-system-ui, EAS/signing, native build tests and iPhone/Android device tests. Expo, not Capacitor, is the native stack.
- Organisation aggregate privacy thresholds are inconsistent: production-readiness-blueprint says minimum N greater than 5, while server.ts defaults to N=5 and allows admins to set privacyThreshold as low as 3. Existing data-coverage tests use 3. Decide permitted minimum and test small-cohort reidentification before changing it.
- NHEI expert content, safeguards, legal review, consent, real-model evaluations and feature activation are not signed off; do not treat existence of routes as authorisation for autonomous action or clinical claims.
- Current GDPR export and erasure now handle UID-keyed admin roster. The existing registry scanner scans only some userId-field patterns in server.ts; audit other user-linked top-level data and secondary sources (for example platform_incidents.createdByEmail and signin_ip_velocity email/IP logs) and legal retention exceptions before broadening deletion.
- Named Firestore database indexes are partly provisioned outside the repo; verify actual index state in the authorised environment. Verify PITR/backups, restore drill, IAM/secret scopes, Cloud Logging alerts and billing/cost limits.
- Firebase Auth Blocking Functions are a separate deployment, and need named database compatibility, correct beforeCreate/beforeSignIn binding, provider/Identity Platform registration, false-positive review and explicit production activation.
- Docs/legal/LEGAL_REVIEW_REQUIRED.md lists open DPIA, privacy, retention and B2B contract review. A working interface does not imply approved notices/processor obligations.
- Existing account/data retention sweep is configured off by default until explicitly enabled; runtime schedules and 12-month inactivity policy need verified legal/operational approvals.
- Real OAuth provider credentials, external connector permissions, SMS cost/rate caps, breach notifications and payment security need authenticated live or sandbox verification.

## Priority 2 — experience, SEO, maintainability and policy debt

- robots.txt and sitemap.xml were added for the public homepage only. Confirm real crawl/HTTP response, canonical URL, Open Graph images, PWA cache behaviour, and legal accessibility. Search indexing of private app routes must remain disabled.
- Legacy pages still require systematic Light/Dark/System visual contrast and keyboard-accessibility sweeps, not just Nova composer screenshots.
- B2B organisation-sponsored Premium, cancellation grace and ally quiet-hours policy remain product decisions rather than settled code requirements.
- Backend server.ts is over 18,000 lines and has 286 route declarations; per-instance express-rate-limit stores may not enforce one global cross-instance ceiling. Check actual spending/safeguards before refactors.
- Source-level tests cannot prove native performance, Firebase credential acceptance, billing provider behaviour, operating-cost limits, data restoration or incident response.

## Verification matrix — mandatory, not yet executed against this branch

| Workstream | Checks |
| --- | --- |
| Root web/server | clean npm ci, TypeScript, ESLint, Vitest, production build, offline verification ten stages |
| Browser UX | full Playwright preview and real-app emulator tests, standard+narrow widths, two appearance palettes, paid/free/demo/admin/personas, accessibility |
| Firebase | Rules emulator with cross-account and MFA cases, named DB, staging vs production, index readiness, App Check accept/reject, IAM and secrets |
| Auth Functions | isolated functions npm install, build, tests, staging deployed blocking hooks and named DB |
| Native | native npm ci, TypeScript, ESLint, Jest, Expo SDK-compatible system UI, EAS builds and real iOS/Android device screenshots |
| Billing | signed Stripe test webhook replay/duplicate/renewal/refund tests, entitlement enforcement, native store flows if offered |
| AI/safeguarding | NHEI content reviewer acceptance, consent withdrawal, model eval, recovery routing limits, explicit external-action approvals |
| Operations/legal | PITR + restore drill, cost/security alerts, audit logs, DPIA/legal sign-off, post-deploy smoke and rollback |

## Next engineering handover

1. Check the precise head of cto/cross-platform-gap-closeout-20261103. This is not an instruction to merge or deploy.
2. Run all matrix gates on the actual current commit. Repair code/test failures without skipping assertions or triggering GitHub Actions. Commit on an isolated dev branch with skip-ci.
3. Resolve the Priority 0 security and environment items with a staged migration and explicit approval. Include a server-enforced Firestore MFA security design; preserve legitimate existing users' access.
4. Reconcile security PR #140. Keep unapproved NHEI, billing and external agentic actions disabled.
5. Obtain independent staging, legal, native-device and operational acceptance. Then present a controlled website rollout, a separate native-release plan and rollback for owner approval.

**Accuracy note:** This is a broad source-level and architecture gap audit with specific fixes and risk classification, NOT a claim that every line across the thousand-file repository is verified, that all route tests are green, or that production is ready.
