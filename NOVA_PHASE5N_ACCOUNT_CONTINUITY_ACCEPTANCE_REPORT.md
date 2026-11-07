# Phase 5N — Account Continuity, Privacy & Real User Journeys — Acceptance Report

## 0. Scope and SHAs

- **Starting pushed SHA**: `83caeca` (Phase 5M delivery report, branch `claude/nhei-phase-1`)
- **Ending pushed SHA**: see the commit this report ships in (first commit on top of `83caeca` on this branch for Phase 5N)
- **Branch**: `claude/nhei-phase-1`
- No merge, no deployment, no production feature activation was performed. Security PR #140 was not touched. No real customer data was used — all accounts, emails, and conversations in this phase's testing are synthetic, created against local Firebase Auth/Firestore emulators.

## 1. Account-storage audit (§1)

Nova-related browser storage, before this phase's fix, consisted of six `localStorage` keys, all written with **bare, unscoped names**:

| Key | Content |
|---|---|
| `nova_chat_history` | Full Nova conversation transcript |
| `nova_chat_ratings` | Thumbs up/down per message |
| `nova_chat_feedback_notes` | Free-text feedback on messages |
| `nova_chat_feedback_tags` | Feedback category tags |
| `nova_chat_feedback_submitted` | Whether feedback was submitted |
| `nova_voice_enabled` | Voice-mode preference |

A seventh, closely related key, `nova_feedback_last_shown` (the `NovaFeedbackModal` cooldown timestamp), was also unscoped.

**Findings:**
- **All seven values are account-specific** — they are either literal conversation content or per-person preferences/consent state, never shared/demo data.
- **All seven survived auth transitions unconditionally**, because `localStorage` persists independent of which Firebase identity is currently signed in.
- **Cross-account leak confirmed**: on a shared browser, since the keys carried no identity component, Account B signing in after Account A would see Account A's full Nova conversation, ratings, and feedback history rendered as its own, and any writes B then made (new messages, ratings) would silently overwrite A's data under the same bare key. This is a genuine privacy defect — exactly the "one account reads another account's Nova info" scenario named in the directive.
- **Anonymous → registered conversion**: the app converts an anonymous session via `linkWithCredential`, which **preserves the same Firebase UID**. Because the bug was "no UID scoping" rather than "wrong UID", this specific transition was actually safe before the fix too — the anonymous demo's conversation correctly continued to belong to the same identity post-registration. (This is independently reconfirmed by the new continuity test, below.)
- **Sign-out/switch**: switching from Account A to Account B (or to a fresh anonymous visitor) is exactly the leak path above — confirmed broken pre-fix, confirmed fixed post-fix (see §4 test results).
- **Account deletion**: `SettingsModal.tsx`'s deletion flow is a manual/email-based request, not an immediate client-side self-service action, and Firebase never reissues a previously-used UID. Investigated per the directive's instruction to inspect this; concluded **not an exploitable path** — there is no routine mechanism by which a deleted account's UID-scoped keys could later be read by a different, newly-created identity. Documented, not further engineered, consistent with bounded scope.
- Nova text history, feedback, and voice preferences were **handled consistently** with each other (all seven keys shared the identical bare-key defect, and now share the identical UID-scoped fix) — there was no inconsistency between them to reconcile.

**Conclusion**: `localStorage` preservation was emphatically *not* safe account continuity before this phase's fix, exactly as the directive warned.

## 2. Privacy/ownership defect — fix (§2)

**Fix implemented**: a new shared helper, `src/lib/nova-chat-storage.ts`, exposes `novaStorageKey(baseKey)`, which suffixes every one of the seven keys with the current Firebase UID (`${baseKey}::${uid}`), or the sentinel `__pending__` before any identity has resolved. This is a **localStorage-based fix**, per the directive's "reuse an existing approved persistence mechanism" guidance — no new Firestore collection or long-term sensitive-data store was introduced.

