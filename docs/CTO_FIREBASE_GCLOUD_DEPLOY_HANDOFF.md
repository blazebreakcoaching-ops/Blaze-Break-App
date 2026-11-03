# Blaze Break — CTO to Claude Code deployment handover
**Date:** 2026-11-03. **State:** DEVELOPMENT SOURCE ONLY. **Deployment:** NOT AUTHORISED BY THIS DOCUMENT.

## What is already integrated
- The current Nova composer branch descends from the Recovery Routing development branch, so Recovery Routing, Ember and native Nova source are already in the current ancestry.
- PR #140's credential-export sanitiser and its unit-test file have byte-identical contents in the current development ancestor and the PR. The open PR itself is not merged. Reconcile all security changes and review the PR separately before any release.
- Native Nova chat, Before Words, Invisible Load, Proactive Suggestions and the Calendar/Task proposal screens already exist. Do not rebuild them.
- This batch removes the accidental production Cloud Run fallback in native builds and refuses absolute/off-origin authenticated API requests. It also guards double-send and preserves Before Words context on network failures.
- Native Firebase Auth/Firestore must use explicit `EXPO_PUBLIC_FIREBASE_*` values. The production web `firebase-applet-config.json` is no longer implicitly imported by the native client, so a staging build cannot silently use production user records.

## Hard blockers — do NOT claim live-ready
1. **Native App Check source has now been integrated on the concurrent native-hardening branch** (`c5dceda`) with native Firebase SDKs, plugins, and lockfile changes. This is NOT device or deployment acceptance: Firebase iOS/Android configuration, attestation registration, native EAS builds, token verification and an authenticated staging test remain required. No fake token, bypass, or weakened server middleware.
2. **Native Firebase app configuration is absent**: Android `mobile/google-services.json`, iOS `mobile/GoogleService-Info.plist`. Register apps to a separately authorised staging project first; match bundle and package identifiers. Treat credentials/signing files securely. Do not commit secret signing keys. Configure ALL `EXPO_PUBLIC_FIREBASE_*` fields from that same project (see `mobile/.env.example`). The public project ID must match the intended staging/production Firebase alias and the Firestore database must actually exist there.
3. **Expo/EAS authentication and app signing are unavailable in ChatGPT's GitHub-only environment.** Use the owner-authorised EAS account and inspect native Android/iOS builds before release.
4. **Firebase/GCloud authenticated access is unavailable here.** Read-only inspect staging service, auth, Firestore named database, App Check enforcement, deployed revision, indexes, rules, secrets (names only), URLs and feature flags before any mutation.
5. **Native appearance integration:** Light/Dark/System UI and Ember palette are committed. Android's required `expo-system-ui` dependency is NOT yet installed because the Expo lockfile must be updated by running the compatible Expo installer; add this in the authenticated native build environment before acceptance, then verify System mode changes on real iOS/Android devices. The native appearance preflight intentionally fails until this is installed.
6. **Native MFA, subscriptions/billing and real-device iOS/Android verification remain incomplete.** Do not advertise or enable unsupported native flows. Pricing changes are not approved. NHEI educational/reflection activation remains gated behind human review and explicit approval.
7. **Security PR #140 remains open.** Check the PR's actual history, tests and merge conflict state. Never assume content similarity equals an approved merge.

## Safe release order (Claude Code)
1. `git fetch`, verify the exact CTO handover branch SHA, check uncommitted changes, confirm `main` hasn't been changed and report proposed integration.
2. Run root + native fresh installs, TypeScript, ESLint, unit tests, production build and `npm run verify:release:offline -- --all`. Record exit codes and exact HEAD. Do NOT invoke GitHub Actions.
3. Confirm an **explicit** staging project. `.firebaserc` currently maps staging to `blaze-break-staging`, production/default to `gen-lang-client-0537893432`. `firebase.json` references named Firestore database `ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc`; do not assume it exists in staging.
4. Configure the native Firebase apps and EAS development client, add native App Check SDK wiring, verify token refresh, invalid-token rejection and authenticated requests against staging. Set `EXPO_PUBLIC_API_BASE_URL` explicitly for each build (HTTPS staging service; no production fallback).
5. `node scripts/cto-native-release-preflight.mjs --target staging` must pass *before* staging native build acceptance. It verifies the public Firebase project and the Android/iOS config files target the intended project and app identifiers, and blocks the known production Cloud Run URL in staging. This script performs no cloud actions and is not sufficient by itself. Secure SDK calls now reject redirects instead of following them with authentication headers.
6. Perform real-device tests on iPhone and Android: sign-in/out, account isolation, API token refresh, offline/retry, app foreground/background, small screens, accessibility, app privacy, data export/deletion, and enabled/disabled feature flags.
7. Reconcile security PR #140 and development branches using a reviewed integration branch. Never blindly merge current development straight into production.
8. Only when the owner explicitly approves a controlled deployment: record the exact project, service, image/commit, rollout plan and rollback revision; deploy to the approved project with authenticated Firebase/GCloud tooling; run post-deploy smoke tests before any production traffic switch. Do not enable NHEI or agentic external writes implicitly.

## Mandatory handover report
For every gate report PASS, FAIL or NOT RUN with commands, exit codes, Git SHA, verified project/revision (non-sensitive), device/EAS evidence, test counts, newly introduced dependencies, live feature flags, App Check reject/pass tests, security PR status and rollback steps. No test result from a prior commit qualifies as a passing result for a new release commit.
