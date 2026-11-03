# Blaze Break — CTO Cross-Platform Gap Audit
**Date:** 2026-11-03
**Working branch:** `cto/cross-platform-gap-closeout-20261103`
**Starting commit:** `3d34d7d8598e323f5d20fa80d0c1ee2bfd83d021`
**Method:** Read-only inspection of connected GitHub source; source changes committed on an isolated development branch. No Firebase/GCloud credentials, mobile binary, physical-device testing, production merge or deployment. No local build/automated test claims.

## Severity and source-backed findings

| Priority | Gap / impact | Disposition |
|---|---|---|
| **P0 security — OPEN** | `firestore.rules` defines `isOwner(uid)` as signed-in and UID equality. Rules such as `match /users/{uid}` allow direct client reads with `isOwner(uid)` alone, while server REST middleware separately requires `X-MFA-Session-Token` for `mfaEnabled` accounts. A Firebase ID token authenticated by password alone may still be enough for direct Firestore reads. A UI lock is not a security boundary. | **BLOCKER** for describing MFA as protecting *all* account data; specialist security architecture and emulator/device testing required. Do NOT blindly add an MFA restriction to `isOwner`: that could lock out all legitimate web users with MFA. Evaluate server-mediated access or per-session attested credentials plus comprehensive rules migration. |
| **P1 security containment — CLOSED in native UI** | Native AuthProvider previously allowed an MFA-enabled website account into its Firestore-backed screens without a native MFA challenge. | Fresh custom-claim check before the app's own Firestore reads, no UI access if MFA required or claims cannot be verified, and a sign-out path. This does **not** close the P0 rules issue. |
| **P1 runtime — CLOSED in source** | RN 0.86's `Appearance.setColorScheme()` uses `'unspecified'`, not `'auto'`, for following the system. | Corrected to `'unspecified'`. Physical-device and TS verification outstanding. |
| **P1 native Android appearance — OPEN** | `mobile/app.json` selects automatic appearance, but `mobile/package.json` lacks `expo-system-ui`, which Expo SDK 57 requires for Android appearance settings. | Install compatible package with `cd mobile && npx expo install expo-system-ui` in a working Expo checkout; update both package and lockfile. Run Android build and theme-switch test. Do not guess version / hand-edit lockfile. |
| **P1 rollout — OPEN** | Native Google services configuration, EAS build/signing, authenticated staging App Check attestation, and iOS/Android physical testing are not evidenced in the GitHub connector. | Verify separately with approved Firebase/GCloud/EAS identity. Never substitute source verification for cloud/device acceptance. |
| **P1 engineering — OPEN** | The branch has not run fresh root/native TS, lint, unit, emulator, browser or offline release gates. Security PR #140 remains open. | Run full clean gate, reconcile open PR safely, and verify release migration and rollback. |
| **P2 usability — CLOSED in source** | Collapsed desktop sidebar's absolute appearance menu extended left outside the viewport. | Menu now opens rightward in collapsed sidebar while mobile compact selector remains right-aligned; component tests added. |
| **P2 experience — CLOSED in source** | Appearance class was applied only after React mounted, allowing a flash of the wrong palette. | External first-paint script in `public/appearance-init.js` runs before app mount. Same-origin script respects the restrictive production CSP; no unsafe-inline relaxation. |
| **P2 consistency — CLOSED in source** | Two open website tabs could show different saved appearance settings. | `storage` event synchronizes Light/Dark/System across tabs. |
| **P2 resilience — CLOSED in source** | A failed native App Check initialisation was cached as `null` indefinitely. | Failed initialisation now backs off 30 seconds and retries; never fabricates a token or bypasses backend verification. |

## Hard release boundary
- No merge to `main` until tests, PR #140 reconciliation, staging acceptance and an owner-approved deployment plan. The repository has a GitHub workflow that can deploy Cloud Run and Firestore on `main` pushes.
- Do not promote NHEI, native MFA, third-party agentic writes, paid subscriptions or unfinished safety functionality merely because appearance passes.
- Do not change Firestore rules in a drive-by UI batch; first design and test the MFA session-security model, preserving data access for existing users.
- Web and native releases can be separated once independently ready.

## Required verification handover
1. `npm ci && npx tsc --noEmit && npx eslint . --config eslint.cleanup.config.js && npx vitest run && npm run build`.
2. `cd mobile && npm ci && npx tsc --noEmit && npm run lint && npx jest --runInBand`.
3. `npm run verify:release:offline -- --all` (may require emulator/browser infrastructure).
4. Android: compatible `expo-system-ui` install and fresh EAS binary; iOS/Android System mode, keyboard/safe areas, app restart, App Check token pass/fail, MFA-enabled account blocked, ordinary account open.
5. Rules emulator: confirm existing MFA-claim owner access and agree a **server-enforced** remediation without locking users out.
6. Staging: verify selected Firebase project, named database, index state, rollout flags, deployment revision, credentials/attestation, SEO and PWA smoke tests.
7. Report exact SHA, command exit codes, tests, device evidence, and PASS/FAIL/NOT RUN. No CI/deployment claims from GitHub source inspection.

**CTO disposition:** fixes committed for six source-level gaps. P0 Firestore/MFA security boundary and the P1 native/test/release prerequisites remain open. Not production release approval.
