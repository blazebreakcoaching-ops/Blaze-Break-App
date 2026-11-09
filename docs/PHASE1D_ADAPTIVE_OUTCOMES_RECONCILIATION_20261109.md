# Blaze Break — Phase 1D Adaptive Outcomes Reconciliation
Date: 2026-11-09
Base SHA: `1897194fa12132a07625a2aae8f475d7f1c626ee`
Development branch: `integration/phase1d-adaptive-outcomes-20261109`
Status: SOURCE CHANGES COMMITTED ONLY — runtime tests, emulator acceptance, staging and production NOT run.

## Original gap
The older `main` report calculated adapted-vs-standard recovery outcomes, but the newer shared transactional reservation path did not persist whether a recommendation was actually adapted. Reinstating the report without fixing its data source would misclassify old records and could imply unproven improvement.

## Reconciliation
1. The common Firestore transaction in `recovery-routing-persistence.ts` writes a boolean `adaptiveLearningUsed` and a small allowlisted `adaptiveBasis` only for eligible, actually reserved Recovery Hub module recommendations. No personal language, messages or notes are stored.
2. Reused recommendations return their ORIGINAL persisted provenance, never the caller's present preferences. Clarifications and Pulse cannot gain adaptation credit.
3. The Recovery Hub returns committed provenance; it does not claim a fresh explanation caused a reused historical recommendation.
4. `GET /api/admin/recovery-outcomes` again returns a `adaptiveComparison` object restricted to the existing `content.manage` permission. This is observational, not causal.
5. Old decisions without the provenance flag are counted under `unknownProvenance`; they are NOT treated as standard. Low-sample positive rates remain hidden.
6. The more recent transaction-based outcome correction, retry idempotency and forgotten-feedback protections are retained. The older standalone outcome helper was deliberately not copied because its behaviour is already implemented in the current transactional endpoint.

## Test additions (authored, not run)
- Pure comparison calculations, sample thresholds, unknown legacy provenance.
- Admin route permissions and mixed cohort reporting.
- Firestore emulator: persistence, deduplication, Pulse-vs-Hub, clarification and provenance.
- Recovery outcome route: duplicate completion, correction without a double count and forgotten-feedback retry.

## Attribution integrity follow-up
- Require an allowlisted reason and a non-empty module name before recording true adaptive provenance; malformed input can no longer inflate comparison groups.
- Added emulator regression cases for missing/invalid reason and blank module.
- Runtime verification still unexecuted; the PR remains a draft.

## Required offline verification before merging
- Check out this exact commit in a clean environment and run `npm ci --legacy-peer-deps`, `npm run lint`, `npm test`, and `npm run verify:integration:offline`.
- Run `npm run test:emulator` with the isolated Firestore/Auth emulators actually active. Skipped emulator suites do not count as passing.
- Review the full diff, privacy bounds, existing caller compatibility and new admin JSON response.
- Test the signed-in staging journey with the correct isolated Firebase project and App Check; no deployment until independently approved.

No GitHub Actions, production/staging deploy, `main` merge, or Firebase mutation was performed.
