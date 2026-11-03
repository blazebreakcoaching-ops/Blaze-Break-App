# Claude Code — Blaze Break project instructions

This repository's owner has selected **Blaze Break Ember / Executive Calm** as the approved website and app design. Do not invent, substitute, or independently redesign it.

## Visual design is LOCKED
- Source of truth: `docs/EMBER_DESIGN_LOCK.md`, `docs/EMBER_EXECUTIVE_CALM_HANDOFF.md`, and the approved implementation on `cto/ember-executive-calm-20261103` (or its integrated successor).
- Retain **Sunset Sanctuary** (cinematic dark charcoal/orange sunset), **Warm Atelier** (warm ivory/orange daytime UI), and **Midnight Focus** (charcoal/amber Nova and recovery).
- Use the real Blaze Break circular brush-ring logo: **white ring with flame on dark**, **orange-to-red gradient ring on light**. The existing `BlazeBrandLogo` component selects assets by theme. Never replace the logo with a generic flame, letter B, or new symbol.
- Keep the existing information architecture, working CTAs, role gates, user data and safety functionality.
- Do not change typography, layout, imagery, colours, navigation, animation style, or hero copy based on personal taste. A redesign proposal is **not** an implementation instruction.
- Fix defects narrowly (spacing, contrast, responsiveness, broken functionality) and show before/after screenshots. If a change materially departs from the approved design, stop and request explicit owner approval.

## Engineering and release
- Work in large, verified batches, but touch only files needed for the task.
- Run TypeScript, lint, production build, automated tests, the full offline release gate, and responsive dark/light visual review.
- Use Firebase/GCP for the app, not Supabase, Lovable or Vercel. Do not use GitHub Actions.
- Do not weaken tests or bypass production security controls.
- Do not merge into `main`, alter Firestore rules, or deploy production without explicit release approval and clean verification.
- Keep native mobile App Check/MFA and physical-device blockers separate from the web design release.
- Do not silently overwrite other engineer branches. Reconcile and report conflicts.
- Report exact commit IDs, changed files, test outcomes, screenshots and remaining blockers.

## When resuming a task
First identify the actual working branch and current upstream head, then read `docs/EMBER_DESIGN_LOCK.md`. If mockup references are not accessible in the coding environment, say so rather than substituting another visual direction.
