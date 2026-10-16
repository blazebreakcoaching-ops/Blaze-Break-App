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

## QA Batch 10: OAuth integration lifecycle + Slack/Jira signal defensive catch blocks

The first batch to move into the big OAuth/signals route group - 7
routes: `POST /api/integrations/:service/connect`,
`POST .../disconnect`, `GET /api/integrations/status`, `POST`/`GET
/api/signals/slack`, `POST`/`GET /api/signals/jira`. All added to the
existing test files that already cover their happy paths
(`oauth-integrations.route.test.ts`, `slack-signal-ticker.route.test.ts`
- QA Batches 3 and 5), same reasoning as Batch 9: the mocks each test
needs already live there.

`connect` doesn't touch Firestore at all - `signOAuthState` is a pure
HMAC sign - so its one realistic failure is `getOAuthRedirectUri()`
throwing when `APP_URL` isn't configured on the server, a genuine
misconfiguration this route is already written to catch. Tested by
temporarily deleting `process.env.APP_URL` for one request and
restoring it after - the first time this series has forced a
route's catch via environment rather than Firestore/a provider mock.
`disconnect`/`status`/the two `GET` reads go through Batch 6/7's
`forceDocError`/`forceCollectionError` on their real, deterministic
paths (`integration_tokens/{service}`, `integrations`,
`live_signals/slack`, `live_signals/jira`). `jira/refresh` is the
interesting one: `getValidAccessToken`'s own `tokenRef.get()` call sits
*outside* its own inner `try` (only the refresh network call is wrapped
there), so forcing that read to throw propagates all the way up to the
route's own catch exactly like a genuinely unexpected failure would -
confirmed by reading the function, not assumed.

Measured effect: `server.ts` statement coverage rose to 69.52%, branch
to 57.85%, lines to 70.34%. ~130 routes with a fully uncovered catch
block remain - the rest of this OAuth/signals group (Asana, Monday,
Calendly, Calendar, Gmail, `signals/blend`, `signals/recovery-explain`,
Boundary Autopilot's Slack routes, push subscribe/unsubscribe) is the
natural next slice.

## QA Batch 11: Asana/Monday/Calendly/Calendar/Gmail signal defensive catch blocks

Finishes the rest of the provider-signal-routes group Batch 10 left
open: Asana/Monday/Calendly's refresh+read routes, and Calendar/Gmail's
write+read routes - 10 routes total, all added to
`provider-signal-routes.route.test.ts` (QA Batch 4), which already
covers every one of their happy paths and upstream-error branches.

The three OAuth-backed refresh routes (Asana/Monday/Calendly) are
structurally identical to Batch 10's Jira case - `getValidAccessToken`'s
`tokenRef.get()` sits outside its own inner `try`, so `forceDocError` on
`integration_tokens/{service}` propagates straight to each route's own
catch. The three `GET` reads and Calendar/Gmail's `POST` writes are
single, deterministic doc calls on `live_signals/{service}`, going
through `forceDocError` directly (`get` for reads, `set` for the two
writes). No new test infrastructure needed anywhere in this batch - by
this point the pattern from Batches 6-10 generalizes cleanly across an
entire route family.

Measured effect: `server.ts` statement coverage rose to 69.8%, lines to
70.64% (branch unchanged at 57.85% - same reasoning as every batch in
this series: these were already-counted branches, just never taken).
~120 routes with a fully uncovered catch block remain. What's left in
the OAuth/signals group: `signals/blend`, `signals/recovery-explain`,
Boundary Autopilot's Slack routes, push subscribe/unsubscribe.

## QA Batch 12: signals/blend + signals/recovery-explain (zero prior coverage)

Different from every other batch in this series: `GET /api/signals/blend`
and `POST /api/signals/recovery-explain` had **no test coverage of any
kind** before this batch, not just an untested catch block - unlike
everything else on the original gap list, which already had deep
happy-path tests elsewhere. New file
`signals-blend-recovery-explain.route.test.ts` covers a minimal real
happy path for each (auth requirement, the no-baseline early-return and
a calendar-driven drift nudge for `/blend`; the self-report baseline
scoring for `/recovery-explain`) plus the defensive catch block for
both, same as every other route in this series. `computeBlend` itself is
a pure function already covered by `archetype-scoring.test.ts` - this
file is about the route's own Firestore orchestration and drift-nudge
logic, not re-proving the blend math.

Both routes read 2-3 docs via `Promise.all` before doing anything else -
`forceDocError` on the first one listed (`diagnostics/latest` for
`/blend`, `live_signals/calendar` for `/recovery-explain`) is enough to
hit the catch, since a `Promise.all` rejects as soon as any one of its
promises does.

Measured effect: `server.ts` statement coverage rose to 70.66%, branch
to 58.87% (branch coverage actually moved this time, unlike every prior
batch in this series - these two routes' real conditional drift-nudge
logic was previously untested too, not just their catch blocks), lines
to 71.51%. ~118 routes with a fully uncovered catch block remain:
Boundary Autopilot's Slack routes and push subscribe/unsubscribe close
out the OAuth/signals group, then the ~300-route gap moves into
Command Centre/admin/org territory.

## QA Batch 13: Boundary Autopilot + push subscribe/unsubscribe (zero prior route coverage)

Closes out the OAuth/signals group. Same situation as Batch 12:
`boundary-autopilot-schemas.test.ts` only unit-tests the Zod schemas in
isolation - none of the 6 Boundary Autopilot routes, or the 2 push
routes, had ever been exercised through an actual request. New file
`boundary-autopilot-push.route.test.ts` covers a real happy path for
each (listing/filtering Slack workspace members, sending a DM, setting
DND/status, logging a calendar decline, reading history back, storing/
removing a push subscription) plus the defensive catch block.

A genuine finding while writing the `log-calendar-decline` catch-block
test: it isn't reachable. `logAutopilotAction` - the one Firestore call
in that route's try block - has its *own* inner `try`/`catch` that
swallows a write failure and logs it, specifically so "a logging
failure shouldn't mask the actual action's result" (the function's own
comment). This is the exact same resilience contract
`admin-audit-log-resilience.route.test.ts` already proved for admin
actions, just not yet proved for autopilot actions. The test was
corrected to assert that real contract (the route still returns 200,
and the failure is still visible via `logger.error`) instead of a 500
that can never actually happen - caught by running the suite itself:
the original wrong assertion failed immediately, and because the test
aborted before its own `restore()`/`mockRestore()` cleanup ran, the
leaked Firestore-method override and the leaked `console.error` spy
cascaded into three unrelated-looking failures later in the same file,
which resolved the moment the root assertion was fixed - a reminder of
why this series always calls `restore()` unconditionally in spirit, and
why a cascade of odd failures in one file is often one real bug, not
four.

