# Blaze Break — Integration release gate, 4 Nov 2026
**Branch:** cto/web-release-integrated-verification-20261104
**State:** Source changes prepared; execution NOT claimed from ChatGPT's GitHub-only environment.

## Run on an authorised clean local/cloud checkout
1. \`git fetch origin\` and check out the exact reviewed release-candidate commit.
2. \`EXPECTED_RELEASE_SHA=<FULL_CANDIDATE_SHA> npm run verify:web:offline\` — executes the existing ten-stage clean-install/root/emulator/Playwright gate. Does **not** deploy.
3. \`EXPECTED_RELEASE_SHA=<FULL_CANDIDATE_SHA> npm run verify:integration:offline\` — runs the same web gate plus native fresh install, TypeScript, lint, Jest and separate Firebase Functions clean install/build/tests. Does **not** deploy.
4. Preserve \`release-gate-logs/integrated/latest.json\`, \`release-gate-logs/latest.json\` and failed-stage logs. Report every exact exit code. Both modes require a clean checkout; stale earlier commit results cannot qualify.
5. If a test fails, fix the underlying source defect and rerun the ENTIRE gate on the new SHA. Do not count only the last passing subtest. Do not silently waive the historic registered-account Playwright test.
6. Record status of mobile App Check configuration, named Firestore database, staging API, Android \`expo-system-ui\`, EAS device runs and PR #140 separately; they are not covered by source gates.

## Web release approval is a separate decision
Only consider a web-only release after web ten-stage gate PASS and an authorised staging verification of Firebase project isolation, security routes, access control, consent, privacy export/deletion, paid entitlement gating, rollback and real API smoke tests. Keep unapproved NHEI, third-party writes and paid pricing disabled. Do NOT require native store acceptance for a web-only launch; do not ship the native app without separate native gates.

## Deployment hazard
\`.github/workflows/deploy.yml\` is changed to manual-only ON THE CANDIDATE branch. Old production \`main\` still contains the automatic push deployment trigger. Verify the complete merged workflow BEFORE moving \`main\`, and never merge or deploy without the owner's explicit approval and a rollback-ready release plan.

## Why results remain pending
The GitHub connector can read and commit repository files, but this environment has no authenticated full repository checkout or executable project dependencies. This script must run on a full checkout; source inspection cannot truthfully produce its PASS result.
