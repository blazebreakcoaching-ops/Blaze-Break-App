# CTO test-infrastructure fixes — 3 November 2026

**Repository:** `blazebreakcoaching-ops/Blaze-Break-App`  
**Isolated branch:** `cto/test-infrastructure-20261103`  
**Based on:** `claude/nhei-phase-1` as at Report 31 (`9c7409d`)  
**Status:** Source-level fixes committed to GitHub. **No browser, mobile or release gate executed in this GitHub-only session. No merge and no deployment.**

## Why this branch is separate

Claude Code is currently working on the Ember design branch. This branch intentionally modifies only test tooling and package scripts to avoid conflicting with those active UI edits.

## 1. Real-app Playwright crashes

Report 31 showed intermittently closed Chromium contexts when the three real-app Playwright projects ran under sandbox CPU/OS pressure. In `playwright.realapp.config.ts`, set `workers: 1`, which serializes the real-app tests across all projects while preserving **every** test, assertion and project, with **zero retries**. The app still starts its two local server instances and uses the same Auth/Firestore emulators. This is a mitigation for resource contention, not proof that the missing D-Bus or any other infrastructure limitation is resolved.

**Verify:** from a fully equipped local checkout, run `npm run test:e2e:realapp` and then `npm run verify:release:offline -- --all`. If Chrome still crashes, inspect the log and fix the runner infrastructure; do not mark it green without a clean pass. If desired, pass `--workers` explicitly on sufficiently provisioned runners, but **do not** relax test assertions.

## 2. Broken native lint command

Report 31 identified that `cd mobile && npm run lint` ran `expo lint`, which followed a root flat config from the mobile dependency tree and failed resolving `@eslint/js`.

This patch routes the mobile script to the already-installed **root** ESLint and its existing `eslint.cleanup.config.js`. From root: `npm run lint:mobile`. From `mobile/`: `npm run lint` now calls the root command. No additional dependencies or changes to lockfiles.

**Precondition:** install the repository's root dev dependencies first (`npm ci` from the repository root). This lint uses the established root TypeScript and unused-import rules; it does **not** claim to enable Expo-specific recommended rules or to replace native build tests.

**Verify:** `npm ci && npm run lint:mobile && (cd mobile && npm run lint)`. Address any actual lint errors. Also re-run `cd mobile && npx tsc --noEmit`, `cd mobile && npm test -- --runInBand` and the web gate to detect regressions.

## Integrating safely after Claude finishes

1. Fetch both `cto/test-infrastructure-20261103` and the latest `cto/ember-executive-calm-20261103`.
2. Confirm the current heads; inspect the 3 small tooling commits and cherry-pick or merge them **into a new staging branch** based on the verified design branch.
3. If Claude has independently changed any of the same files, reconcile rather than overwrite.
4. Run the verification commands above, including the full offline gate and visual mobile/desktop checks.
5. Only then consider a separate, explicitly authorised controlled production deployment. These testing changes alone require **no** production deployment.

## Explicitly not included

- No changes to Firebase, Firestore, app authentication, recovery data, billing or API routes.
- No native App Check, MFA or physical-device changes.
- No changes to security PR #140, `main`, or the active Ember design branch.
- No GitHub Actions runs, merges or deployments.
