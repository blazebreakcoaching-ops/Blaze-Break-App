# Test Coverage

QA Batch 1 for the "Quality Assurance" capability from the Operations
Intelligence Hub audit. This batch adds real coverage *measurement* (there
was none before) and closes one concrete gap it surfaced. It does not chase
a coverage percentage target - the real baseline below is large enough that
closing it meaningfully is its own multi-batch effort, not a single pass.

## What's shipped

- `npm run test:coverage` (`vitest run --coverage`, `@vitest/coverage-v8`):
  opt-in only, not wired into `npm test` or `ci.yml` - running it is a
  developer choice, not a CI gate (adding a CI coverage gate would be a CI
  pipeline change, which the Operations Intelligence Hub master prompt
  gates behind separate explicit approval).
- Coverage is scoped to backend/engine `*.ts` logic files (`src/**` is
  excluded - this project has no DOM test harness such as jsdom or
  @testing-library to exercise React components, so "0% coverage" on a
  `.tsx` file would be noise, not a finding).
- Six one-off developer/ops CLI scripts (`download-java.ts`,
  `make-admin.ts`, `run-rules.ts`, `test-api.ts`,
  `run-integration-tests.ts`, `emulate-server.ts`) are excluded from the
  report. None of them is imported by `server.ts` or runs in production -
  they're run by hand from a terminal for local setup/testing, so 0%
  coverage on them isn't an application gap.
- One real gap closed: `logAdminAction` (server.ts) deliberately swallows a
  failed audit-log write rather than failing the admin action that already
  happened - documented in its own comment, but previously untested.
  `admin-audit-log-resilience.route.test.ts` proves both halves of that
  contract for a representative route (`POST
  /api/admin/users/:uid/suspend`): the suspend still succeeds when
  `admin_audit_logs.add()` throws, and the failure is still visible (logged
  at `ERROR` with the full audit entry) rather than silently dropped.

## Baseline, as measured (not estimated)

Overall: **76.46% statements / 66.87% branches / 79.81% functions** across
the `*.ts` logic files in scope. Most pure engine/business-logic files
(`action-engine.ts`, `entitlements.ts`, `recovery-routing-engine.ts`, etc.)
are at 90-100% - these already have dedicated test files and it shows.

`server.ts` itself is the weak point: **64.68% statements / 50.85%
branches**. It's also 90% of the codebase's total line count, so it drags
the overall number down disproportionately. Three areas concentrate most of
the gap, none fixed in this batch:

1. **Defensive catch-block branches** across the file's ~300 routes - the
   "something unexpected threw" path behind an already-tested happy path.
   Lower severity (these are backstops, not primary logic) but high volume.
2. **External integration OAuth/token-refresh code** (Slack, Jira, Asana,
   Monday, Calendar, Gmail - roughly lines 4550-5980): near-zero coverage,
   because exercising it meaningfully means mocking each provider's token
   endpoint, not just Firestore.
3. **The Nova Live WebSocket relay** (roughly lines 15080-15472): the
   hardest of the three to unit test - it needs a real or fake WebSocket
   client, which nothing in this test suite currently provides.

Closing (2) and (3) meaningfully is substantial, separate work (a fake
WebSocket/OAuth-provider harness each) - candidates for a future QA batch,
not padding for this one.
