# PR #155 — independent account-isolation and privacy audit
Date: 7 November 2026
Branch: `cto/customer-first-experience-20261106`
**Status: source fixes committed; not independently built, browser-tested, staged, merged or deployed.**

## What the review confirmed and corrected

1. **Unscoped wellbeing data:** `blaze_break_pulse_history`, `lastPulseAlert` and `blaze_break_last_checkin` were browser-wide. A shared-device account switch could leak prior pulse history or influence another person's alert. Pulse entries, alert cooldown and check-in marker now use UID-scoped keys. The UI hides pulse history until its owner matches the signed-in Firebase UID. Corrupt JSON fails safely.
2. **Unscoped assessment migration:** Loading `blaze_fingerprint` without identifying its owner could import another person's assessment into the current account's Firestore profile. This unsafe fallback is disabled. The legacy unscoped value is deliberately left untouched for a future owner-approved, identity-verified migration policy.
3. **Old Firestore profile results after account switches:** `App.tsx` previously applied an earlier account's delayed `getDoc` result and a delayed support-circle update after switching accounts; follow-up autosaves could then write inappropriate data. Late results now check a cancelled-generation/current UID guard; stats autosave is restricted to the loaded owner's UID; the app displays a neutral loading state rather than showing prior-account data.
4. **Unscoped Nova personalisation:** NovaChat read `blaze_profile` from one browser-wide entry, including name, situational information, tone and questioning style. It now uses a UID-specific cache. Firestore-confirmed profiles refresh that cache, onboarding and Settings update the correct account, and a failed Firestore read no longer silently deletes that user's cached profile.
5. **Unscoped learning consent:** Nova's synchronous memory functions previously read `blaze_profile` and defaulted to `true` on missing or corrupt data. They now use a UID-scoped consent bit populated only by a verified profile load or an explicit onboarding/Settings choice. Missing or blocked storage fails closed.
6. **Nova brain cache races:** `initNovaBrain` previously retained old memory during account switches and could apply account A's late Firestore response over account B's memory. It now clears on identity change, checks a fetch epoch, and prevents reads/writes when the cached UID does not match the current Firebase Auth UID. Same-account optimistic additions remain visible if a delayed snapshot returns.
7. **Authentication callback race:** An old `onAuthStateChanged` callback could finish late and set the previous account's user, role or MFA status. The listener now tracks event generation and live Firebase UID. On a new identity it immediately hides the previously displayed React user, sets loading and safe MFA state, and allows only the latest callback to commit its results.
8. **Unexpected notification permissions:** The app formerly called `Notification.requestPermission()` on page mount. That unsolicited prompt is removed. Settings already describes live push as disabled; previously granted, foreground-only alerts remain guarded by the current user's actual data and owner-scoped cooldown.

## Tests added (not executed here)

- `src/lib/pulse-account-storage.test.ts`: UID keys, bounded/validated pulse histories, stale load guard.
- `src/lib/account-profile-storage.test.ts`: cross-account profile separation, update/remove and corrupted data.
- `src/lib/nova-brain-privacy.test.ts`: delayed fetch order, signout invalidation, learning consent and same-account memory additions.
- `src/lib/auth-callback-ownership.test.ts`: late auth callbacks, mismatched UID, signout and unmount.
- Existing registration/shared-device, MFA and consent tests remain mandatory.

## Residual risks and deliberate limits

- The **old browser-global keys are not automatically deleted or migrated**. There is no reliable evidence of their account owner. The app no longer reads them for the reviewed data flows. Any data-recovery/deletion policy must be intentional, documented and tested.
- App profile data and some Nova chat history are still stored locally by UID and can be accessible to someone with privileged access to the same browser/device. This fix prevents accidental in-app cross-account display, **not physical-device compromise or full local encryption**.
- Review any remaining global profile/pulse readers outside the audited entry points before launch; this document is not a claim of exhaustive repository-wide scanning across all 476 changed files.
- Firestore rules/server-side account and MFA enforcement, Firebase Auth/Firestore emulator results, App Check, sensitive data export/deletion, role access, and staging behaviour require independent checks. Client-side guards alone are not a security boundary.
- Avoid new surprise permission prompts or external/paid integrations while shipping the customer-first beta.
- The release PR is draft. `main` has a push-triggered Cloud Run workflow; the candidate is manual-only. Never merge or deploy without exact-SHA gate evidence and explicit owner approval.

## Exact release verification to run on an authenticated full Git checkout

```bash
git fetch origin
git checkout cto/customer-first-experience-20261106
git status --porcelain
git rev-parse HEAD
EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)" npm run verify:web:offline
```

The gate runs clean install, npm audit, TypeScript, ESLint, full build, Vitest, component tests, Firebase emulator and browser tests, without GitHub Actions or deployment. Collect `release-gate-logs/latest.json` and the integrated report. Test B signing in while A's Firestore and Nova memory requests are intentionally delayed; test memory/assessment/score isolation, Settings changes, shared-browser cookies and mobile/desktop first-use. Redact logs and use test accounts only. Repeat on each new commit.

**This source audit is not a sign-off to release or handle real customer wellbeing data.**