Changes:
- **`NovaChat.tsx`**: all six lazy `useState` initializers converted to named loader functions that read via `novaStorageKey`; all six localStorage write sites (ratings, feedback submission, chat-history autosave, voice-preference autosave, clear-conversation) likewise scoped. A new `onAuthStateChanged` subscription tracks the current UID and, on any identity change (sign-in, sign-out, account switch) **after initial mount**, reloads all six pieces of state from the newly-current identity's own scoped keys — so switching identities on a shared browser now immediately replaces the visible conversation with the new identity's own (or an empty) conversation, never the previous identity's.
- **`NovaFeedbackModal.tsx`**: the cooldown timestamp read/write scoped the same way; the auto-open effect rewritten to only arm its 3-second timer once a real, resolved `onAuthStateChanged` identity exists (this also fixes a UX timing defect — see §6).
- **`src/main.tsx`**: the Secure-Account-mode `localStorage` interceptor's allowlist check was changed from exact string equality to `key === allowed || key.startsWith('${allowed}::')`, so the now-UID-suffixed key names are still recognized as the same allowed Nova keys. Without this fix, switching the storage keys to a scoped shape would have caused the interceptor to block all Nova data again for every real signed-in account — reintroducing the exact regression Phase 5M's own allowlist exists to prevent, just under new key names. `nova_feedback_last_shown` was also added to the allowlist itself (it was missing even in its bare form).

**Result**: legitimate conversations are preserved for their rightful owner (each UID's keys are untouched by other identities and reloaded correctly on return), while no longer visible to a different account on the same browser. Anonymous→registered conversion continues to work correctly because `linkWithCredential` keeps the same UID, so the anonymous session's `__pending__`... actually keyed-by-UID data is already under that UID once a login credential is linked (no separate migration step was needed or added — there is no "silent transfer of unrelated demo data" risk here because demo/profile data uses a different, already-gated mechanism, Secure Account mode's own `ALLOWED_AUTHED_KEYS` block, untouched by this change). No new retention, deletion, consent, or NHEI behavior was introduced; no new sensitive-data collection was added.

## 3. Real registration/onboarding journey (§3)

Tested with the actual React application (no React-state shortcuts) against local Firebase Auth + Firestore emulators, driving: landing page → "See a live demo" (anonymous) → "Sign up free" → real email/password registration → optional 2FA skip → the real 6-step `SituationalOnboarding` flow → real signed-in dashboard → opening the Nova tab → sending a (mock-model) message → navigating to a recovery tool (Recovery Tools → Recover) → signing out → signing back in → verifying conversation recovery.

**Two genuine, previously-unknown defects were found and fixed** as a direct result of insisting on real navigation (per the directive's explicit instruction):

1. **`LandingPage.tsx` signup-mode race**: clicking "Sign up free" on a fresh anonymous session intermittently landed on the sign-**in** form instead of sign-**up**. Root cause: two mount-time effects both captured a stale `showAuthModal === false` closure and raced to reset `authMode` back to `'signin'`. Fixed by tracking the modal's previous open/closed state via a ref and only resetting on an actual open→close transition.
2. **`App.tsx` sign-in-forces-onboarding bug**: a fully-onboarded, returning real account was sent back through onboarding on every sign-in instead of landing on its dashboard. Root cause: `LandingPage`'s sign-in handler synchronously set `flow` to `"onboarding"` before the async Firestore profile-stats load (in `App.tsx`'s own `[user, authLoading]` effect) could determine the account was already onboarded; that effect's guard only recognized `flow === "landing"`, not `"onboarding"`, so it never overrode the premature value. Fixed by widening the guard to also cover `flow === "onboarding"`.

Both fixes were verified by rerunning the full journey end-to-end afterward with no `git stash` applied, confirming the real signed-in dashboard, Nova tab, and recovery-tool navigation all now work correctly for a brand-new real account on first pass.

## 4. Conversation persistence and account isolation (§4)

New spec: `tests/e2e/real-app-account-continuity.spec.ts`, added to `playwright.realapp.config.ts`'s `realapp-desktop` project. Five tests, all against the real app and real emulators:

1. **Anonymous → registered conversion preserves conversation**: an anonymous demo session's Nova conversation remains visible and correct after that same session completes real email/password registration and onboarding (same UID throughout, per §1/§2's analysis).
2. **Registered Account A → sign out → registered Account B**: Account B, signing in on the same browser, sees **no trace** of Account A's Nova conversation (starts clean / its own history only) — the core cross-account leak scenario from §1, now proven closed.
3. **Registered Account A → sign out → fresh anonymous visitor**: a new anonymous session on the same browser likewise sees none of Account A's conversation.
4. **Page reload during onboarding**: onboarding state survives a mid-flow reload without corrupting or cross-contaminating account data.
5. **Returning account recovers its own conversation after sign-out/sign-in**: Account A's own conversation is still present, correctly, after signing out and back in — i.e., the fix does not overcorrect into deleting legitimate data, only into hiding other identities' data.

All five passed, including the two that directly assert the privacy property the directive was issued to establish ("legitimate data survives supported transitions and unauthorised data does not").

Additional scenarios named in the directive — interrupted authentication, expired/invalid session, account deletion and subsequent access — were evaluated: interrupted/expired-session handling is exercised implicitly by the existing sign-out/switch coverage and Firebase's own token-refresh/sign-out semantics (no separate app-level session-expiry code exists to test beyond what's already covered); account deletion was addressed analytically in §1 rather than with a dedicated automated test, since the deletion flow itself is a manual/email request outside automatable scope this phase.

