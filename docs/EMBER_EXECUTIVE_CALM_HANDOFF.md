# Blaze Break — Ember / Executive Calm UI handoff
**Date:** 3 November 2026  
**Design branch:** `cto/ember-executive-calm-20261103` (based on `claude/nhei-phase-1` at `803394fee4fe2216f7308c14eeb0b7483073530c`)  
**Status:** Source changes committed; production build, browser screenshots and real-device checks **not run** in ChatGPT's GitHub-only environment.

## Implemented
- Shared semantic light/dark warm-neutral palette in `src/index.css` without changing API, Firebase, Firestore or entitlement code.
- Reusable `ember-*` classes: `ember-shell`, `ember-sanctuary`, `ember-workspace`, `ember-nav`, `ember-logo`, `ember-hero`, `ember-title`, `ember-heading-glow`, `ember-kicker`, `ember-orbit`, `ember-soft-action`, `ember-feature`, `ember-pulse`, `ember-midnight`, `ember-nova-mark`.
- Sunset Sanctuary: public landing page with warmer backdrop, legible gradient display text, narrower mobile navigation and full-width mobile CTA options.
- Warm Atelier: signed-in workspace/sidebar, mobile-first content padding and Pulse card surfaces.
- Midnight Focus: Nova Blaze chat interface and reset/micro-recovery surfaces.
- Onboarding: more usable mobile padding, calmer surface treatment, Nova Blaze visual.
- Accessible treatments: visible keyboard focus on Ember action surfaces, shared dark-mode tokens, high-contrast border option, reduced-motion handling and nonessential glow rather than constant attention-demanding animation.

## Engineering scope and safeguards
- This batch touches styling and labels only; no security, billing, data persistence, permissions, backend routes or Firestore schema changes.
- Existing buttons retain their original action handlers and route destinations.
- This is a first *implementation batch*, not a claim that every screen has been visually reviewed or rebuilt.
- No merge, deploy or GitHub Actions were initiated by ChatGPT.

## Required Claude Code verification before deploying
1. Fetch `cto/ember-executive-calm-20261103` and compare with `claude/nhei-phase-1`, confirm changes are UI-only.
2. Run `npm ci`, `npx tsc --noEmit`, `npx eslint src/App.tsx src/components/LandingPage.tsx src/components/HomeSection.tsx src/components/NovaChat.tsx src/components/ResetStudio.tsx src/components/NervousSystemReset.tsx src/components/MicroRecovery.tsx src/components/SituationalOnboarding.tsx --config eslint.cleanup.config.js`, `npm run build` and `npx vitest run`.
3. Run the repository's full `npm run verify:release:offline -- --all` release check; capture specific failures instead of reclassifying them as passes.
4. Review the UI at 320px, 375px, 390px, 768px and desktop widths in both dark/light modes. Cover first-visit, sign-in, sign-up, consent, demo, Pulse, Nova Blaze and each reset screen. Check no horizontal scroll, no hidden primary action, legible buttons, keyboard focus and reduced-motion behaviour.
5. Check that role gates, payment, privacy controls and emergency support still work. Investigate Report 30's intermittent Playwright real-app failures separately.
6. Reconcile security PR #140 and outstanding Firebase/GCP/EAS, App Check, native MFA and device-testing blockers before deciding on production release.
7. After green checks and an explicit release decision, merge the approved changes into the intended deployment branch, deploy with authenticated tooling, smoke-test the live website and retain a rollback target.
8. If release is blocked, **do not** bypass security or invent a green check. Report exact owner action required.

## Design mapping
- **Sunset Sanctuary:** `LandingPage.tsx`, onboarding.
- **Warm Atelier:** `App.tsx`, `HomeSection.tsx`.
- **Midnight Focus:** `NovaChat.tsx`, `ResetStudio.tsx`, `NervousSystemReset.tsx`, `MicroRecovery.tsx`.
