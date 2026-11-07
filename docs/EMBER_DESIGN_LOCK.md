# Blaze Break — APPROVED EMBER DESIGN LOCK
Status: **design direction approved by the owner; do not redesign without explicit approval.**  
Last recorded: 3 November 2026.  
Design implementation: `cto/ember-executive-calm-20261103`.  
Read `docs/EMBER_EXECUTIVE_CALM_HANDOFF.md` for the current code mapping and incomplete test status.

## 1. The design we're preserving

The owner chose a warm sunset, premium wellness product language: calming, cinematic, focused and sophisticated rather than clinical SaaS. There are two visual environments, not two competing product brands:

| Mode | Visual direction | Palette | Expected experience |
|---|---|---|---|
| **Dark: Sunset Sanctuary / Midnight Focus** | charcoal/near-black surfaces, glowing golden-hour orange, warm mountain/sunset scenery, restrained halos | ivory typography, charcoal, burnt orange, amber/gold | premium, cinematic, legible; Nova and recovery screens feel quiet and purposeful |
| **Light: Warm Atelier** | warm ivory/sand surfaces, sunset copper/orange highlights, warm scenic accents, clean breathable white-space | warm off-white, cream, stone, burnt orange | daytime readability without reverting to generic white SaaS styling |

### Brand identity (non-negotiable)
- **Dark:** use the real white brush-ring logo with orange flame and Blaze Break wordmark/tagline, existing file `public/brand/flame-mark-dark.png`.
- **Light:** use the owner's approved orange→red gradient brush-ring mark, `public/brand/ember-logo-light.svg`. If this optimised asset renders poorly, replace it only with a higher-quality export of the **same user-supplied logo**; do not substitute a different design.
- Theme switching is centralised in `src/components/BlazeBrandLogo.tsx`. Preserve the logo's actual circular silhouette, flame and typography; no generic B glyph or new flame.
- Brand line: **Rethink · Reflect · Rejuvenate**.
- Coach name: **Nova Blaze**.

## 2. Approved screens and layouts

### Landing page — Sunset Sanctuary
- Desktop: cinematic sunset/mountain background, comfortable left-aligned hero text, strong display headline **“High performance without the burnout.”**
- Supporting description must accurately describe the app, not promise clinical treatment or fabricated biometric measurement.
- Real buttons retain their real click handlers: **Get Burnout Fingerprint** and **See a live demo**. Do not add a purchase button or fake navigation.
- Four concise visual principles in a subtle glass/card band: Reset, Refocus, Perform and Rejuvenate.
- Small screens: logo and actions fit safely, hero legible, no horizontal scroll, contrast remains high; avoid oversized desktop heading or hidden CTA.
- Current lightweight sunset artwork is `public/brand/ember-sunset.svg`. It captures the colour direction but **does not yet reproduce the photographic landscape mockups**. Do not falsely describe it as a pixel-identical implementation.

### Pulse
- Keep the real user-specific greeting and real recovery/risk state.
- Apply warm backgrounds and scenic accents behind the genuine Pulse interface; don't invent numbers, user names, scores, activities or dummy cards for production.
- Preserve check-in actions and existing role gates.

### Nova Blaze
- Midnight Focus: dark, minimal conversation room with amber halo around the Nova mark, clearly legible messages and accessible controls.
- Existing AI messages, tone/style controls and voice-entitlement gates remain functional.
- No arbitrary chatbot redesign, removal of conversation history, or re-labelling of tools.

### Reset Studio and guided recovery
- Retain real available reset pathways and their navigation.
- Scenic accents can support the header or a recovery card; never replace the functional controls with decorative screenshots or misleading play buttons.

### Shared UI
- Use `src/index.css` semantic variables and existing `ember-*` design primitives; avoid page-specific hard-coded palettes that break light/dark switching.
- Emphasise one primary action at a time. Large hit areas, readable labels, clear focus indication, neurodivergent comfort.
- Amber edge trace/glow is subtle on hover, focus or press, **not** a constant strobe. Respect `prefers-reduced-motion`.
- Responsive widths to check: 320, 375, 390, 768 and desktop. No horizontal scrolling or clipped text.

## 3. Engineering guardrails
- This is a **visual lock**, not a ban on fixing defects.
- Keep user data, authentication, account upgrades, Nova history, privacy controls, support routes, Firestore rules, subscriptions and feature entitlements unchanged unless the explicit task is a verified bug fix.
- Do not remove features or invent new functions to resemble a concept image. Functional fidelity outranks pixel-perfect decoration.
- If implementing a more literal photographic background, the owner must approve/licence the actual asset and its usage; preserve performance and accessibility.
- Any proposed departure (new brand, colours, typography, layout, navigation, logo, hero copy) requires a short before/after comparison and explicit owner approval **before** code changes.
- UI review should include real browser screenshots for both themes plus desktop/mobile, not just source diff. Run `npm run build`, typecheck, lint, relevant tests, and `npm run verify:release:offline -- --all`. State exact failures truthfully.

## 4. What Claude Code should do
**Verify and polish the existing code**, not design a competing product. Match the approved Ember direction. If the latest visual reference images from the owner's chat are unavailable, ask the owner to supply them into the build environment before claiming visual match. Changes to launch and infrastructure are separate from design approval. No main merge or production deploy without explicit release permission.

## 5. Important distinction
The approved mockup and the GitHub implementation are not yet a fully validated pixel-for-pixel match. They are aligned in concept; the repository contains the first functional implementation. Keep this limitation visible in reports instead of replacing the design or declaring the design complete based solely on tests.