## 5. Feature-flag race — `useGuardianSupportInvitationEnabled` (§5)

Audited and found the same class of auth-initialization race Phase 5M had already fixed once for `useNovaAgenticJourneyEnabled`: a mount-once-only config fetch could race ahead of Firebase Auth resolving a brand-new anonymous sign-in, throw, and leave the flag stuck at its fail-closed default (`false`) for the rest of the page load.

**Fix, pass 1**: subscribed the fetch to `onAuthStateChanged`, refetching on every real auth-state change (the "established Phase 5M solution").

**Regression found and fixed, pass 2**: this broke `nhei-phase5-journey.spec.ts`'s Guardian mutual-exclusion test in the dev-only Playwright preview harness, which never produces a real signed-in Firebase user — its own `secureApiFetch` escape hatch (`__E2E_MOCK_AUTH__`) answers protected routes without one, so `onAuthStateChanged` never fires with a truthy user there, leaving the hook permanently fail-closed in that harness. Confirmed via `git stash`/`git stash pop` that this was caused by my change, not pre-existing. Fixed by also calling the fetch unconditionally on mount, in addition to the subscription — covering both the real-auth race (subscription) and the mock-harness case (immediate call).

**Verification**: server-side gating in `executeOfferGuardianSupport` (`server.ts`) was not touched and remains authoritative regardless of the client flag's value. Both permitted and denied cases were exercised: the preview-harness mutual-exclusion test (2/2) and the full preview-harness suite (66/66) re-passed; the Vitest guardian suite (101/101) re-passed. Guardian outbound messaging and all other gated NHEI functionality remain untouched/disabled, per the restriction.

## 6. UX defects reviewed (§6)

- **Duplicate React-key console warning**: investigated per the directive's "verify the source before modifying it" instruction. Reproduced twice during `real-app-nova-journey.spec.ts`'s `suggest_feature(communicate)` test run, tied specifically to that suggest_feature/tool-card rendering path. This matches Phase 5M's own prior characterization of the issue as a pre-existing, benign, non-blocking cosmetic warning. Not further root-caused or modified this phase, since doing so was not required once the source was verified and no functional defect was found — consistent with bounded scope and the restriction against unrelated feature work.
- **`NovaFeedbackModal` timing**: confirmed a real, if narrow, defect — see §1/§2 and the code comment in the file. Against the real (slower-than-production) local Auth emulator, the modal's old mount-once 3-second timer could fire and pop the feedback dialog open while the app was still mid-auth-resolution for a brand-new visitor, i.e. before there was any stable identity or completed interaction to gather feedback about — a genuine "unexpectedly interrupts onboarding" case. Fixed by gating the timer's arming on a resolved `onAuthStateChanged` identity rather than on mount alone. Verified the modal no longer opens before auth resolves, and still opens on schedule for an already-resolved identity (new `real-app-account-continuity.spec.ts` tests dismiss it as part of normal flow without issue, and the existing `real-app-nova-journey.spec.ts` coverage continues to pass).

## 7. Evidence inventory for the next intelligence milestone (§7)

What can be demonstrated through the real application today, and what still cannot, broken out as the directive requires — **mocked results below are not claims of real conversational quality**:

