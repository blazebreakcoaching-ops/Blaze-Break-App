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

## QA Batch 5: the Slack conversation-scan ticker

Closes the last item Batch 4 explicitly left open: `POST
/api/signals/slack/tick`. Genuinely a different shape from every other
route in this area - not one fetch and one write, but a persisted scan
cursor advanced one conversation per call (Slack rate-limits
`conversations.history` to 1 request/minute for non-Marketplace apps, so
a full workspace scan can't happen synchronously - see the comment above
the route). Proving this needed driving the route through several ticks
against a seeded in-progress state, not just one request/response.

`slack-signal-ticker.route.test.ts`, 14 tests, cover: not-connected 404,
the 60-second rate limit (refuses to tick again that soon, and never
calls Slack at all while limited), the first-ever tick (identity lookup
+ conversation list + the *first* conversation's history all in the same
call), an account with zero conversations short-circuiting cleanly, both
`auth.test` and `conversations.list` failure 502s, a mid-cycle tick
reusing the already-known `selfUserId` (no re-verification) while
advancing to the next conversation, a single conversation's history call
failing without aborting the scan or losing progress, correct
UTC after-hours/weekend message classification, full-cycle completion
rolling the in-progress counts into `lastCompleted` and starting a fresh
cycle (list re-fetched, identity reused), and proof `redactSlackState`
never leaks `selfUserId` or the raw conversation ID list to the client
on either the tick response or `GET /api/signals/slack`.

This closes every item flagged in this document's OAuth/signals area
across Batches 3-5.

Measured effect: `server.ts` statement coverage rose from 71.34% to
72.36%, branch coverage from 56.28% to 57.61% - overall project coverage
80.76%→81.41% statements, 70.24%→71.07% branches.

(Note: the baseline below this section, and the starting point Batch 6
below measures from, reads lower than the numbers just above - 78.44%/
71.07% overall, `server.ts` 68.5%/57.61% - not a regression. Security
Operations Batches 3-4, between Batch 5 and Batch 6, restructured ~174
single-line `err.message` fallbacks into explicit `if`/`else` chains so
the generic-500 branch could get its own `GENERIC_SERVER_ERROR` message
and `logger.error` call. That's more statements and branches in
`server.ts` - mostly the newly-explicit `else` arms, which existing
happy-path tests were never exercising in either shape - so the
denominator grew faster than the numerator. No behavior changed and no
coverage was lost; the percentage just measures more surface now.)

## QA Batch 6: MFA route defensive catch blocks

The first concrete slice of this document's one remaining fully-open
item - "defensive catch-block branches across the file's ~300 routes."
That gap is too large for one batch (the baseline section below says so
explicitly), so this picks one coherent, self-contained, already-tested
group rather than attempting breadth: the 5 TOTP two-factor routes
(`GET /api/auth/mfa/status`, `POST .../enroll/start`, `.../enroll/confirm`,
`.../verify-at-signin`, `.../disable`). `account-security.route.test.ts`
already covers every one of these routes' happy paths and validation
errors in depth; what it never exercised is the `catch` block behind
each - the "Firestore itself threw" backstop. Security-critical, and a
clean place to start: each route already returns its own specific, safe,
non-leaking message on that branch (confirmed during Security Operations
Batch 3's audit - these were among the 6 sites that already had their
own labeled logging), so there's nothing to fix here, only to prove the
backstop actually does what its comment says.

