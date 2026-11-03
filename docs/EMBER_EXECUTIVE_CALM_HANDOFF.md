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


## Visual reference upgrade — 3 November, follow-up batch
The user supplied two approved Blaze Break logo variants and two dark/light visual mockups. This update implements their theme direction on the same UI branch.

### New or updated code
- `src/components/BlazeBrandLogo.tsx` centralises the actual responsive light/dark logo swap. Light uses `public/brand/ember-logo-light.svg` (small transparent, optimised copy of the supplied gradient logo); dark reuses the previously checked-in `public/brand/flame-mark-dark.png` (white brush ring with orange flame).
- `public/brand/ember-sunset.svg` is an original lightweight scenery illustration used as decorative background. It is **not** a photorealistic copy of the reference mockup.
- `LandingPage.tsx` now uses a left-aligned scenic hero, the reference-inspired “High performance without the burnout.” page H1, real CTA handlers, four short principle labels, and a compact mobile navigation bar.
- `App.tsx` uses the shared logo and gives the existing real Pulse greeting and Reset page headers scenic surfaces; risk messaging remains driven by real data.
- `NovaChat.tsx` applies Midnight Focus styling while retaining the existing conversation, voice-feature gates and real send handlers.
- `ResetStudio.tsx` gains scenic background, accessible card sizing and mobile typography.
- `index.css` centralises the new responsive light/dark surfaces and adds an optional hover/focus Ember Orbit border trace that respects reduced-motion preference.

### Verification notes and release restrictions
- Source checks confirmed both logo files and sunset artwork exist in the branch, but **no local build, browser screenshot or automated test run** was possible through this connected GitHub editing workflow.
- This is a visual interpretation of the approved mockups, not a guarantee that every page is pixel-identical.
- Test the marketing heading change against existing e2e assertions; update tests only if expectations legitimately changed, never by weakening behaviour.
- Check the narrow mobile header, light SVG rendering in Safari, dark image blending, primary CTA states, focus rings, real Pulse values and recovery screen access.
- Do not merge or deploy production until the mandatory tests, security review and release decision are complete. Keep GitHub Actions disabled.

