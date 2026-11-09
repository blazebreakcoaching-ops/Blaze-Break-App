# Phase 2 — Single-codebase reconciliation (source audit)
Date: 9 November 2026
Draft PR: https://github.com/blazebreakcoaching-ops/Blaze-Break-App/pull/159

## Existing branch reconciliation
The agreed Phase 2 scope is one buildable NHEI × multilingual codebase, not
a second app or premature Phase 7 rollout. The recursive Git tree comparison
found 717 main files and 1,261 integration files: 5 main-only files and 228
differing common files, which must not be blindly merged.

## Main-only findings
- `docs/NHEI_ADAPTIVE_INTELLIGENCE.md`: historical implementation report; its
  core invariants are reflected in the unified register, but old live-status
  claims are stale. Do not add a parallel canonical specification.
- `nhei-integration-contract.test.ts`, `nhei-security-contract.test.ts`:
  source-string assertions reference old storage/cache names and untranslated
  literals. Reconcile their intent into current behavioural/contract tests.
- `nhei-routing-outcome.ts`, `nhei-routing-outcome.test.ts`: legacy standalone
  transition planner. Do **not** copy over the newer transactional outcome
  endpoint. Existing route tests cover idempotency, correction, withdrawal
  and account isolation.

## This first Phase 2 integration patch
- Recovery Hub now binds requests to the exact Firebase User session and resets
  its pending decisions, direction, prompts and expanded tools after same-UID
  reauthentication. Late async replies and errors cannot rehydrate stale state.
- Second Memory and Past Nova Memories Review now have matching per-session
  ownership checks for read/write completion, correction and erase. Users
  retain their right to inspect and erase memories after opting out.
- Added an up-to-date cross-feature source contract test. No new navigation,
  duplicate outcomes database or competing routing engine was introduced.

## Remaining Phase 2 gates
- Source reconciliation is **in progress**, not complete solely because the
  five missing paths have been classified. The 228 differing shared paths
  still require risk-prioritised audits of real integration call sites.
- Full clean-checkout TypeScript, tests, emulator, build, browser QA and
  cross-user staging are **not yet executable or run** via this connection.
- Phase 1 release gates remain pending. No GitHub Actions, production
  deployment, merge to main, or NHEI mode/agentic activation.
