# NOVA PHASE 5E — Secure Connectors, Conversational Continuity & Production-Grade Verification — Delivery Report

Branch: `claude/nhei-phase-1`. Not merged to main. Not deployed. Real
calendar writes remain disabled. No personal NHEI mode was activated.
Independent safeguarding was not bypassed. No real external action was
undertaken. This report covers Phase 5E only — it builds on, and does not
replace, the Phase 5B/5C/5D delivery reports or the three governing docs
it updates.

## 1. Actual starting and ending commits

- **Starting commit**: `81d6512` — "NHEI Phase 5D: Calendar Protection
  vertical slice & integration hardening" (the last commit on
  `claude/nhei-phase-1` before this phase's work began).
- **Ending commit**: not yet created at the time this report was written
  — see this report's own final section/the commit this file is added
  in. All work described below is captured in that one commit's diff.
- **Diff shape**: 23 files changed (21 modified, 2 new counted by
  extension only — see the full new-file list in §2), +1,286/-119 lines
  across the modified files alone, plus 10 wholly new files.

## 2. New and modified source files

**New files:**
- `nova-google-calendar-connector.ts` — the real (not stub) Google
  Calendar connector, dependency-injected transport.
- `nova-google-calendar-connector.test.ts` — 42 unit + integration tests.
- `nova-google-calendar-connector-no-real-fetch-audit.test.ts` — static
  audit test.
- `nova-calendar-protection-service.emulator.test.ts` — 9 real Firestore
  emulator integration tests.
- `vitest.emulator.config.ts` — dedicated Vitest config for the emulator
  suite (excluded from the default `npm test`).
- `playwright.config.ts` — Playwright config (desktop + mobile Chromium
  projects, using the pre-installed `/opt/pw-browsers/chromium` binary).
- `tests/e2e/nhei-phase5-journey.spec.ts` — 13 browser-level test
  scenarios (26 runs across 2 viewports).
- `src/components/NovaAgenticJourney.tsx` — the integrated
  Before Words → Chat → Invisible Load → Take the Load journey sequencer.
- `src/nhei-phase5-preview-e2e-entry.tsx` — dev-only Playwright entry
  point (mounts only `NheiPhase5Preview`).
- `dev-nhei-phase5-preview.html` — dev-only HTML page for the above.

**Modified files:**
- `server.ts` — `google_calendar_actions` OAuth provider, PKCE helpers,
  `fetchAccountIdentity`/`revoke` hooks, `getValidAccessToken` invalid_grant
  hardening, `oauth_pkce` connect/callback wiring.
- `firestore.rules` — `oauth_pkce` server-only rule (already present from
  the in-progress state before this report), plus new
  `calendar_protection_proposals`/`calendar_protection_audit` explicit
  server-only rules (§9 finding/fix).
- `.env.example` — `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID`/`_CLIENT_SECRET`.
- `docs/INTEGRATIONS_SETUP.md` — new Google Calendar Actions section.
- `oauth-integrations.route.test.ts` — invalid_grant-disconnect test +
  full new PKCE/identity/revoke describe block.
- `nova-google-calendar-adapter.ts` / `.test.ts` — optional `proposalId`
  tagging parameter + 2 new tests.
- `nova-take-the-load-connector-contract.ts` — additive `proposalId?`
  field on the connector request type.
