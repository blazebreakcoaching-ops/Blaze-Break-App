# Blaze Break — PR #155 release readiness board
Prepared 7 November 2026. Status: **BLOCKED pending full verification.**
Repository: `blazebreakcoaching-ops/Blaze-Break-App`
Branch: `cto/customer-first-experience-20261106`
PR: https://github.com/blazebreakcoaching-ops/Blaze-Break-App/pull/155
This document is a **working technical register**, not a release certificate. The branch SHA moves whenever a fix is committed.

## Ground rules
- Every row must distinguish **source changed** from **test executed** and **staging passed**. A test file is not a passing test.
- All code stays on the draft branch. **Do not merge to main**, where a push-triggered production workflow has existed, without explicit owner approval and an exact-SHA gate.
- No GitHub Actions, live cloud deployment, external payment/AI load test, paid API evaluation or Firebase production mutation in this overnight phase.
- Redact all credentials, account tokens, health/wellbeing text, coaching chats and third-party personal data from reports.
- Keep the core product philosophy: one clear next step, optional guides, no surprises or extra prompts.

## P0 — customer data and identity (source changes committed; QA pending)
| Area | Implementation/readiness | Evidence still required |
| --- | --- | --- |
| Auth and MFA switching | Stale auth callbacks guarded; old profile hidden; server MFA still authoritative | Two registered identities, sign-out, same browser, delayed auth claims and MFA status |
| Firestore stats read failure | Fail closed and offer retry; never write default stats after a failed read | Force offline, deny reads, reconnect, ensure original profile/progress unchanged |
| Account-isolated browser storage | UID-qualified private profile, pulse, nudge, Nova consent/chat and guide keys; exact-UID entrypoint allowlist | Real web entrypoint + two accounts; storage disabled/corrupt; anonymous-to-real conversion |
| Nova Brain | Clear account cache, discard old fetches, consent-gate memory, wait for hydration before sync; skip unchanged writes | Delayed Firestore reads + memory writes; revoked consent; same-UID optimistic updates |
| Explicit learning consent | Missing or legacy `letNovaLearn` is now OFF in onboarding, account restores and Settings; first permissions record created transactionally, without rewriting existing choices | Test fresh signup with toggle off, voluntary opt-in, existing undefined legacy value, two rapid consent changes and offline permission creation |
| Nova chat and voice | UID-owned history/voice preferences, stale response guards, neutral account-loading UI | Pending AI response and voice playback while changing accounts |
| Profile/consent save | Onboarding waits for successful Firestore save; Settings uses verified atomic profile+consent write and reverts failed toggles | Simulated rejected permissions, missing docs, low connectivity, rapid changes |
| General stats save | Drops old subscription and support-circle fields, omits undefined fields | Emulated rules against legacy profile and current entitlements |
| Notifications | Per-account preferences, visible error/retry, <=20 categories, explicit disabled default | Firestore emulator save failures; quiet hours; old response arriving after account switch |
| Calendar and hidden background use | New accounts default OFF; old automatic TRUE without a dated opt-in is treated as OFF; the privacy screen verifies the active UID; first opt-in stores a timestamp; Firestore rules allow the marker; the backend POST checks explicit consent and writes atomically with that check; GET and organisation coverage also refuse unverified sharing | Real emulator POST with missing/legacy true/valid consent/revoked permission, concurrent revocation during pending write, old accounts re-opt-in, permission rule deployment, OAuth scope; confirm retained pre-opt-out aggregates follow the agreed deletion policy |
| Feedback | Accepted report remains successful if secondary audit fails; testimonial publication consent explicit | Rejected server POST, accepted POST + failed audit, no sensitive data in reports |
| Audit trail | Old browser-global fallback removed; UID-scoped cache and stale-fetch protection | A and B account switch with offline audit endpoint and corrupt local storage |

## 7 November Super Admin restructuring — source work committed / NOT deployed

Full ordered scope: `docs/PR155_SUPERADMIN_BACKEND_RESTRUCTURE_PLAN_20261107.md` (54 tasks). New source changes: five grouped work areas instead of 15 equal tabs; People directory showing Firebase Auth display name, company link, join date and full latest sign-in, with demo accounts separated by default; privacy-safe company summary (seat allowance, pending invitations, staff, suspended records and roster mismatch); stale-response guard when viewing two companies; summary source-availability flags (no fabricated one-user fallback or 100% completion for zero sessions); NHEI, feedback, company and rate-limit failure displays. Suspended org members now fail role resolution, including stale manager/HR allow-lists; the last active owner cannot be suspended. Regression cases authored **but not executed**.

**Still P0:** atomic join-code seat checks, revocable invitations, cross-company initial-owner assignment, full removal/leave cleanup, live Firebase/Auth/Firestore role and two-company browser verification. **Still P1:** paginated directory beyond first 100 Firestore records, honest sign-in history governance, complete company executive workspace, other admin routes and operational observability. No automatic GitHub Actions. No merge, production release, or staging sign-off occurred.

## 7 November — Organisation security batch 1 (source changes, not tested)