Forcing a Firestore throw at exactly the right point needed two small,
reusable additions to `test/fake-firestore.ts` (useful for every future
slice of this same gap, not just this one): `forceDocError(path, method,
error)` monkey-patches one specific document's `get`/`set`/`update`/
`delete` to reject - scoped to that single path via a `this.path` check
inside the override, so every other document in the same request still
behaves normally - and `forceTransactionError(error)` does the same for
`db.runTransaction(...)` itself, needed because the two routes that read/
write through a transaction (`verify-at-signin`/`disable`, sharing
`verifyMfaAttempt`'s lockout logic) never call a `DocRef`'s own methods
directly. Neither helper imports `vitest` - `fake-firestore.ts` stays
test-framework-agnostic, same as its existing exports - the caller's own
`try`/`finally` or end-of-test call restores the original behavior.

`mfa-defensive-errors.route.test.ts`, 5 tests - one per route, each
forcing that route's first real Firestore call to fail and asserting
three things: the client gets the route's existing generic, safe
message (unchanged - nothing here needed fixing), the status code is
500, and the real error is actually captured via `logger.error` (not
silently dropped). `status`/`enroll/start`/`enroll/confirm` go through
`forceDocError` (the `get`/`set`/`get` each route's catch wraps);
`verify-at-signin`/`disable` go through `forceTransactionError`.

Measured effect: `server.ts` statement coverage rose from 68.5% to
68.64%, lines from 69.27% to 69.42% (branch coverage unchanged at
57.61% - these 5 catch blocks were already-counted branches, just never
taken) - overall project coverage 78.44%→78.53% statements. Deliberately
small and expected: the baseline note above already explains why a
single slice of a ~300-route gap won't move the overall number much.
This is a down payment on area (1), not a close of it - the ~300-route
gap remains the one deliberately-not-fully-closed item on this list,
now with a pattern (and reusable fake-firestore helpers) a future batch
can repeat against the next coherent route group.

## QA Batch 7: Guardian/Support route defensive catch blocks

The next slice of the same gap Batch 6 opened, picked the same way:
`POST /api/feedback/submit`, `POST /api/guardian/support-event`,
`GET /api/guardian/alerts`, `POST /api/guardian/contacts/:id/test-ping` -
all four already have deep happy-path coverage elsewhere
(`guardian-alert.route.test.ts`, `guardian-support-invitation.route.test.ts`)
but had never exercised the catch block behind them. All four already
return their own safe, non-leaking message there, so again pure
coverage, nothing to fix.

`feedback/submit` and `guardian/support-event` both write via
`.collection(id).add(...)` (an auto-generated doc id each call, so
Batch 6's `forceDocError` - which targets one fixed path - can't reach
them). `GET /api/guardian/alerts` reads via a `.orderBy().limit().get()`
query on a collection, same issue. Added `forceCollectionError(path,
'get' | 'add', error)` to `test/fake-firestore.ts` alongside Batch 6's
two helpers - identical shape, scoped to one collection path via the
same `this.path` check, so a `CollectionRef`'s `.clone()` (from
`.orderBy()`/`.limit()`) still gets caught since it preserves `path`.
`guardian/contacts/:id/test-ping` reads a real, fixed doc path
(`support_circle/{contactId}`) inside `resolveGuardianContact`, so that
one reuses `forceDocError` directly.

Deliberately NOT in this batch, despite being on the same uncovered-catch
list: `POST /api/support/request` and `POST /api/twilio/send`. Read
closely, both catch blocks are structurally unreachable under the
current implementation, not just untested - every call either one's try
block makes already swallows its own failure and returns a typed result
instead of throwing (`postToBrevoEmail` logs and returns `false`;
`sendTwilioMessage` has its own inner `try`/`catch` that returns
`{ success: false, error }`). Forcing either outer catch to fire would
mean synthesizing a JS-engine-level error with no real-world analogue -
a different, much lower-value exercise than every other site in this
series, so left alone rather than padded in just to move a count.

`guardian-support-catch-blocks.route.test.ts`, 4 tests, one per route,
same three assertions as Batch 6 (existing safe message unchanged,
status 500, `logger.error` actually captured the real error).

Measured effect: `server.ts` statement coverage rose to 68.88%, branch
coverage to 57.75%, lines to 69.68% - small, same reasoning as Batch 6's
own note about why one slice of a ~300-route gap barely moves the
number (Security Operations Batch 5's restructuring, which landed
between Batch 6 and this one, also added more if/else surface to the
denominator - see the baseline note above). ~149 routes with a fully
uncovered catch block remain on this list.

## QA Batch 8: Nova voice-session + GAD-7 defensive catch blocks

Another coherent slice, same shape as Batches 6-7: the two Nova
voice-call-continuity routes (`POST`/`GET /api/nova/voice-sessions`,
already happy-path-tested in `messaging-and-voice.route.test.ts`) plus
all 8 GAD-7 wellbeing routes (`gad7.route.test.ts` covers their happy
paths and validation errors in depth) - draft PUT/GET/DELETE, the
submit/history POST/GET, the context-tags PATCH, and the reminder-
preference PUT/GET. All 10 already used `GENERIC_SERVER_ERROR` +
`logger.error` (closed by Security Operations Batch 5's sweep, since
every one of these already used the `error` catch-variable spelling);
none had ever had that catch block actually exercised.

Needed both of Batch 6's existing helpers (`forceDocError` for the
fixed-path doc reads/writes - `wellbeing_drafts/gad7`,
`gad7_assessments/{id}`, `preferences/gad7_checkin`) and Batch 7's
`forceCollectionError` (for the auto-id `.add()` writes and the
`.orderBy().limit().get()` queries - `nova_voice_sessions`,
`gad7_assessments`). No new test infrastructure needed - this batch is
mostly what makes it a good next slice: it proves last batch's helpers
generalize cleanly to a different feature area rather than needing
their own bespoke mechanism each time.

