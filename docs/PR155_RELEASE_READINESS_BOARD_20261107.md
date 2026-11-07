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
