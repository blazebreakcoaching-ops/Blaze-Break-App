# Blaze Break — first 10 beta testers: operational plan
Owner: Founder / CTO
Prepared: 7 November 2026
State: **Draft readiness plan. Do not invite anyone to enter real personal wellbeing data until staging privacy/security checks pass.**

## Purpose
Validate whether a busy founder, owner or manager can use Blaze Break safely and understand the next step with little or no instruction. Ten genuine, voluntary testers are the first target; invitations and completions are not yet claimed.

## Before sending invitations
- Verify the **exact** PR release SHA in a clean checkout: build, lint, unit/component tests, Firebase Auth/Firestore emulators and Playwright browser journeys.
- Verify private staging with two registered test accounts on a single browser, no cross-account memories, profiles, pulse history, notification preferences, voice, chat or AI responses.
- Verify role boundaries, MFA challenges, token expiry, email verification, App Check, security rules, error handling, privacy centre and delete/export handling.
- Confirm actual staging environment, consent wording, help options, rollback owner and emergency pause for the beta.
- Publish a privacy-appropriate feedback channel. **Never automatically attach full chat transcripts, assessment answers, health information or credentials to bug reports.**
- Disable unfinished paid integrations and default-off experiments. Do not advertise unimplemented Stripe, Zoom or AI capabilities.

## Recruitment
Aim for ten adults matching the intended customer profile and varying comfort with technology. Invite a mix of founders, self-employed people and managers. Confirm each person understands this is a test, not a replacement for clinical or emergency care. Participation is voluntary and they can stop or delete their test information.

Track in a private founder sheet: tester ID/pseudonym, invitation status, consent, device/browser class, onboarding outcome, feedback received, follow-up consent. Avoid storing coaching responses or sensitive diagnoses in that sheet.

## First session — use this exact short customer journey
1. Open the **public landing** and identify one clear start action.
2. Sign up (or try anonymous demo), then finish onboarding; confirm the app only says complete **after** data is saved.
3. See Today's one-step welcome; optionally choose **Show me around**. Check the guide can be skipped.
4. Find **I need a moment** and **Talk with Nova** without searching through every tool.
5. Open a check-in voluntarily, verify save/retry and clear progress, and return to Today.
6. Open Nova Chat, send a harmless test question, navigate away, return, and verify correct session continuity.
7. Find notification and privacy controls. Disable learning; verify no unexpected saved-memory use.
8. Sign out and back in. Confirm their own data returns. A different test account on the same browser must see **none** of it.
9. Find the existing **Settings → Feedback** route and submit a test bug/UX observation (no personal chat content).
10. Record whether the experience feels straightforward or confusing, what made them hesitate, and any consent/privacy concern.

## Simple exit questions
- What were you trying to do?
- What happened instead?
- Which screen felt confusing or too busy?
- Could you find help, privacy controls and a way to stop?
- Would you use this again? Why or why not?

## Triage rules
**P0 (stop testing)**: another account's data shown, unsafe permissions, account deletion/export failures, duplicated or lost personal data, authentication bypass, sensitive information in logs, unrecoverable sign-in.
**P1 (fix before larger beta)**: onboarding blocked without clear retry, keyboard hidden send button, consent control not respected, app crash, lost check-in, incorrect navigation or inaccessible core action.
**P2 (scheduled refinement)**: typography, secondary animations, obscure non-blocking features, non-critical cosmetic issues.

Open GitHub issues with: pseudonymous tester ID, device class, expected/actual result, reproducible steps using **test data**, severity, and PR/commit. Do not paste private coaching conversations.

## What to measure
- Ten invitations accepted and ten testers who actually try the app (report separately).
- Registration completion, onboarding completion, ability to find first useful action.
- Number of P0/P1 issues, successful chat/check-in journeys, feedback submitted.
- Time/steps to first useful action, as observed during voluntary sessions, not guessed from code.
- First-paying-customer conversations tracked separately from beta testing; no implied conversion.

## Explicit remaining blocker
PR #155 is **draft, unmerged and untested in full** at time of this document. This is preparation, not permission to give customers a live link. Tomorrow's private staging verification is a mandatory separate gate.
