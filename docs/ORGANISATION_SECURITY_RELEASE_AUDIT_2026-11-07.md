# Blaze Break — Organisation Security Release Audit
**Date:** 2026-11-07
**Branch:** `cto/customer-first-experience-20261106`
**PR:** #155 (draft, do not merge or deploy yet)
**Verdict:** **NO-GO until test execution and staged security acceptance.**

## Scope and methodology
Reviewed the actual Express/Firebase Admin SDK organisation endpoints, granular and legacy role resolution, company-owner invariants, member lifecycle, invitation issuance and cancellation, company settings, devices, connector control plane, billing and SSO. Static source checks do **not** substitute for executed tests, emulator verification, infrastructure inspection or penetration testing.

## Hardening implemented on this PR
- Role resolution now requires an actual current company roster entry, not merely a leftover per-member document or legacy admin UID.
- Last-owner protection excludes stale/off-roster owner entries and profiles assigned to other organisations. Full account deletion observes this protection before personal erasure.
- Member leave, removal, suspension, role change, reactivation, HR designation and team-management audit evidence is committed atomically with membership changes. Shared joining codes cannot silently reactivate orphan membership documents.
- Join-code rotation, individual invite cancellation, email-invitation issuance/resend and successful joins write per-company audit events in the transaction; codes/tokens are omitted from audit payloads.
- Device registration and revocation, org data policy, billing, SSO config/enforcement, company settings and connector administrative actions use transactional audit writes. The twelve previously incomplete workplace workflow mutation paths, plus intervention create/status, now persist audit evidence in the state transaction.
- SSO enforcement remains unavailable unless a real assertion-validation integration exists. A feature flag alone cannot enable it.
- SSO metadata URL probing pins connections to a prevalidated DNS address, does not follow redirects and filters non-global IPv6/special-use IPv4 addresses.
- The fake Firestore transaction harness now stages and rolls back writes if the callback throws. New regression scenarios cover stale memberships, ownership, join and invite audit, device and connector lifecycle, SSO, billing, policy and failure cases.

## Outstanding findings / explicit boundaries
### P0 — release blockers
1. **Tests not executed:** Run complete TypeScript typecheck, application build, Vitest suite, Playwright journeys and Firebase emulator security/permissions tests on the final exact PR SHA. Resolve all failures before acceptance. Repo commands: `npm run lint`, `npm run build`, `npm test`, `npm run test:emulator`, `npm run test:e2e:realapp`, `npm run verify:release:offline`, `npm run verify:integration:offline`. Use staging secrets and an isolated environment; do not run live-destructive commands against production.
2. **Staging acceptance:** Exercise revoked accounts, suspended managers, cross-org data isolation, invitation resend/cancel races, simultaneous owner changes, audit consistency and full account erasure using real Firebase staging with least-privilege identities.
3. **Infrastructure inspection:** Review deployed Firestore rules, IAM/service accounts, Cloud Run authorization, App Check enforcement, secret handling, audit retention, backups and monitoring against actual staging/production configuration. None is verified by this source-only review.
4. **Release composition:** PR #155 aggregates hundreds of unrelated changed files; review it in bounded subareas and demand an exact-SHA signoff. Do not treat this document as a certification or approval to merge.

### P1 — engineering follow-up
1. **Organisation audit mutation gaps — code FIXED, runtime UNVERIFIED:** The twelve originally identified workflow mutation routes now use transactional audit writes, with additional coverage for intervention creation/status. The join route also refuses to revive orphaned suspended/active member documents. Source scan reports zero organisation mutation routes still calling the original best-effort audit method. Regression tests were added but **have not been run**; this finding is not closed for release until emulator/staging evidence exists.
2. **Actor permission change races:** The twelve repaired routes and intervention creation/status now recheck actor membership and role/management privilege inside the audited transaction. Audit other transactional and non-transactional endpoints for similar TOCTOU permission windows before enterprise signoff.
3. **Device metadata after offboarding — source FIXED, staging UNVERIFIED:** Member leave, administrator removal and account erasure now delete registered device metadata inside the same membership transaction, with guardrails against exceeding Firestore transaction size. Run emulator/staging failure and concurrency tests, including large device rosters, before signoff.
4. **Shared-code brute force — source FIXED, staging UNVERIFIED:** Added shared Firestore-backed, 15-minute, hashed-account and hashed-IP attempt counters (12/account; 60/network) before code lookup. The existing local limiter remains a first guard. Validate Cloud Run proxy IP handling, Firestore quotas, TTL cleanup and alerting under distributed load.
5. **Billing:** Org-level `NullBillingProvider` is an internal record, not a verified payment/subscription provider. Company-editable plan/seat records must not be treated as external payment truth or entitlements until billing reconciliation is implemented.
6. **SSO:** Configuration and reachability checks are not real SAML/OIDC sign-in. Do not market or enable enterprise SSO until assertion validation, account linking and safe recovery are implemented/tested.
7. **Security observability:** Verify org-scoped audit retention, access and high-risk alerting, including tamper resistance and reconstruction of event sequences.
8. **Invitation email delivery race:** Existing per-invite token validation makes canceled/replaced credentials invalid at redemption; validate delivery race scenarios and provider error telemetry in staging.

### P2 — further security review
- Review other product areas separately: platform super-admin, Evolution Engine, Intelligence Layer, Recovery Report, Command Centre, integration credentials and Nova/AI data boundaries.
- Review all externally configurable URL-fetch surfaces for DNS rebinding, redirect, timeout and egress controls.
- External penetration testing and independently verified security/compliance evidence are outstanding. No SOC 2 / ISO 27001 certification is asserted.

## Required signoff evidence
For each P0 check, record: final commit SHA, command executed, environment, pass/fail result, any defects, a fix commit and a retest result. Confirm `main` and production remain unchanged until a human explicitly approves release. GitHub Actions are intentionally disabled and must not be automatically enabled for this review.

**This report is a source-review/engineering worklog, not a completed independent audit.**

## Subsequent closeout update — 2026-11-07
- Source review found and repaired 12 separate-audit workflow mutations; a second scan exposed two further intervention paths that used transactions but logged afterward, now also repaired.
- Shared audited-write helper now verifies actor roster presence, role status, cross-company profile and role/permission inside the same transaction. Specific team scope is additionally rechecked for applicable record updates.
- Added focused rollback/security regression cases in work-design-debt, workplace-policy, org-search, team-escalation, intervention and joining tests.
- **Important:** No TypeScript compilation, Vitest suite, Playwright run, real Firestore emulator run or staging acceptance has yet been executed for this exact final SHA. Static source scans cannot establish operational correctness.
- Remaining release gates are unchanged: runtime tests, infrastructure/IAM/rules review, device-cleanup recovery, distributed rate limiting, real SSO validation/integration and independent enterprise security acceptance.

## Follow-up source closeout — 2026-11-07
- All 14 identified organisation work-design/enterprise search mutation audit gaps now persist their structured audit records with their updates, as verified in a targeted static source scan.
- Executive summary export now requires successful audit persistence before releasing the report payload.
- Member departure, admin removal and account erasure now remove registered device metadata in the membership transaction instead of after it; source and failure-case tests were added but not executed.
- Company joining attempt protection now adds Firestore-backed hashed identity/IP buckets across instances. Operational TTL policy and monitoring still require deployment configuration and validation.
- The live branch code is NOT test-certified. Before launch, preserve the final exact SHA, run the commands above and retain logs of tests, staging, IAM/rules inspection, and approval.
