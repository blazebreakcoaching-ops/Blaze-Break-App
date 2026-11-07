# Blaze Break — Quiet first visit and privacy QA (7 November 2026)

**Branch**: `cto/customer-first-experience-20261106`  
**PR**: #155 (draft, not merged).  
**Status**: Code changes and regression tests committed; tests **NOT EXECUTED**, deployment **NOT PERFORMED**.

## Customer-first behaviour now implemented

1. Registration / MFA / situational onboarding complete first.
2. The first visit presents the existing personal welcome. It has a prominent **Show me around** option which opens the optional five-step Nova Guide after dismissing welcome, never on top of it.
3. **Daily Check-In no longer opens automatically when the app mounts.** Today offers a small, voluntary “Or do a daily check-in” entry. Existing check-in tools and the user's intentional check-in nudge action still work.
4. Brand-new accounts receive the first welcome in place of a redundant What's New overlay. The current release announcement version is stored in their user stats immediately on onboarding completion; the version constant is shared with the WhatsNewModal renderer.
5. Existing accounts may still see What's New on an idle, uninterrupted visit, but this informational timer is paused during a welcome, Nova Guide, coach marks, an active daily check-in, settings, walkthrough, support and launcher.
6. InAppNudge is also suspended during these higher-priority tasks, including after its own asynchronous eligibility reads.
7. On shared browsers, in-app reminder content and preferences are scoped to the currently signed-in Firebase UID. An async response from a previously signed-in user cannot reactivate that user's nudge in the new account. Local reminder cooldowns are now UID-scoped as well.
8. No changes to authentication, Firebase MFA gates, production Cloud Run, Stripe, plan entitlements, AI model calls or live backend secrets. All write commits used `[skip ci]`.

## Tests written — not run

- `src/lib/quiet-first-visit.test.ts`: all passive-prompt suspension conditions.
- `src/lib/nudge-visibility.test.ts`: cross-account reminder isolation and cooldown key scoping.
- `tests/e2e/real-app-account-continuity.spec.ts`:
  - a first-time user can move from welcome into Nova Guide without stacked dialogs;
  - a new user sees no forced Daily Check-In or What's New; the check-in opens only after explicitly selecting it.
- The existing registration, mobile viewport and account-continuity browser tests remain in the same suite.

## Acceptance gates

Before beta:
- Run TypeScript, ESLint, unit/component tests and frontend/backend build **at the exact PR head** with no GitHub Actions expenditure unless the owner authorizes it.
- Run Playwright real-app tests with local Auth/Firestore emulators on mobile and desktop; verify only one modal at a time on new registration, no unsolicited post-welcome popup, optional check-in and accessible Nova Guide entry.
- Test registered user sign-out / sign-in / identity switching, anonymous demo conversion, password recovery, email verification, MFA, profile save/reload and App Check in **private staging**.
- Confirm both Nova advanced journey flag states, keyboard focus return, screen-reader naming, safe-area/short-phone scrolling and reduced motion.
- Reconcile `main`'s existing push-triggered deployment workflow against the release branch's manual-only workflow before any merge.
- Obtain the owner's explicit approval for the exact final staging-verified release SHA. No production deployment has been performed here.

This note is a source review/QA plan, not a claim that browser tests passed.
