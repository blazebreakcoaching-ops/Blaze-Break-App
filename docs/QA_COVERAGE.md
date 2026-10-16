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

## QA Batch 3: OAuth connect/callback/token-refresh

Picks up area (2) from Batch 1's list - deliberately not all ~18 routes
across Slack/Jira/Asana/Monday/Calendly/Calendar/Gmail, which would mostly
re-exercise the same mechanism repeatedly. Scoped instead to the core,
highest-value, provider-agnostic pieces every one of those routes shares:

- **OAuth state signing/CSRF verification** (`signOAuthState`/
  `verifyOAuthState`) - the single most security-critical piece in this
  area (HMAC-signed, expiring, service-bound `state` param, since a
  browser redirect can't carry an `Authorization` header). Tested: a
  tampered signature, a state signed for a different service, and an
  expired state are all rejected - and, by design, all surface to the
  client as the same generic `reason=internal_error`, never a specific
  "signature mismatch" the client (or an attacker) could use to probe the
  mechanism.
- **The full connect → callback → disconnect → status lifecycle**,
  worked through for the two providers that between them cover both real
  shape variations: Jira (`tokenStyle: "json"`, `extraAuthorizeParams`,
  flat `access_token`/`refresh_token`) and Slack (`tokenStyle: "form"`,
  `userScope` instead of `scope`, the token nested under `authed_user`
  rather than flat). Also proves raw tokens never leak into the
  client-readable `integrations/{service}` status doc, only into the
  locked-down (by `firestore.rules`) `integration_tokens/{service}` one.
- **`getValidAccessToken`'s token-refresh branches** - the actual
  "token-refresh" logic the original gap named - exercised through its
  real consumer, `POST /api/signals/jira/refresh`: a still-valid token
  used as-is (never calls the refresh endpoint), an expiring token
  refreshed and persisted (and the *new* token used for the subsequent
  data calls, not the stale one), expiring-with-no-refresh-token falling
  back to the stale token rather than erroring, and a failed refresh call
  degrading the same way rather than throwing.

`oauth-integrations.route.test.ts`, 21 tests, mocks `global.fetch` per
the convention `account-security.route.test.ts` already established
(`vi.stubGlobal('fetch', fetchMock)`) - no new mocking pattern needed.
Deliberately not covered: Asana/Monday/Calendly/Calendar/Gmail's own
signal-fetch routes and Slack's incremental conversation-scan ticker -
they share the mechanism just proven via Jira/Slack above, and covering
each individually would be repetition, not a new finding.

Measured effect: `server.ts` statement coverage rose from 67.21% to
69.33%, branch coverage from 52.87% to 54.99% - overall project coverage
78.1%→79.47% statements, 68.13%→69.44% branches.

## QA Batch 4: the remaining provider signal routes

Picks up exactly what Batch 3 deliberately left out: Asana, Monday.com,
and Calendly's own `refresh`/read routes, plus Calendar and Gmail's.
`provider-signal-routes.route.test.ts`, 24 tests - but NOT a repeat of
Batch 3's `getValidAccessToken` refresh-branch tests (proven once via
Jira; it's provider-agnostic, so re-proving it three more times would be
the exact padding Batch 3 said not to do). Each provider's test instead
seeds an already-valid, non-expiring token and focuses on what's actually
different per route: its own upstream API shape and error handling -

- **Asana**: identity lookup (`/users/me`) for the workspace gid, then
  open tasks for that workspace, overdue-by-`due_on` counting; 502s for a
  failed identity lookup, no accessible workspace, or a failed task
  fetch.
- **Monday.com**: a single GraphQL POST, counting items and
  overdue-by-date-column across boards (no single "my tasks" concept the
  way Jira/Asana have - the comment above the route explains why); 502
  on a GraphQL error response.
- **Calendly**: identity lookup for the user's own URI, then 7-day
  upcoming events, with back-to-back-booking detection (consecutive
  events whose gap is ≤5 minutes); 502s for a failed identity lookup or
  events fetch.
- **Calendar and Gmail**: a genuinely different shape - these two never
  touch an OAuth token or `fetch` at all. The signal is computed
  client-side against the browser's own Google session
  (`src/lib/calendar-signals.ts`) and this route only validates
  (`zod`, `.strict()`) and stores what's submitted. Tests prove a valid
  payload round-trips, a missing field or an unexpected extra field is
  rejected with 400, and - explicitly - that `fetch` is never called for
  either route.

Deliberately still not covered: Slack's incremental conversation-scan
ticker (`POST /api/signals/slack/tick`) - a stateful, rate-limited,
multi-call scan loop that's a meaningfully different shape (and risk
profile) from every other route in this area, worth its own focused
batch rather than folding in here.

Measured effect: `server.ts` statement coverage rose from 69.33% to
71.34%, branch coverage from 54.99% to 56.28% - overall project coverage
79.47%→80.76% statements, 69.44%→70.24% branches.

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
2. ~~**External integration OAuth/token-refresh code.**~~ **Closed in QA
   Batches 3-4** - see below (state signing/CSRF verification, the
   connect/callback/disconnect/status lifecycle, `getValidAccessToken`'s
   refresh branches, and every provider's own signal-fetch route).
   Still genuinely open: Slack's incremental conversation-scan ticker
   (`POST /api/signals/slack/tick`) - a meaningfully different, stateful,
   rate-limited multi-call shape, left for its own focused batch rather
   than folded into Batch 4.
3. ~~**The Nova Live WebSocket relay.**~~ **Closed in QA Batch 2** - see
   below. It needed a fake WebSocket client, which this batch built.

Closing (1) meaningfully is substantial, separate work - pure volume
across ~300 routes' backstop branches. The remainder of (2) is smaller
and mechanical (the same `getValidAccessToken`-via-fetch-mock pattern,
repeated per remaining provider) - both are candidates for a future QA
batch, not padding for this one.
