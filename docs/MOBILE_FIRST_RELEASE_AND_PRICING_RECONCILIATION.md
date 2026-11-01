# Blaze Break — Mobile-first release and pricing reconciliation

**2026-11-01 · CTO implementation brief · development branch only · NO LIVE PRICING OR DEPLOYMENT AUTHORISED**

## Release priority: native mobile is the lead product

The existing `mobile/` directory is a genuine Expo/React Native app, **not** a WebView wrapper. Its current bottom navigation is three tabs: Pulse, Check-in and Reset. The full Nova Agentic Journey (Before Words, Invisible Load, Proactive Suggestions, Calendar Protection and Task Deferral) is in the web `src/App.tsx`, **not in the native app**. The web Playwright Pixel 7 viewport is not proof that the Expo app works on a real iPhone or Android device.

Native App Check is presently an explicit empty-token stub: `mobile/src/lib/app-check.ts` returns `''`. Protected real backend routes therefore cannot work on a production device build yet. Firebase Auth/Firestore and some local flows work in Expo Go; real App Check needs properly registered iOS/Android Firebase apps and an EAS development-client build with real native modules. `mobile/docs/CONSOLE_SETUP.md` identifies the prerequisite config and dev-client work. Verify which project/environment to register before setting anything in a console; the current doc assumes the production project and is NOT an authorisation to use it for tests.

The `mobile/app/(tabs)/index.tsx` Pulse recommendation card currently advertises 'Talk it through with Nova' for an unhandled destination, but `TAB_ROUTES` has no `nova` route and pressing the button does nothing. **Fix the native destination when adding a real Nova tab; do not ship a dead CTA.**

## Mobile P0 — real device functional gate (must pass before any launch)

1. Native App Check and signed-in backend access, in a safely isolated test environment. Verify real Firebase Auth/Firestore project + named database + API routing. No real-user records in development.
2. Implement a native **Nova tab**, with text conversation against the existing authenticated `/api/nova/chat` route; use the same server-controlled entitlement limits, privacy and safety rules. Do not port web components by copying DOM code into React Native.
3. Implement the mobile-native path into existing advanced Nova functions behind the same server-authoritative `NOVA_AGENTIC_JOURNEY_ENABLED` release gate. Make optional Before Words accessible. Integrate Invisible Load, proactive suggestions and safe Calendar/Task proposal review without ever attempting external writes.
4. Fix Pulse's unroutable Nova recommendation CTA, and ensure natural, persistent bottom navigation. Use safe-area + keyboard avoidance; readable text and touch targets; robust loading, offline, error and retry states; accessibility labels and screen reader support.
5. Test on **physical iPhone and Android devices** (not merely web responsive viewport). Verify both small screens and large text, sign-in/out, returning background/foreground, expired session, interrupted network, App Check token refresh, history isolation between accounts, Firebase consent, and no secret/chat-content logging.
6. Protect account export, deletion and support features on every plan. Verify the production Web/Expo feature flags agree; keep safety and consent functions available regardless of payment status.
7. Prepare separate preview/internal builds and approval gates. Neither publishing nor main-branch merging is implied by this brief.

## Native mobile P1 — release economics and payments

The current web pricing source of truth in `entitlements.ts` is **Free £0, Core £34.99/mo or £349/yr, Performance £49.99/mo or £499/yr, Executive £69.99/mo or £699/yr**. `src/components/SubscriptionCentre.tsx` uses this live server pricing endpoint and explicitly says plan changes are still manual: the 'Request' buttons currently have no checkout handler.

The latest **commercial pricing direction discussed** is **Essential £5.99/mo (limited fundamentals), Continuity £24.99/mo, Executive £59.99/mo**; these are **provisional product hypotheses**, NOT the prices in repository code and NOT approved live Stripe/App Store/Play Store prices. Free discovery/trial should be decided separately; 14-day trial has been discussed but not configured as a verified live checkout. Do NOT silently replace `PLAN_PRICING`, entitlements, product IDs, allowances, or legacy subscriber mappings until the owner accepts a reconciliation matrix.

Product constraints: the standalone app must have a credible path to at least £3,000 monthly owner take-home after its share of fees, tax, AI and other expenses; the £5.99 entry must remain tightly limited; a paid tier cannot imply unlimited model/voice costs. Education courses, digital books and private coaching are **separate** commercial offerings; no personal coaching sessions are bundled into these app prices. Executive's advanced real-world action benefits remain contingent on completed, approved integration.

Pricing gate: draft a full feature-by-tier + quota/cost table; model AI text, voice, tools, Firebase/Cloud Run usage, support, taxes/refunds, stores and web processors. Decide one auditable price list and provider-specific product ID map, with appropriate annual and trial rules. Do not promise an unimplemented feature on a pricing screen. Human/safety/privacy/accessibility controls and full data access rights are never upsells.

`docs/MOBILE_SUBSCRIPTIONS.md` predates the Expo mobile code and incorrectly says no native app exists. Its provider receipt validation, notifications and shared entitlement architecture remain useful, but the implementation remains **not built**. Complete verified Apple StoreKit 2, Google Play Billing, subscription lifecycle webhooks, cancellation, restore purchases and cross-platform entitlement sync before offering in-app digital subscriptions. Web Stripe checkout/webhooks are mock-tested code but not configured live.

## Verify-first release evidence

For every mobile batch, run `cd mobile && npm ci && npx tsc --noEmit && npm run lint && npm test -- --runInBand`, plus real device EAS builds and manual test results. Run the web release gate separately; web tests do **not** count as native mobile acceptance. Use no GitHub Actions quota and do not deploy without explicit approval.

Cloud Code must return changed paths, remote commit SHAs, test exit codes, actual device/build evidence, Firebase project identifiers, billing-provider sandbox results, negative tests (invalid App Check; expired auth; other account's history), unresolved blockers and a read-only staging flag report. Claims of 'ready' must distinguish source code, emulators, real devices, staging and production.

**Current decision: mobile-native release blocker OPEN; pricing reconciliation blocker OPEN; production launch NO-GO.**
