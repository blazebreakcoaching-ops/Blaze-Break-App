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

## Rendered-component regression additions

- `SecondMemoryCard.session.test.tsx`: actual React rendering test for a delayed
  response arriving after same-UID reauthentication, plus sign-out erasure.
- `PastNovaMemoriesReview.session.test.tsx`: actual React rendering test for
  delayed Firestore memory reads after same-UID reauthentication and account
  switches. These use the existing jsdom component-test project, not a parallel
  test runner or invented test data store.
- Tests have been **authored, not executed** with the repository's package
  installation. Run `npm run test:components` as part of the exact-SHA offline
  integration gate before merging.

## Phase 2 cache reconciliation — same UID, new session

The shared `nova-brain.ts` cache now records the Firebase User instance that
originally passed permission hydration, rather than treating UID equality alone
as authority. Same-UID reauthentication hides the old cache immediately and
forces a fresh permissions/memory read. A late old-session Firestore read cannot
replace the new session's cache. An old-account `initNovaBrain` call also cannot
evict the active user's cache. Added targeted race tests to the existing pure/
jsdom memory-privacy suite. This is one cache, not a second memory store.
Runtime testing and staging privacy verification are still mandatory.

## Phase 2 service-level identity and delayed memory persistence

- Fixed protected API **401 GET/HEAD retry session handoff**: the helper
  now captures the initiating Firebase User object once and reuses exactly
  that session for the token refresh, App Check, MFA header and response
  validation. Even a sign-in to the same UID does not allow the old request
  to reach the new session or deliver its data to the previous caller.
  An account switch during error-body parsing, refresh or network response
  returns conflict status instead of retrying across identities.
- Added explicit regression cases for a switch while the 401 error body
  is being read, a same-UID new login during token refresh, and normal
  safe same-session token refresh. Existing non-retryable mutation, 403
  and MFA-error behaviour is preserved.
- Nova Memory's existing background Firestore write/delete helpers now
  retain their initiating Firebase User session and reject work after
  identity changes or a local learning withdrawal. A pending operation
  from account A may not run under account B or under a new login to A.
  Added delayed-database tests for memory create and delete.
- Only code/source checks and test declarations were performed through
  the GitHub connector; the repository's Vitest, TypeScript, emulator
  and real staging checks have **NOT** been executed or passed.

## Phase 2 — latest routing answer and multilingual recovery feedback

- The Recovery Hub previously had an account/session generation guard but
  **no request-order guard** within a session. A slow earlier POST could
  replace a newer explicit user choice. Added a monotonic in-component
  `latestDecisionRequest` counter. Only the most recently requested
  routing answer may change the decision, loading, error or pending feedback.
- A delayed rating save now clears only the pending decision it actually
  answered, preserving a newer pending feedback question if one appeared.
- Unified the recovery feedback prompt and four helpfulness choices with
  already-reviewed-in-source (but not human-reviewed) feedback translations.
  Module names now use the same locale helper as feedback history and
  adaptive settings, without changing module ID or route semantics.
- The child Nova Memory and recovery insight sections now render only when
  Auth's active Firebase User is the same session as the parent React view.
- Source contract assertions extended. Automated Vitest/browser tests not
  executed; no live functions, indices, permissions or deployment touched.

## Phase 2 — feedback pagination consistency after correction or erasure

- The existing feedback history list now assigns a monotonic request ID to
  each page load. A successful correction, forget or reset invalidates
  any in-flight list/page response and clears stale pagination spinner.
- A delayed older page can no longer restore the rating the user just erased,
  overwrite a corrected score, or repopulate a just-reset list.
- Retained account session generation guards and server-side withdrawn-feedback
  markers. These list changes are frontend-only; no new retention policy
  or database collection was introduced.
- Added an actual rendered-component test with an older page deliberately
  resolving **after** a member's erasure. This test is authored but not
  run; staging and Firestore emulator checks remain mandatory.

## Phase 2 — Recovery Insights account isolation

- `RecoveryInsightsPanel` is the member-facing Intelligence Layer on the
  existing authenticated `/api/recovery/insights`, `/api/recovery/recalculate`
  and `/api/recovery/insights/explain` routes, **not** a parallel analytics engine.
- Added Firebase User session ownership and request ordering to all three
  operations. A login/account switch clears the previous panel's insights,
  AI explanation, loading and errors. A delayed same-UID old-session response
  is rejected. Only the current session can trigger recalculation/explanation.
- Extended the existing rendered component suite with a same-UID
  reauthentication and late-response test. The test is authored but not
  executed in this environment. Do not treat this as staging validation.

## Phase 2 — personal recovery report and print safety

- `ExecutiveBoardReport` reads the existing authenticated
  `/api/signals/executive-report` endpoint; the new guard binds rendered
  insights and metrics to the current Firebase User session, including
  when a fresh login returns the same UID.
- Old-session API completion, error messages and the browser print-frame
  load event can no longer attach/print a report for the new account.
  The report print frame is removed on account change; a failed/no-data
  load cannot create an empty misleading report.
- Added a rendered React regression for old-request completion after
  same-UID reauthentication. This work does not add employer disclosure,
  AI analysis or new data stores. Tests remain unexecuted here.

## Phase 2 — Organisation membership and privacy boundaries

- The main app's My Team/HR/Executive Work Design nav flags now reset
  whenever Firebase User changes and apply `GET /api/org/me` only while
  the initiating Firebase User session is still active. Missing/denied
  membership fails closed instead of preserving an earlier role.
- Privacy Vault's Organisation view now resets member, consent receipt and
  cohort-transparency state on account change or tab departure, and rejects
  delayed previous-session `/api/org/me`, `my-privacy-status` and
  `privacy-receipts` reads. Its join, consent and leave handlers guard
  UI updates after a session change.
- Existing server-side org membership checks, privacy thresholds and
  explicit member consent remain the authority; no employer access to
  individual coaching data is added. New rendered regression added.