Committed on PR #155 only:
- `/api/org/join` now checks the organisation's current billing allowance plus active and pending places inside a Firestore transaction. A verified email invite converts the reserved place instead of spending two; unverified email cannot claim an invite seat.
- `/api/org/:orgId/invite` now reserves places in a transaction before sending emails, preventing simultaneous invitation requests or joining from overspending seats. Duplicate resends reserve no additional place; delivery failure retains the pending row.
- Leave and staff removal clear `teamManagers`, `memberTeams` and `hrViewerUids` as well as role documents, core membership arrays and org devices. The final active owner cannot leave.
- Cancelling a pending invitation now logs the event and clearly reports that the shared joining code remains active. **This is not individual invitation revocation.** Expiring per-invite tokens are still P0.
- New route tests cover full-cap join rejection, reserved email slots, unverified invitees, concurrent joins/invites, duplicate resends, HR/team cleanup and last-owner protection.

**No test was run** and no Firebase transaction/emulator or real Brevo email evidence exists at this SHA. P0 owner-transfer/concurrent removal, individual invitation revocation, real Firestore semantics and regression sign-off are outstanding.

## 7 November — Organisation security batch 2 (source only; tests NOT run)

- Email invitations now carry individually generated 7-day codes (`BBI.<orgId>.<token>`) and no longer distribute the existing shared company code. Only the SHA-256 hash is persisted; the code requires the intended recipient's verified Firebase email and is consumed once. Cancellation, expiry or resend revokes that individual code; the shared manual code still works until rotated.
- Admin invite lists never return the token or token hash. The joining input accepts longer email codes, pending invite expiry is shown, expired reservations no longer count against seats, and cleanup per transaction is bounded.
- New company codes are cryptographically random; join attempts have per-UID best-effort rate limiting. The shared-code regeneration route has a redacted audit event.
- Company provisioning now updates the company, first owner and owner profile atomically. A draft with zero owners and members can be assigned a verified first owner, but an occupied company's owner cannot be replaced via Edit.
- Member removal and self-leave update profile, roster, team/HR allowlists and role record atomically, with last-owner check in the transaction; stale cross-company accounts cannot be unlinked. Device cleanup happens after that transaction and still needs dedicated fault handling/reconciliation.
- New unit/route tests for expiry, revoked/replayed/wrong-email tokens, concurrent joins/invites/owners, stale memberships, transaction failures, and malformed addresses were committed. **No tests have been run and the implementation is not release-certified.**
- Remaining blockers: real Auth+Firestore emulator exercise, live Brevo and staging UI tests, full legacy shared-code rotation plan, ownership transfer and device cleanup consistency, multi-instance rate-limit design, and final privacy/role penetration tests.

## Platform Command Centre — all 15 admin sections

See `docs/PR155_PLATFORM_ADMIN_ALL_SECTIONS_REVIEW_20261107.md` for the all-tab source inventory and the **59 server-side /api/admin routes**, including additional admin-only Nova/Evolution, content, analytics, and policy endpoints outside the visible dashboard. The previously limited customer-focused release checklist is **not** admin-functionality sign-off. Source fixes to company-list, feedback and statistics failure states and NHEI reviewer denial handling were committed to the draft branch; no full admin suite has run. Require per-tab permission-denied, error-recovery, role, account-switch, audit and staging verification before admin release.

## P0 — Company & Staff Admin (added after targeted 7 November source audit)

See `docs/PR155_COMPANY_STAFF_ADMIN_AUDIT_20261107.md`. The full company staff journey was **not covered** by earlier release sign-off plans. Confirmed source risks include suspended org members retaining role resolution; join-code entry bypassing invite-only seat checks; member removal/leave retaining team-manager and HR viewer grants; cross-org reassignment via platform provisioning; and cancelled email invitations not revoking a shared code. Treat these as **release blockers for any B2B/company beta** until safely fixed and retested. Existing admin/enterprise route tests were authored previously; no current-SHA test execution or staging verification was performed for this audit.

## P1 — simple customer experience (source changes/tests drafted; browser evidence pending)
| Area | Acceptance criteria |
| --- | --- |
| First visit | One welcome, optional illustrated Nova Guide, nothing starts without request; no competing changelog/reminder |
| Today screen | “I need a moment”, “Talk with Nova” and a small clear next step visible without extra menus |
| Check-in and recovery | Progress persists when save succeeds; failure retains answers and shows a clear retry |
| Settings / Privacy | Controls reachable with keyboard and screen reader; consent changes reflected in actual server behaviour |
| Mobile | 320px, 375px, 390px widths; iOS Safari and Chrome Android keyboard, safe-area, focus, sheets and bottom navigation |
| Accessibility | Labels, visible focus, Escape, reduced motion, zoom to 200%, sufficient contrast, dialogs not stacked |
| Reliability | Offline/timeout/reload after each primary action; no white screens, double submissions or misleading saved banners |
| Performance/cost | No production Firestore connection probe, no redundant Nova memory writes, no hidden-tab polling; verify in network profiler |
| Beta feedback | Use Settings feedback, no attached private chat/log payloads by default; bug triage P0/P1/P2 |
| SEO/public | Canonical and social tags must match the actual production domain; private routes not indexed |

