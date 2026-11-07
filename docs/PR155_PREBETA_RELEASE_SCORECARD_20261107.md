# Blaze Break — release-readiness scorecard
Prepared 7 November 2026 on the **draft** branch `cto/customer-first-experience-20261106` (PR #155).

## Current decision: NOT APPROVED FOR BETA OR PRODUCTION

These are code-level fixes and source assertions, NOT completed acceptance tests. The release remains blocked until the exact source SHA passes full local/emulator tests and private staging with the real signed-in customer journey.

| Priority | Workstream | Code state | Verification still needed |
|---|---|---|---|
| P0 | Firestore profile read failures | Blocks fallback overwrites and offers retry | Firestore emulator: failed read, reconnect, no data loss |
| P0 | Registration / first onboarding save | Waits for atomic profile, What's New marker and Nova permissions batch | New account in real Auth/Firestore emulator, offline error and retry |
| P0 | Profile and Nova consent Settings | Serialises consent edits; waits for atomic Firestore commit; seeds required rules fields only on missing doc | Firestore rules test: existing disabled permissions survive and new doc creates |
| P0 | Notification settings | UID-scoped load/save guards, retries, 20-category server limit | A→B account switch with delayed reads and write failures |
| P0 | Nova chat and voice | UID-scoped autosave, stale reply/audio isolation, hidden previous chat | Real browser A→B→A, chat persistence, voice request during logout |
| P0 | Nova Brain | Cache epoch, verified per-user learning consent, auto-sync only after successful hydration; unchanged-memory writes skipped | Emulator account-switch race, consent OFF, memory-write failure |
| P0 | Storage shim | `src/main.tsx` permits exact current-UID keys, blocks legacy global keys | Real web app (not dev preview): reload, sign-up, Storage unavailable |
| P0 | Server diagnostic learning | No request-controlled consent fallback; persisted `allowNovaMemory === true` required | Server route test with absent/false/broken permissions |
| P0 | Auth/MFA | Stale async callbacks rejected on web and native | Live Firebase emulator and staging MFA/token-expiry tests |
| P1 | Nova Guide / first visit | Optional guide, quiet dialog priority, Escape progress; no surprise change log | 320px phone + desktop Playwright, screen readers, keyboard, reduced motion |
| P1 | Performance / costs | No Firestore connection probe in production; avoid repeated unchanged Nova memory writes; hidden-tab Slack tick paused | Build profiling and actual Firestore/API request counts |
| P1 | Feedback for 10 testers | Existing Settings feedback route and new private operational plan | Test report form and permissions; collect no chat transcripts |
| P1 | Native | Native account callback generation/live-UID guard and Jest test | Native Jest and physical-device tests; native MFA still blocks release |
| P2 | Public SEO | Existing homepage canonical, OG metadata, robots and sitemap source checks | Verify intended .app production domain, social previews, live crawling |
| Deferred | Stripe, Zoom and other unconfigured services | Remain separate from stability release | Explicit integration projects; do not imply operational launch |

## Tests added / extended today (NOT RUN here)

- Account read retry: `src/components/AccountDataLoadGate.test.tsx`.
- Notification ownership: `src/lib/notification-preferences.test.ts`, `src/components/NotificationSettingsView.test.tsx`.
- Nova chat storage: `src/lib/nova-chat-storage-ownership.test.ts`.
- Profile and consent atomic writes: `src/lib/profile-settings-save.test.ts`.
- Firestore diagnostic consent boundary: `diagnostic-learning-consent-source.test.ts`.
- Browser storage allowlist: `src/lib/secure-local-storage-keys.test.ts`, plus updated `current-features-storage-and-onboarding.test.ts`.
- Native authentication: `mobile/src/lib/native-auth-callback.test.ts` uses **Jest**, not Vitest.
- Nova memory hydration and no-op writes: `src/lib/nova-brain-privacy.test.ts`.
- Nova Guide Escape progress: `src/components/NovaGuide.test.tsx`.
- Prior Nova coaching, role/MFA, Playwright, notification and Firebase emulator cases remain mandatory.

## Independent source audit result

At the checked pre-document PR head, **19 of 19 targeted source assertions passed**, showing the expected wiring and checks were present. Source assertions are not TypeScript, ESLint, Vitest, Playwright, Firestore Rules or a live application run. The branch changes hundreds of files; this audit is targeted, not exhaustive.

## Tomorrow's exact-SHA non-deploy verification

On an authenticated full checkout, using the correct Firebase local emulators:

```bash
git fetch origin
git checkout cto/customer-first-experience-20261106
git pull --ff-only
git status --porcelain
git rev-parse HEAD
EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)" npm run verify:web:offline
```

Save the resulting `release-gate-logs/latest.json` and `release-gate-logs/integrated/latest.json`, with exact failing stage exit codes. Verify nothing modified the checkout. If a bug is fixed, repeat the **entire gate at the NEW SHA**.

**Private staging acceptance:** new registration and retry; two different registered users sharing one browser, anonymous-to-real conversion, browser refresh, profile edits and saved consent toggles, Nova chat/voice memory isolation, App Check, email verification, MFA, disabled Nova learning, blocked server diagnostic persistence, privacy delete/export and rollback. Test on short iPhones, Android and desktop; record screenshots with test data, no private customer content. Confirm manual-only release workflow before touching `main`; current production `main` has push-triggered Cloud Run deployment.

## Non-code gaps that still matter

- Existing browser-global legacy data cannot be tied to one person reliably. Do **not** automatically import or delete it without a verified migration/retention policy.
- The customer-facing privacy promise, assessment outputs, safeguarding review and real deletion/export flows require independent checking; client code is not a substitute for Firestore rules.
- Consent and health-context decisions need real test accounts and audit evidence, not source assertions alone.
- Verify the website canonical domain and app-store configuration before publishing SEO or app-store assets.
- Beta recruitment is a distinct commercial task. `docs/BLAZE_BREAK_BETA_10_TESTERS_20261107.md` prepares ten adult volunteers, metrics and a P0 stop-testing policy; it does not claim that testers have been invited.
- No Stripe, Zoom or GCloud secrets have been installed in this batch; no paid service was invoked, no workflow run was requested and no deployment was performed.

## Release approval rule

No user data in production until full exact-SHA verification plus independent staging/privacy/security acceptance, rollback plan and **explicit owner approval**. A draft GitHub PR, even with all source assertions passing, is not launch readiness.