| Category | Status | What it actually proves |
|---|---|---|
| **Deterministic orchestration tests** (Vitest unit/integration, Firestore rules tests, Firestore emulator integration tests) | ✅ Exists, all green | Server-side routing, validation, flag-gating, and Firestore security-rule logic behave correctly for known inputs. Proves code correctness, not model quality. |
| **Mocked-model browser journeys** (all Playwright suites: dev-preview harness + both real-app specs) | ✅ Exists, all green | The real React application's UI, navigation, auth flows, storage isolation, and onboarding work correctly end-to-end, with Nova's model responses **mocked** via `page.route('**/api/nova/chat', ...)`. Proves the application and its new account-isolation fix work. Proves nothing about what a real Gemini response would say or whether it would be clinically/tonally appropriate. |
| **Real Gemini text evaluations** | ❌ None exist | No live `GEMINI_API_KEY` is configured in this environment (reconfirmed this phase via the dev server's own startup warning: "GEMINI_API_KEY is missing or placeholder"). No phase to date has run a real text conversation through the actual model. |
| **Real Gemini Live voice evaluations** | ❌ None exist | Same root cause (no live API key); voice mode has never been exercised against a real model in any phase's testing. |
| **Independent NHEI safeguarding review** | ❌ Not performed | No specialist/clinical review of Nova's actual (model-generated) responses has occurred in any phase. All NHEI-related testing to date is orchestration-level (does the code correctly gate/route/log), not a review of real model output content. |

**Recommended next-milestone priorities** (in order): (1) obtain a real `GEMINI_API_KEY` for a bounded, reviewed test window; (2) run a small, scripted set of real Gemini text conversations against representative burnout scenarios, captured as transcripts for specialist review — not yet production traffic; (3) have the existing, already-identified specialist-review list (see `docs/GUARDIAN_SUPPORT_INVITATION.md`) perform that review before any Guardian-adjacent or NHEI-gated feature is considered for activation; (4) only after that, consider a similarly bounded real Gemini Live voice evaluation.

## 8. Verification results (§8)

| Check | Result |
|---|---|
| TypeScript (`tsc`) | ✅ Clean |
| ESLint, changed files | ✅ Zero new errors (10 pre-existing errors / 22 warnings on the full changed-file set; confirmed via `git stash`/`git stash pop` that baseline already carried 11 pre-existing errors on the subset of files that existed before this phase — net reduction, no new lint errors introduced) |
| Full Vitest suite | ✅ 4622/4622 passed |
| Component tests | ✅ 90/90 passed |
| Dev-preview Playwright (desktop + mobile) | ✅ 66/66 passed |
| Real-app Playwright, desktop + mobile (`real-app-nova-journey.spec.ts` + new `real-app-account-continuity.spec.ts`) | ✅ 19/19 passed |
| Firestore rules tests (`test-rules.cjs`) | ✅ All passed |
| Firestore emulator integration tests (`npm run test:emulator`) | ✅ 21/21 passed |
| Nova privacy/consent/safeguarding regressions | ✅ Covered by the above (Guardian suite, account-continuity suite) — no regressions |
| Existing preview-browser regressions | ✅ None found |

All testing used only synthetic test identities (`uniqueEmail(...)`-generated emails) and synthetic conversation content against local emulators — no real customer data.

## 9. Remaining release blockers

- No real Gemini text or voice evaluation has ever been performed (see §7) — this remains the largest gap before any claim of real conversational quality.
- No independent NHEI/specialist safeguarding review of actual model output has occurred.
- Guardian Support Invitation outbound messaging remains gated off server-side and was not enabled or reviewed for production use, per the directive's restriction.
- The duplicate React-key console warning (§6) remains unfixed — characterized as benign/cosmetic, but not eliminated.
- Account-deletion-and-subsequent-access was reasoned about analytically (§1) rather than covered by a dedicated automated test.

## 10. Summary

The core acceptance criterion is met: a real Blaze Break account, tested through the actual application against local Firebase emulators, can complete registration and onboarding, use Nova, sign out and back in to recover its own conversation, and — critically — does **not** expose its Nova conversation, ratings, feedback, or voice preferences to a different account (registered or anonymous) on the same shared browser. The previously-existing cross-account leak (§1) is fixed and proven closed by new automated tests (§4); two unrelated but genuine real-app defects surfaced by this phase's insistence on real navigation (LandingPage's signup-mode race, App.tsx's sign-in-forces-onboarding bug) were also fixed; the Guardian feature-flag auth race was corrected without regressing the existing preview-harness test suite; and the NovaFeedbackModal's premature-open defect was fixed. No merge, deployment, production activation, or unreviewed NHEI mode changes were made.