## P2 / intentionally deferred
- Stripe, Zoom, paid plan entitlement billing and external AI model/brain integration decisions remain separate, owner-approved implementation tasks. Do not portray them as complete or beta-ready.
- Native store signing, full mobile build/Capacitor verification and live Google Cloud setup are **not** certified from GitHub source review.
- Beta recruitment materials exist in `docs/BLAZE_BREAK_BETA_10_TESTERS_20261107.md`; ten invitations/acceptances are **not** asserted completed.

## Tomorrow's exact-SHA offline QA commands (in an authenticated clean repository checkout)
```bash
git fetch origin
git switch cto/customer-first-experience-20261106
git pull --ff-only
git status --porcelain
git rev-parse HEAD
export EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)"
npm run verify:web:offline
# Only if native/mobile is part of this release:
npm run verify:integration:offline
```

Capture the process exit code, test summary, precise SHA, log/report paths and any failing cases. Investigate failures before running again. When the branch changes, the exact-SHA gate must run again. Do not consume GitHub Actions credits.

## Production deployment guard — 7 November source correction

- Candidate `.github/workflows/deploy.yml` is manual-only, with `auth_only: true` by default.
- A production deployment (`auth_only: false`) now fails unless the selected workflow ref is `refs/heads/main`, `confirm_production` is explicitly true, and `approved_sha` is a 40-character lowercase commit SHA exactly matching `GITHUB_SHA`.
- Approval fields are passed as environment variables rather than interpolated directly into shell commands.
- This guard exists only on the draft release branch today. **Do not merge until the main push-triggered workflow and exact merged version are reviewed.** A typed SHA is an accident-prevention check, not independent authorization or proof of test success.
- The guard was reviewed at source level; it was **not executed in GitHub Actions** and does not substitute for a protected GitHub production environment, independent approval, verified staging, or rollback.
- No GitHub Actions run, Cloud Run deployment, Firestore mutation or merge was performed for this change.

## 7 November Calendar consistency and account-switch hardening

- `POST /api/signals/calendar` already checked explicit opt-in atomically with its write. The `GET` endpoint now reads consent and stored Calendar aggregates inside one Firestore transaction rather than two separate fetches.
- `isCalendarSignalConsentGranted(uid)` now rejects a UID that is not the active Firebase account and rechecks UID after asynchronous database setup and after Firestore responds. A former account's delayed consent read cannot authorise the next account's sync.
- Added source-boundary assertions for transactional Calendar reads and expanded client tests for different UID, mid-read sign-out, and mid-read switching. **These tests were written but NOT run.**
- Explicit Calendar opt-in now accepts only canonical UTC ISO timestamps, rejecting permissive `Date.parse` formats such as year-only dates and overflow days; additional regression cases were authored but NOT run.
- Remaining gate: real Auth/Firestore emulator transaction tests and two-account browser integration, including a consent revocation racing a GET or POST. Confirm historical signal deletion/retention policy before launch.
- Do not claim these source changes prove an end-to-end privacy PASS.

## Private staging, after offline QA is green
1. Verify legal/auth/privacy text and production-like domain redirects, email verification, sign-in/out, password reset, MFA, App Check and server-side role checks.
2. Use **two non-sensitive test accounts on the same browser**; deliberately delay account A's Firestore, Nova Chat, memory and notification reads before switching to B. Confirm neither A data nor an A response appears for B.
3. Simulate Firestore permission denied, network interruption and slow save on onboarding, Settings and a recovery check-in. Confirm no false “saved” state or lost answers.
4. Confirm opt-out of Nova learning and calendar aggregation actually blocks relevant server-side use, not just a visible switch.
5. Test anonymous demo, account conversion, the five-step optional guide, check-ins, Nova, Recovery and feedback on 320px mobile and desktop.
6. Validate privacy centre delete/export and marketing consent, emergency support route, crash recovery, Google Cloud deployment identity and rollback.
7. Agree go/no-go using evidence, owner approval and monitoring. Only then invite the first testers with real accounts.

## Release decision rule
**NO-GO** if any data crosses accounts, any user can bypass MFA/roles, previously saved data is overwritten after a failed read, consent isn't enforced, the build/tests are not green, or there is no verified rollback. A large PR with source-only checks cannot be called launch-ready.

## Special privacy migration note — legacy Calendar opt-in

Older clients could create `allowCalendarSignals: true` automatically. That field alone cannot establish a real user choice. PR #155 therefore requires a **new explicit consent timestamp** before client sync, server ingestion or organisation Calendar coverage will accept this setting. Existing users who genuinely chose Calendar sharing must **opt in again** via the privacy screen. No old Calendar aggregates are automatically deleted in this source pass; retention/deletion policy and staging verification are required before live release. A customer switching Calendar on may need to refresh/reconnect before the next scheduled aggregation; verify that journey in staging.