- `nova-calendar-protection-service.ts` / `.test.ts` —
  `reconcileAmbiguousCalendarProtectionProposal` (already present from
  Phase 5E's earlier work) plus this session's new
  `reconcileStuckExecutingCalendarProtectionProposal` +
  `CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS` + 6 new tests.
- `nova-before-words-temporary-context.ts` / `.test.ts` —
  `formatTemporaryBeforeWordsContextForNova` + 5 tests.
- `src/components/NovaChat.tsx` — `temporaryBeforeWordsContext` /
  `onTemporaryBeforeWordsContextConsumed` props.
- `src/components/NheiBeforeWords.tsx` — `onDecided` callback prop.
- `src/components/NheiPhase5Preview.tsx` — wires `NovaChat` to Before
  Words' new callback (section "4b"), mounts `NovaAgenticJourney`
  (section "6").
- `src/lib/secure-api.ts` — narrowly-scoped, `import.meta.env.DEV`-gated
  `__E2E_MOCK_AUTH__` escape hatch for the Playwright suite only.
- `vitest.config.ts` — excludes `**/*.emulator.test.ts` from the default
  suite.
- `package.json` / `package-lock.json` — `@playwright/test@1.64.1`
  devDependency, `test:emulator`/`test:e2e` scripts.
- `.gitignore` — `test-results/`, `playwright-report/`, `blob-report/`,
  `firestore-debug.log`, `ui-debug.log`.
- `docs/NHEI_ARCHITECTURE.md`, `docs/NHEI_RELEASE_BLOCKERS.md`,
  `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` — see §11.

## 3. Google OAuth implementation status

**Implemented and tested:**
- A new `google_calendar_actions` entry in `server.ts`'s existing
  `OAUTH_PROVIDERS` framework — reused, not rebuilt. Authorization-code
  flow with PKCE (S256 `code_challenge`/`code_verifier`), the verifier
  stored server-only at `users/{uid}/oauth_pkce/{service}` and read back
  exactly once (then deleted) at callback.
- CSRF protection via the pre-existing signed, expiring `state` parameter
  (`signOAuthState`/`verifyOAuthState`) — unchanged, reused.
- `access_type: offline` + `prompt: consent` so a refresh token is
  actually issued.
- `fetchAccountIdentity`: after token exchange, a real call to Google's
  userinfo endpoint records `connectedAccountEmail` on the redacted,
  client-readable `integrations/{service}` status doc — never the raw
  token doc, never logged. This is the real "connected-calendar ownership
  check."
- `revoke`: on disconnect, calls Google's own revoke endpoint with the
  real access token, best-effort (never blocks the local disconnect if
  it fails).
- `getValidAccessToken` hardened codebase-wide (affects every provider,
  not just this one): an `invalid_grant` refresh failure now deletes the
  token doc and marks the integration disconnected (`disconnectReason:
  'revoked'`), returning `null` — previously it silently returned an
  already-expired token forever.
- Minimal scope: `calendar.events openid email` — write-capable but
  nothing broader.
- Explicit account linking/unlinking: the existing generic
  connect/callback/disconnect/status routes, unchanged in shape.
- Expired/revoked token handling: covered by the `invalid_grant` fix
  above.
- No tokens in logs or client-visible responses: confirmed by code
  review — only `connectedAccountEmail` (not the token) reaches the
  status doc.

**Explicitly NOT done this phase**, per the directive's own stop
condition: no server-side connector is wired into any live route; no
real external write has ever been attempted.

## 4. Server-side credential/ownership handling

Covered in §3. Additionally: the client-side-only Google Calendar read
connection (`signInWithCalendar`, `src/lib/auth.tsx`) was explicitly
NOT reused or extended — `google_calendar_actions` is a genuinely
separate provider, token, and scope, per the directive's own instruction
not to assume a previously granted client-side scope is sufficient.

## 5. Calendar connector implementation

`nova-google-calendar-connector.ts`: dependency-injected
`GoogleCalendarHttpTransport` function type. Supports:
- **Preparation of a protected-time event**: `createGoogleCalendarConnector(...).execute()`
  builds a real Events API insert request (reusing the Phase 5D adapter's
  `buildGoogleCalendarEventInsertRequest`, now with the proposal id tagged
  as a private extended property), re-throws transport errors (never
  swallows them into a false `ok: false`), and treats a 2xx response with
  no `id` field as a failure, never a false success.
- **Verification**: `verifyGoogleCalendarEventExists` — a real GET against
  the Events API.
- **Authorised reversal**: `undo()` — treats Google's 204 (No Content) and
  410 (Gone/already-deleted) both as a successful undo, since the end
  state is what matters.

Tested with fake-response unit tests AND a real local `http.Server`
integration test (genuine HTTP request/response handling, zero real
network calls) — 42 tests total. `CALENDAR_PROTECTION_EXECUTION_ENABLED`
remains hardcoded `false`; production routes refuse external writes
unchanged. `nova-google-calendar-connector-no-real-fetch-audit.test.ts`
statically confirms no `fetch`/`http`/`googleapis` import and no import
from `server.ts` or any `.tsx` file.

## 6. Execution/reconciliation safeguards

Audited the transaction-based claim mechanism against every scenario the
directive names:

| Scenario | Safeguard |
|---|---|
| Simultaneous workers | `activeAttemptId` claimed inside a real `db.runTransaction`; the loser gets `already_executing`/`already_undoing`, never a second connector call — confirmed against the REAL Firestore emulator this phase (not just the in-memory fake). |
| Process termination during execution | NEW this phase: `reconcileStuckExecutingCalendarProtectionProposal` — a proposal stuck in `executing` past `CALENDAR_PROTECTION_STUCK_EXECUTION_THRESHOLD_MS` (10 min) can be reconciled against a real search answer; a second `execute` call alone can never reach it (deliberately short-circuits forever). |
| Network timeout after a successful provider write | Covered by the `ambiguous` outcome (Phase 5D) + `reconcileAmbiguousCalendarProtectionProposal` (Phase 5E) — the connector tags the created event with the proposal id so a later search can find it. |
| Repeated client requests | `prepareCalendarProtectionProposal`'s idempotency key — confirmed again against the real emulator this phase. |
| Uncertain provider outcomes | The `ambiguous` state is structurally excluded from the normal retry path (`retryCalendarProtectionExecution` only accepts `failed`). |
| Permission revocation | `allowCalendarActions` re-checked at execute time, not just propose time (Phase 5D); `getValidAccessToken`'s new invalid_grant handling (Phase 5E) means a revoked OAuth grant disconnects cleanly rather than silently retrying with a dead token. |
| A stale approval | 15-minute approval TTL (Phase 5D), reverts to `awaiting_approval` on execute. |
| An event deleted/modified outside Blaze Break | `verifyGoogleCalendarEventExists`/`findGoogleCalendarEventByProposalId` exist for this; not wired into any automatic sweep this phase (explicitly future work). |
| Disconnection of the linked account | `getValidAccessToken`'s invalid_grant handling. |

"A provider action succeeding must never be confused with the app merely
recording an approved proposal" — enforced structurally: `approved` and
`confirmed` are different states, and `confirmed` is only ever reached
after a real (or, today, real-shaped-but-disabled) connector call
returns `ok: true`.

## 7. Before Words conversation handoff

Audited both real Nova conversation entry points
(`/api/nova/chat`/`NovaChat.tsx`, `/api/nova/live`/`useNovaLiveVoice.ts`).
`NovaChat.tsx`'s existing, client-composed, per-request, never-persisted
`systemInstruction` was found already sanctioned for exactly this use,
and reused rather than building a new channel.
`formatTemporaryBeforeWordsContextForNova` formats the temporary context
into a bounded (≤1,200 char), plainly-worded addendum with an explicit
"temporary, not saved, not a diagnosis" framing sentence. Two new
optional `NovaChat.tsx` props fold it into exactly one outgoing request;
the caller clears it after. `NovaAgenticJourney.tsx` wires this
end-to-end in the offline preview harness — a REAL `/api/nova/chat` call
now carries what the person just said in Before Words, for that one
reply. The voice path was reviewed and needs no component change for a
future phase to extend the same approach to it. No new Firestore write,
no extra model call, anywhere in this chain.

## 8. Integrated Nova journey

`src/components/NovaAgenticJourney.tsx` sequences Before Words →
temporary context → Nova chat → "what's on your plate" (Invisible Load)
→ Take the Load/Calendar Protection, each as its own step, skippable at
every point (Before Words' own two endings, a "Continue" past chat, a
"Skip ahead" past Invisible Load). A stage bar shows
Understanding/Suggesting/Preparing at the wrapper level; the remaining
six required labels (Awaiting permission/Executing/Confirmed/Failed/
Uncertain/Reversed) are rendered by `NovaTakeTheLoad.tsx`'s own
already-built `STATE_LABEL` map once a real proposal exists — not
duplicated. Mounted only in `NheiPhase5Preview.tsx` (still not `App.tsx`'s
live navigation); production navigation and NHEI feature gates are
unchanged.

## 9. Firestore emulator results

`nova-calendar-protection-service.emulator.test.ts`, run for real against
a genuinely running local Firestore emulator (confirmed startup, confirmed
teardown, confirmed `npm run test:emulator` skips cleanly — reports
"9 skipped", not a false pass — when the emulator isn't running):

**9/9 passed** covering: concurrent proposal approvals, concurrent
execution claims (connector called exactly once either way), duplicate
idempotency keys, account isolation, proposal expiry, stuck execution
(a second real `execute` call correctly refuses to re-enter), ambiguous
reconciliation, audit data consistency, and export/deletion
(`recursiveDelete`) coverage.

**Two genuine findings this test suite itself surfaced** (fixed in the
test, not hidden): (1) a real Firestore collection `.get()` does NOT
preserve write-order the way the in-memory fake's Map iteration does —
fixed by sorting on the audit entry's own `at` field; (2) which
short-circuit status (`already_executing` vs `already_executed`) the
losing concurrent `execute` call sees genuinely depends on timing against
a real backend, not just call order — both are valid, non-duplicating
outcomes, so the test now accepts either.

**Exact setup command** (documented in the test file's own header):
```
npx firebase emulators:start --only firestore --project demo-blaze-break-test
npm run test:emulator
```

## 10. Browser/component test results

**Component suite** (`npm run test:components`): 31/31 passed, unchanged
from Phase 5D (no new component unit test was added this phase — the new
UI wiring is covered by the Playwright suite instead, per §8/§11's own
reasoning that a real browser was the correct tool for proving it).

**Playwright** (`npm run test:e2e`): **26/26 passed** (13 scenarios × 2
viewports: desktop Chromium 1280×900, mobile Pixel 7 emulation), run for
real against the pre-installed `/opt/pw-browsers/chromium` binary, a
dedicated dev-only page (`dev-nhei-phase5-preview.html`), and every
provider response mocked at the network layer (`page.route`) — zero real
Firestore/Auth/Gemini calls. Covers: no horizontal overflow at either
viewport; large-text + keyboard-only interaction; Before Words skip and
correction; a real `role="dialog"`/`aria-modal`/focus-trapped/
Escape-to-close modal; Invisible Load → Take the Load pre-fill; the
suggested-vs-executed state distinction end to end; calendar action
permission denial; a client-side validation error state; failed
(retryable) vs. ambiguous (explicitly not auto-retried) connector
responses; consent withdrawal; and "Start over" return navigation. No
WCAG certification is claimed.

## 11. Cost/credential requirements

**No paid tier required.** Remaining work is entirely
founder/Google-Cloud-Console configuration, documented in
`docs/INTEGRATIONS_SETUP.md`'s new "Google Calendar Actions" section:
1. Enable the Google Calendar API for the project.
2. Configure the OAuth consent screen for the `calendar.events` scope.
3. While in "Testing" mode, add specific test-user emails to the
   allow-list (anyone else gets an "app not verified" block from Google).
4. Before this scope could be offered outside that small test group,
   Google's own app-verification review is required for a sensitive
   write scope — this is Google's process, not something this codebase
   can shortcut.
5. Create the OAuth client ID, set the redirect URI to
   `{APP_URL}/api/integrations/callback/google_calendar_actions`.
6. Set `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID`/`_CLIENT_SECRET` (`.env.example`
   updated).

## 12. Remaining work across all 18 workstreams

See `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` (reconciled this
phase — workstreams B, E and L updated with full Phase 5E detail; D, G,
I, K, M, P, Q, R reviewed and confirmed unaffected/still accurately
described as open). Headline items, unchanged by this phase's own stop
condition:
- Flipping `CALENDAR_PROTECTION_EXECUTION_ENABLED` and wiring the real
  connector into `server.ts` — explicitly a separate, later,
  explicitly-approved decision.
- A real connector for the generic engine's other category
  (`task_deferral`) and for Asana/Monday/Calendly — untouched.
- Workstreams D (Recovery Friction/Environment), P (wearables), Q
  (professional coaching handoffs) remain NOT STARTED — no code this
  phase, space preserved.
- Workstream I (My Support Circle/Recovery Ally) and K (Voice-first)
  remain BUILT AND INTEGRATED, untouched by this phase except K's own
  review recorded in §7 above.
- Workstream M (outcomes/coaching review) remains PARTIAL, untouched.

## 13. Human/privacy/safeguarding/legal decisions needed

1. **Google Cloud Console configuration and app-verification review**
   (§11) — founder-only, cannot be done from this environment.
2. **Raw-secret collections in the generic `/api/user/export` dump**
   (directive §9 finding, NOT fixed this phase): `integration_tokens`,
   `oauth_pkce`, and `security` (2FA) are swept into a user's own GDPR
   export verbatim by the existing generic `listCollections()` walk,
   alongside the already-safe, already-separate `integrations` status
   collection. This predates Phase 5E (every existing OAuth provider has
   the same exposure) and is NOT specific to the new
   `google_calendar_actions`/`oauth_pkce` additions — it is a
   cross-cutting data-minimisation question (what, if anything, should
   be redacted vs. included for a user's own secrets in their own
   export) that deserves a deliberate decision, not an improvised
   partial fix inside a feature-delivery phase. Documented here as a
   pending decision, per the directive's own instruction to keep
   unapproved retention parameters documented rather than silently
   resolved.
3. **Independent safeguarding review** — unchanged dependency, named in
   every prior phase's report; still the gate on activating any of this
   phase's conversational-continuity or agentic-action work for a real
   user.
4. **Real execution approval** — a separate, later, explicit decision,
   not requested or taken this phase.

## 14. Recommended next major batch

1. Build the Firestore-rules-emulator test coverage for
   `calendar_protection_proposals`/`calendar_protection_audit`'s new
   explicit server-only rules (added this phase; not yet given their own
   `test-rules.cjs` assertions, following the same gap that already
   exists for `integration_tokens`/`oauth_pkce`).
2. Decide and implement the export redaction question in §13 item 2,
   once a human has made the call on what "minimised" means for a user's
   own live secrets in their own export.
3. A real connector + UI for the generic engine's `task_deferral`
   category, following the exact pattern this phase established for
   calendar protection.
4. Once Google's app-verification review clears: flip
   `CALENDAR_PROTECTION_EXECUTION_ENABLED` for a small, explicitly
   consented pilot group — still gated on the independent safeguarding
   review for the conversational-continuity half of this phase.
