# Blaze Break staging release candidate — controlled handoff (6 November 2026)

**Source-only. No approval to merge main, deploy, change Firestore rules, IAM, secrets, or traffic.**

## Source and overlapping work

This safety patch descends from `cto/calm-welcome-review` (PR #153), itself based on the MFA/release-preflight branch (PR #148), which incorporates PR #150's manual-only OIDC workflow. The proposed production GitHub workflow is **manual-only**. Keep this invariant.

Do not merge the older WIF PR #149 independently: unlike the integrated candidate it enables automatic production deployment on application pushes. PR #140's credential-export/OAuth security fix overlaps code already in the launch branch and requires functional reconciliation. PR #152's package-lock remediation has green checks on main, but the launch branch independently updates many of the same vulnerable packages. Do not overwrite the launch branch's package-lock.json; run `npm audit --audit-level=high` against the final candidate commit.

## Changes in this safety patch

- `.gcloudignore` and `.gitignore` exclude transient GitHub OIDC `gha-creds-*.json` files. Before any approved source deployment, the manual workflow checks the actual `gcloud meta list-files-for-upload` list for accidental credential inclusion.
- The manual workflow still defaults to **auth-only**, with all deployment steps guarded by `auth_only == false`. Auth-only now checks read access to the exact Cloud Run service and named production Firestore database; it does not deploy.
- The staging read-only preflight inspects `blaze-break-staging`, not the different production service `blaze-break`.
- Regression tests enforce these source-level safeguards.

## Before the first staging deploy

1. Obtain an approved, reviewed 40-character SHA of the full release candidate and capture its exact test results. `EXPECTED_RELEASE_SHA=<SHA> npm run verify:web:offline` must pass at that SHA; repeat the MFA emulator tests.
2. Confirm the `blaze-break-staging` project in `europe-west2`, Cloud Run service `blaze-break-staging`, named Firestore database, staging-only Firebase web app and config. **Never reuse production Firebase config.**
3. On an authorised machine or Cloud Shell session with the SHA checked out, run `npm run verify:cloud:readonly -- --target staging --web-config /path/to/staging-firebase-config.json`. Do not share sensitive credentials, logs, secrets or user data.
4. Obtain explicit authorisation for the exact staging deploy command and expected targets. Do not alter production IAM, Firestore rules, traffic or keys as a shortcut.
5. Exercise genuine staged registration, sign-in/MFA, App Check accept/reject, Nova, consent, privacy, logout, and the Ember welcome. Store only redacted evidence; prepare both Cloud Run and Firestore rollback procedures.

The GitHub OIDC issuer and its identity binding still need an actual cloud-authentication check. A passing source check cannot establish Google Cloud permissions, App Check acceptance or production readiness.