`nova-gad7-catch-blocks.route.test.ts`, 10 tests - one per route, same
three assertions as Batches 6-7 (existing safe message unchanged, status
500, `logger.error` actually captured the real error), via a small
shared `expectGenericFailure` helper since all 10 routes share the exact
same `GENERIC_SERVER_ERROR` response shape (unlike Batches 6-7, where
each route had its own distinct message).

Measured effect: `server.ts` statement coverage rose to 69.16%, lines to
69.97% (branch coverage unchanged at 57.75% - same reasoning as Batch 6:
these catch blocks were already-counted branches, just never taken).
~139 routes with a fully uncovered catch block remain on this list -
down from ~153 before Batch 6, a third of the way through at the current
pace of 3 batches covering 19 routes. Still substantial, separate work,
same as every batch in this series has said.

## QA Batch 9: entitlements/me + billing/checkout-session defensive catch blocks

A smaller slice than Batches 6-8, picked for a reason worth naming: this
is the first batch in this series added to the EXISTING test files that
already cover these routes' happy paths (`entitlements.route.test.ts`,
`stripe-billing.route.test.ts`) rather than a new dedicated file. Both
already carry exactly the mocks/fixtures each test needs - the Stripe
`checkout.sessions.create` mock in particular - so duplicating that setup
in a fresh file would have been pure repetition for its own sake, the
opposite of what this series has tried to avoid.

`GET /api/entitlements/me`'s first real Firestore call
(`getEntitlementRecord`'s read of `users/{uid}/entitlements/status`) now
goes through `forceDocError`, same pattern as Batches 6/8.
`POST /api/billing/checkout-session`'s catch wraps a Stripe API call, not
Firestore - rejected directly via the test file's own
`h.checkoutSessionsCreate.mockRejectedValueOnce(...)`, no new fake-store
helper needed since the mock was already there.

Deliberately skipped: `GET /api/entitlements/pricing`, on the same
uncovered-catch list as the other two. Its try block does nothing but
synchronous array/object mapping over static config
(`PURCHASABLE_PLANS`, `PLAN_PRICING`, `getCapability`) - no I/O, nothing
user-controlled, nothing that can realistically throw. Same reasoning as
Batch 7's `support/request`/`twilio/send` exclusions: forcing it would
mean faking an error with no real analogue, not closing a real gap.

Measured effect: `server.ts` statement coverage rose to 69.25%, branch
to 57.8%, lines to 70.06%. ~137 routes with a fully uncovered catch
block remain.

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
   Batches 3-5** - see below (state signing/CSRF verification, the
   connect/callback/disconnect/status lifecycle, `getValidAccessToken`'s
   refresh branches, every provider's own signal-fetch route, and
   Slack's conversation-scan ticker). Nothing flagged in this area
   remains open.
3. ~~**The Nova Live WebSocket relay.**~~ **Closed in QA Batch 2** - see
   below. It needed a fake WebSocket client, which this batch built.

Closing (1) meaningfully is substantial, separate work - pure volume
across ~300 routes' backstop branches, lower severity (these are
backstops behind already-tested happy paths, not primary logic) but
high enough volume that a single batch wouldn't make a visible dent.
The only concrete, fully-open item left on this list.
