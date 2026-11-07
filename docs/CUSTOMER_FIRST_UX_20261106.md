# Blaze Break customer-first UX change — 6 November 2026

This is a source-code review branch. No production or staging deployment has been performed.

## What changed
- Anonymous landing: one primary check-in CTA, discreet optional demo, real sign-in action (not mistaken for anonymous Firebase bootstrap), no marketing feature tiles.
- Onboarding: "Step X of Y", no confusing synchronisation percentages; consent controls and saved field names unchanged.
- Nova: welcoming, human opening instead of operational jargon. Names are included only if the user's profile permits them. Tone and questioning-style controls remain available under Preferences.
- Navigation: individuals, employees and executives see Today, Nova and Recovery Plan first. A visible "Explore all tools"/"More" control reveals the other existing role- and subscription-gated pages. Active pages reached from a real CTA are retained in navigation. Managers and admins retain their full navigation.
- Safety: role entitlements, Nova conversation history, account sign-in, privacy, crisis support and existing tool implementations are unchanged. The advanced-view preference is intentionally ephemeral, not a user profile or Firestore change.

## Before a public beta
- Run TypeScript, ESLint, production build, unit/component tests and browser checks against the exact head SHA.
- Manually inspect light and dark landing, onboarding, Today, Nova and the More/Explore flow on 320, 375, 390, 768 and desktop widths.
- Check real authentication and App Check staging flows before release; do not silently point staging to production data.
- This patch does not replace the simplified SVG landscape with a photographic hero; visual approval is separate.
- Do not merge to main or deploy Cloud Run or Firestore rules without reviewing the consolidated release gate and backup/rollback plan.