Measured effect: `server.ts` statement coverage rose to 72.22%, branch
to 59.69% (moved again, same reason as Batch 12 - real route logic was
untested, not just catch blocks), lines to 73.1%. ~111 routes with a
fully uncovered catch block remain. This closes the entire OAuth/
signals group from the original gap list; the ~300-route gap now moves
into Command Centre/admin/org territory.

## QA Batch 14: Evolution Engine admin routes (change proposals, cost budget, freeze, rollout plans)

Moves into the admin/org territory the Batch 13 note said was next.
Unlike Batches 6-13, this group already had real happy-path route tests
in four existing files (`evolution-change-proposals.route.test.ts`,
`evolution-cost-budget.route.test.ts`, `evolution-freeze.route.test.ts`,
`evolution-rollout-plans.route.test.ts`) - this batch adds a `defensive
catch blocks` describe block to each one rather than creating new
files, the same "extend, don't duplicate" call made in Batches 9-11.

13 new tests across the 4 files, one per route whose catch block's
generic-500 branch had never fired: `POST`/`GET
/api/admin/evolution/change-proposals`, `.../submit`, `.../decide`,
`.../withdraw`, `.../apply`, `GET`/`POST /api/admin/evolution/cost-
budget`, `GET`/`POST /api/admin/evolution/freeze`, `POST`/`GET
/api/admin/evolution/rollout-plans`, `.../rollout-plans/:id/status`.
Every one of these routes' first real Firestore call is a doc `get()`
(or a `set()` for the two write-only config routes, or an `orderBy().
get()` query for the two list routes) with no prior `try`/`catch` of
its own to swallow the failure first, so `forceDocError`/
`forceCollectionError` reach the route's own catch cleanly in every
case - no structurally-unreachable findings this batch.

One exclusion, found while scoping: `GET /api/admin/evolution/nova-
runtime` does no Firestore I/O at all (`buildNovaRuntimeReport` is a
pure function over already-in-memory provider-configured booleans) -
its only realistic failure is `requireEvolutionAccess` throwing
`Forbidden`, already exercised via its 403 path. Same category as the
Batch 6-13 "structurally unreachable catch" findings (`entitlements/
pricing`, `log-calendar-decline`, etc.) - documented here rather than
silently skipped.

`GET /api/admin/evolution/connectors` and `GET /api/admin/evolution/
context-brain/health` are also Evolution Engine routes with a fully
uncovered catch block, but have no existing dedicated test file found
via grep - left for a future batch rather than mixed into this one, to
keep the "extend existing coverage" scoping clean per route family.

