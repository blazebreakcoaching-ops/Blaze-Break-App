# Blaze Break — Mobile (Phase 1)

A genuinely native mobile app — not a wrapped version of the website. Built with
[Expo](https://expo.dev) / React Native, sharing the same Firebase project, Firestore
data, and backend API as the web app.

## What's in Phase 1

Three tabs: **Pulse** (your daily suggestion + quick check-in), **Check-in** (the
Fingerprint diagnostic), **Reset** (BLAME Reset, Nervous System Reset, Sleep & Wind-Down
Builder). Everything else — Energy Budget, Boundary Rehearsal, Recovery Debt, Reflect,
Guardian Protocol, Org Pulse — is a later phase.

## Running it yourself

### Stage 1: Expo Go (no account needed)

1. Install the free **Expo Go** app on your phone (App Store / Play Store).
2. On a computer with this repo cloned:
   ```
   cd mobile
   npm install
   npx expo start
   ```
3. Scan the QR code that appears with your phone's camera (iOS) or the Expo Go app
   itself (Android).

At this stage, sign-in and the Pulse quick check-in work for real (they only touch
Firebase Auth and Firestore directly). Anything that calls the backend API — Check-in's
diagnostic submit, BLAME Reset's Nova exchange, the Pulse recommendation cards — will
**403/401 against the real production backend**, because those routes require App
Check, and Expo Go can't run the native App Check module. That's expected, not broken.

### Stage 2: a real device build (once you're ready to test the full app)

This needs an [Expo account](https://expo.dev/signup) (free) and, later, Apple
Developer ($99/yr) and Google Play ($25 one-time) accounts once you're ready to
actually publish — neither is needed just to test on your own phone.

```
npx eas login
npx eas build --profile development --platform android   # or ios
```

This produces an installable dev-client build (an `.apk`, or a link for iOS) instead
of using Expo Go. Once installed, `npx expo start --dev-client` connects to it the
same way Expo Go does, and the real backend calls will work.

**Before that build will actually succeed end-to-end**, native App Check needs wiring
in (`@react-native-firebase/app` + `@react-native-firebase/app-check`, plus a real iOS
and Android app registered in the Firebase Console — those produce
`GoogleService-Info.plist` / `google-services.json`, which this repo doesn't have yet).
That's a one-time setup step, not something that needs redoing per build.

## Commands

```
npm run start   # Expo dev server (Expo Go or a dev-client build)
npm run lint     # ESLint
npx tsc --noEmit # Type-check
npm test         # Jest (data-integrity tests for the ported content banks)
```

## Project layout

- `app/` — screens, using [Expo Router](https://docs.expo.dev/router/introduction/)'s
  file-based routing. `(tabs)/` is the three-tab bottom nav; `sign-in.tsx`/`sign-up.tsx`/
  `account.tsx` are modal routes.
- `src/lib/` — Firebase init, auth, the `secureApiFetch` API client, shared hooks.
- `src/components/` — reusable pieces (the daily check-in modal, BLAME Reset's Nova
  exchange).
- `src/data/` — content ported verbatim from the web app (the diagnostic question bank,
  the Reset tools' technique library) — covered by Jest tests so the two platforms can't
  silently drift apart.

## Shared code with the web app

`metro.config.js` lets this project import plain TypeScript modules straight from the
repo root — `entitlements.ts`, `archetype-scoring.ts`, and friends — without copying or
publishing them. Same source of truth, both platforms.

## What's deliberately not built yet

Nova Live voice (including BLAME Reset's voice option), Google/Microsoft/Facebook
sign-in, MFA, native push notifications, and native App Check are all tracked as
follow-up work, not silent gaps — each is called out in a code comment at the relevant
file where it's relevant.
