# Test Coverage

QA Batch 1 for the "Quality Assurance" capability from the Operations
Intelligence Hub audit. This batch adds real coverage *measurement* (there
was none before) and closes one concrete gap it surfaced. It does not chase
a coverage percentage target - the real baseline below is large enough that
closing it meaningfully is its own multi-batch effort, not a single pass.

## QA Batch 2: the Nova Live WebSocket relay

Batch 1 named this as the hardest of its three concentration areas to
close, and deliberately didn't attempt it: "it needs a real or fake
WebSocket client, which nothing in this test suite currently provides."
This batch built that.

The deeper problem wasn't just a missing fake client - the entire
`wss.on("connection", async (clientWs, req) => {...})` handler lived
*inside* `if (process.env.TEST_MODE !== 'true') { ... }`, the exact block
every test in this suite sets `TEST_MODE=true` specifically to skip (so
`server.ts` can be imported without opening a real port). That meant this
handler - auth, App Check, quota checks, the full Gemini Live session
lifecycle, audio/transcript/tool-call relay, idle/session timeouts,
voice-minutes billing - could never execute during a test run at all. Not
undertested: structurally unreachable by any test, by construction.

Fixed by extracting it into a named, exported function
(`handleNovaLiveConnection`) with the exact same body - a pure move, no
behaviour change (confirmed: the full suite was green before and after,
and `tsc`/`eslint` raised nothing). The `if (TEST_MODE !== 'true')` block
now just does `wss.on("connection", handleNovaLiveConnection)`.

`nova-live-websocket.test.ts` then calls that function directly against:
- A minimal fake WebSocket (`FakeClientSocket`, an `EventEmitter` with
  `.send`/`.close`) - the same "write the smallest fake that matches what
  the code actually calls" approach as `test/fake-firestore.ts`.
- A mocked `ai.live.connect` - schedules its `onopen` callback via a real
  macrotask (`setTimeout(fn, 0)`) rather than calling it synchronously,
  which matters: the handler's own pending-message queue only works
  correctly if `onopen` can never fire before `liveSession` is actually
  assigned, which is exactly what the real Gemini SDK guarantees and a
  naive synchronous mock would violate.

15 tests cover: missing/invalid auth, Gemini-not-configured, the
nova_voice daily-session and nova_voice_minutes monthly-cap quota
rejections, the separate blame_voice gate for BLAME Reset, a successful
connect, the pending-message-before-ready queue/drain, outbound
audio/initialPrompt relay, inbound transcript/audio/turnComplete relay, a
`remember_about_user` tool-call dispatch and its distinct per-session cap
(5 saves), the max-session timeout (which also proves the real-elapsed-
minutes billing on close), and clean (non-double) session end on client
disconnect.

Measured effect: `server.ts` statement coverage rose from 64.68% to
67.21%, branch coverage from 50.85% to 52.87% - overall project coverage
76.46%→78.1% statements, 66.87%→68.13% branches. The OAuth/token-refresh
code Batch 1 also flagged (area 2) is untouched - a separate, differently-
shaped gap (needs mocking each provider's token endpoint, not a WebSocket
client) left for a future batch, not folded into this one.

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
3. ~~**The Nova Live WebSocket relay.**~~ **Closed in QA Batch 2** - see
   below. It needed a fake WebSocket client, which this batch built.

Closing (1) and (2) meaningfully is substantial, separate work - (1) is
pure volume across ~300 routes' backstop branches, (2) needs a fake
OAuth-provider token-endpoint harness - candidates for a future QA batch,
not padding for this one.