Measured effect: `server.ts` statement coverage rose to 72.8%, branch
to 60.19%, lines to 73.7%. Routes with a fully uncovered catch block:
104 (down from 111), closing the entire change-proposals/cost-budget/
freeze/rollout-plans slice of the Evolution Engine group.

## QA Batch 15: Evolution Engine Connector Layer + Context Brain Health

Closes the last two Evolution Engine routes flagged in Batch 14's
scoping note: `GET /api/admin/evolution/connectors` and `GET
/api/admin/evolution/context-brain/health`. Both already had dedicated
test files (`evolution-connectors.route.test.ts`,
`evolution-context-brain.route.test.ts`) with real happy-path
coverage - same "extend, don't duplicate" call as Batch 14.

Both routes' first (and only) Firestore read is a `db.collectionGroup
(id).get()` scan across every org/user - a different underlying class
from the single-collection `CollectionRef` that `forceCollectionError`
already targets, so neither existing helper could reach it. Added
`forceCollectionGroupError(collectionId, error)` to
`test/fake-firestore.ts`, same monkey-patch-the-prototype shape as
`forceDocError`/`forceCollectionError`, scoped by collection id (a
collection-group query has no single fixed path to key off of).

Measured effect: `server.ts` statement coverage rose to 72.85%, branch
to 60.23%, lines to 73.76%. The "fully uncovered catch block" route
count (104) didn't move - both routes already had their `Forbidden`
branch exercised by an existing 403 test, so the script's coarser
whole-catch-body metric never counted them as fully uncovered to begin
with; the generic-500 branch specifically was the real, now-closed gap.
This closes every Evolution Engine route in the original gap list.

## QA Batch 16: admin/users/:uid + admin/feedback (zero prior coverage), admin/summary false-positive noted

Moves into the core admin/org territory flagged as next after the
Evolution Engine group closed out. Two genuine gaps closed, plus one
scoping finding worth recording so it isn't re-investigated later.

`GET /api/admin/users/:uid` had zero coverage of any kind (only its
sibling mutation routes `.../role` and `.../suspend` were tested in
`admin-users.route.test.ts`) - added a `describe` block there covering
the real happy path (Auth account merged with the Firestore profile/
fingerprint docs, including the `disabled`/missing-doc cases) plus the
defensive catch block (forced via `forceDocError` on the profile read).
`GET /api/admin/feedback` was also at zero coverage - new file
`admin-feedback.route.test.ts` (list/empty-list/catch), reading the
same `feedback_submissions` collection `POST /api/feedback/submit`
(covered separately in Batch 7) writes to.

Scoping finding, not acted on: `GET /api/admin/summary` appeared in
the gap list, but reading it closely shows this is a **false positive**
in `analyze_coverage.py`'s own heuristic, not a real gap. The script
locates a route's catch block with a naive "first `} catch (` after
the route line" regex - but `admin/summary` wraps each of its five
independent stats queries (`users`, `fingerprint` collectionGroup,
`public_feature_flags`, `organisations`, `anxiety_reset_events`) in
its *own* inner `try`/`catch` that degrades to a documented default
rather than failing the whole response (the same "one query failing
shouldn't take the others down" pattern used elsewhere in this file) -
the script finds the FIRST inner catch (`totalUsersCount = 1`), not
the route's real outer catch 140 lines later, and flags that inner
one-liner as "fully uncovered" even though the route's actual outer
catch is already exercised (a `NOT_ADMIN` call already asserts the
500 in `admin-summary.route.test.ts`). No code or test change needed
here - noted so a future batch doesn't re-scope this route expecting
a real gap.

Measured effect: `server.ts` statement coverage rose to 73.15%, branch
to 60.42%, lines to 74.06%. Routes with a fully uncovered catch block:
102 (down from 104 - `admin/summary` was never counted as closeable
work to begin with, so the net-2 drop is exactly the two real routes
closed).

## QA Batch 17: admin/knowledge-chunks (zero prior coverage) + admin/orgs + admin/content-library catch blocks

Closes out the remaining admin config/org-management routes that sit
before the large `/api/org/:orgId/*` territory (the next slice to
scope). Three routes:

- `POST /api/admin/knowledge-chunks` - zero coverage of any kind. New
  file `admin-knowledge-chunks.route.test.ts`: permission gate, happy
  path (stores the chunks, audit-logged), and the defensive catch
  block (`forceDocError` on `app_config/knowledge_chunks` `set`).
- `POST /api/admin/orgs` - happy path and `orgId` validation already
  covered in `admin-orgs.route.test.ts`, but not its catch block.
  Turned out the route's FIRST catch (the one `analyze_coverage.py`'s
  "first `} catch (` after the route" heuristic actually locates) is
  an inner one around `getAuth().getUserByEmail(initialAdminEmail)` -
  a genuine, reachable 400 branch ("no existing account for that
  email") that had never been exercised, since the test file's
  `getAuth()` mock didn't even define `getUserByEmail` and no test
  passed `initialAdminEmail`. Added the mock function (default: reject,
  so the 400 path is real rather than an accidental "not a function"
  TypeError) plus three tests: the 400 rejection, a success path that
  resolves a real admin email and sets them as the org's first
  owner/member, and the existing-org-lookup outer-catch 500 (`forceDocError`
  on `organisations/<orgId>` `get`).
- `POST /api/admin/content-library` - happy path and the permission
  gate already covered in `admin-permission-enforcement.route.test.ts`
  (that file's whole purpose), but not its catch block either. Added
  one test forcing the `app_config/content_library` `set` to throw -
  slightly off that file's main theme (permission enforcement, not
  catch blocks) but the same "extend rather than duplicate" call made
  throughout this series, since the happy-path mocks/auth setup
  already live there.

Measured effect: `server.ts` statement coverage rose to 73.45%, branch
to 60.64%, lines to 74.37%. Routes with a fully uncovered catch block:
100 (down from 102 - `knowledge-chunks` and `orgs` each closed one;
`content-library`'s catch wasn't flagged in this script's coarse count
to begin with, for the same reason Batch 16 found with `admin/summary`
- the script locates only the first `} catch (` after a route
definition, so a route whose first catch is an inner, narrower one -
or whose outer catch happens to already be exercised via a 403 test -
can read as closed, or as still-open after the WRONG catch is fixed,
until the real one is checked by hand). Next up: the
`/api/org/:orgId/*` family, starting with `org/leave` and `org/me`.

## QA Batch 18: org/leave + org/me catch blocks (first of the /api/org/:orgId/* territory)

Opens the large `/api/org/:orgId/*` family flagged at the end of
Batch 17 - starting with the two non-`:orgId` membership routes that
sit just before it. Both already had real happy-path coverage
(`org-rbac.route.test.ts` for `POST /api/org/leave`,
`org-me.route.test.ts` for `GET /api/org/me`) but no catch-block test.
Added one `forceDocError` test to each, targeting each route's first
real Firestore call (`users/<uid>` `get` in both cases).

Measured effect: `server.ts` statement coverage rose to 73.5%, branch
to 60.64%, lines to 74.43%. Routes with a fully uncovered catch block:
98 (down from 100). Next: the `/api/org/:orgId/*` routes proper,
starting with `my-privacy-status`, `privacy-receipts`, and `dashboard`.

## QA Batch 19: org/:orgId/my-privacy-status + privacy-receipts catch blocks

Continues into the `/api/org/:orgId/*` family proper. Both routes
already had real happy-path coverage (`my-privacy-status.route.test.ts`,
`trust-mirror-privacy-receipts.route.test.ts`) but no catch-block
test. Both routes' first real Firestore call is the same
`organisations/<orgId>` `get` used for the membership check, so one
`forceDocError` test closes each.

Measured effect: `server.ts` statement coverage rose to 73.56%, branch
to 60.64%, lines to 74.49%. Routes with a fully uncovered catch block:
96 (down from 98). `GET /api/org/:orgId/dashboard` - the Work Design
Pulse admin default view, next in file order - turned out to have
zero coverage of any kind (not just its catch block) and depends on
`buildExecutiveWorkDesignPayload`'s full locked/unlocked cohort logic,
so it's deliberately left for its own dedicated batch rather than
folded in here.

## QA Batch 20: org/:orgId/dashboard (zero prior coverage)

Closes the route flagged at the end of Batch 19. `GET /api/org/:orgId/
dashboard` - the Work Design Pulse admin default view - had zero
coverage of any kind. New file `org-dashboard.route.test.ts` mirrors
`executive-work-design.route.test.ts`'s seeding pattern (same
`buildExecutiveWorkDesignPayload` dependency) and covers: access
control (auth required, non-admin refused, admin allowed), the
locked-cohort response shape, the real-signal/narrative/action-budget/
debt-summary response shape once the cohort is sufficient (confirming
this route never leaks the `financialEstimate`/`costInputsAvailable`
fields that are Executive Work Design's job, not the default
dashboard's), and the defensive catch block.

Measured effect: `server.ts` statement coverage rose to 73.61%, branch
to 60.69%, lines to 74.55%. Routes with a fully uncovered catch block:
95 (down from 96). Next: `recognition-suggestions`, the other
Positive Reinforcement Engine route in this same file region.

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
