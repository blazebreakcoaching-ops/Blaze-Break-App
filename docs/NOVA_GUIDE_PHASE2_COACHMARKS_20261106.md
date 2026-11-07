# Nova Guide — Phase 2: anchored coaching on real screens

Status: **source committed for review, not built/tested/deployed in this conversation**.
Repository: `blazebreakcoaching-ops/Blaze-Break-App`
Release: draft PR #155 on `cto/customer-first-experience-20261106`.

## Implemented

- A separate **NovaCoachMarks** component overlays the existing screen only when the person selects `Show me on this page` in the five-step Nova Guide, or `Show me how` inside Nova's conversation.
- Highlights are sourced from the actual DOM of four currently accessible customer screens:
  - **Today:** quick reset, talk with Nova, expandable check-in/progress area.
  - **Check-in:** the current assessment or its actual result card.
  - **Nova:** the help button and the real text composer.
  - **My Plan:** the actual plan summary, or its locked-state explanation before the required check-in is completed.
- Each highlight has one short scripted explanation and Next/Back/Skip or `Try it myself`. The last action dismisses the overlay and focuses the real target; it **never clicks the target or triggers a recovery action automatically**.
- Missing, hidden or loading controls show an honest no-target explanation. The code never invents a button, bypasses a subscription or creates another page.
- Anchors update on browser scroll/resize. Initial targets can be discovered after a lazy-loaded page mounts. Small-phone layouts use a scrollable guide card. The guide respects reduced-motion settings.
- The **same Show me how callback** passes through both the plain NovaChat view and the optional NovaAgenticJourney wrapper; it **does not send a chat message or create an AI provider charge**.
- Nova's chat header can wrap on narrow mobile screens to accommodate the new optional button.
- Existing advanced/staff Walkthrough remains unchanged, and all role and feature gates continue to apply. No new Firestore tables, secrets or backend endpoints.

## Tests authored, NOT executed

- `src/lib/nova-coach-marks.test.ts`: targets, short copy, customer scope, unknown-screen fallback.
- `src/components/NovaCoachMarks.test.tsx`: step control, absent-target fallback, real DOM target highlight and voluntary try action.
- `tests/e2e/real-app-nova-journey.spec.ts`: in-chat Show me how, zero new /api/nova/chat requests, optional Today invitation, handoff from the illustrated tour to actual highlighted Today button.

Before merge: typecheck, full frontend/backend build, Vitest node and component suites; then real-app Playwright against local Auth/Firestore emulators and the current exact branch head (desktop, 320/375/390px phone and tablet, both Ember themes, keyboard, screen reader, reduced motion, focus return and App Check isolation). Run both NovaAgenticJourney flag states. Confirm that legal/auth/modals, active chat input and data save/reload continue to work. No production credentials required for local tests.

## Limitations and deferred polish

- This is **scripted Nova UI guidance**, not a new AI agent. No automatic detection of user confusion, behavioural monitoring or personalised model responses.
- Decorative scenes still use accessible icons, not a licensed bespoke animation/illustration pack.
- A coach mark points to a real control or real card; it does not manipulate a user's values or activate the UI. Opened sections and gated features keep their existing rules.
- The existing onboarding welcome and mobile-navigation timing should be checked in a real browser before public beta; this source review is not a substitute for acceptance testing.
- `main` presently has a push-triggered production deploy workflow. The candidate changes this to manual-only, but **do not merge or deploy until the actual merged workflow and security/staging release gates have been reviewed, with explicit owner authorisation**.

All commits in this phase include `[skip ci]` by request to avoid GitHub Actions charges.
