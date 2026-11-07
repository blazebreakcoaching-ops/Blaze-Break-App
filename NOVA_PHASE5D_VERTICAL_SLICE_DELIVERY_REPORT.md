# Nova Phase 5D — Agentic Nova Vertical Slice & Integration Hardening — Delivery Report

## 1. Starting and ending commits

- **Starting commit**: `5c603b8` ("NHEI Phase 5C: delivery report") — the
  last commit before this phase's work began.
- **Ending commit**: this report is committed together with the engineering
  work in the next commit on `claude/nhei-phase-1`. No merge to `main`, no
  deployment, no activation of any previously disabled capability.

## 2. Files actually changed

**New files:**
- `nova-calendar-action-permission.ts` + `.test.ts` — the separate,
  fail-closed `allowCalendarActions` permission boundary (directive §3).
- `nova-google-calendar-adapter.ts` + `.test.ts` — pure request-construction
  functions plus a structurally network-incapable connector stub
  (directive §5).
- `nova-before-words-temporary-context.ts` + `.test.ts` — the session-only
  temporary context for both Before Words endings (directive §6).
- `src/components/NovaTakeTheLoad.tsx` + `.test.tsx` — the real Calendar
  Protection UI (directive §2).

**Modified files:**
- `nova-calendar-protection-service.ts` — concurrency/replay hardening:
  real Firestore transactions for the approved→executing and
  confirmed→undoing transitions, approval expiry, a capped retry count, a
  new `ambiguous` outcome for connector throws, `externalEventId`-gated
  undo, offset-qualified ISO time validation (directive §4).
- `server.ts` — the new `allowCalendarActions` GET/POST routes, the
  authoritative execute-time re-check, invalid-time-range 400 handling,
  two new read-only history/status routes.
- `nova-take-the-load-connector-contract.ts` — the test-only fake
  connector's default success result now includes an `externalId`,
  matching a realistic connector response.
- `nova-take-the-load-types.ts` — `NovaConnectorOutcome` gained an
  optional `externalId` field (additive).
- `firestore.rules` — `allowCalendarActions`/`*GrantedAt`/`*WithdrawnAt`
  added to the existing `nova_permissions/current` field allowlist.
- `src/components/NheiBeforeWords.tsx` + `.test.tsx` — wired the new
  temporary-context function into the live 'decided' step.
- `src/components/NheiPhase5Preview.tsx` — added the Take the Load
  section, wired Invisible Load's "Get help with this" into it.
- `nova-calendar-protection-service.test.ts`,
  `nova-calendar-protection-route.test.ts` — expanded for the hardening
  above and the new permission routes.
- `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`,
  `docs/NHEI_ARCHITECTURE.md`, `docs/NHEI_RELEASE_BLOCKERS.md` — see
  section 12.

## 3. The completed, integrated UI flow (directive §2)

`src/components/NovaTakeTheLoad.tsx` is the first screen in this codebase
that lets a person actually walk the full Calendar Protection journey
against real server routes:

1. View and toggle the `allowCalendarActions` permission.
2. Enter a title and a start/end time, and prepare a proposal
   (`POST /propose` — real 400 on an invalid time range, real 403 if
   either `allowCalendarSignals` or `allowCalendarActions` is missing).
3. Show it for approval (`POST /present`).
4. Approve or decline, tied to the server-computed fingerprint
   (`POST /approve` — a tampered or stale fingerprint is rejected with a
   clear message, never silently honoured).
5. Attempt to apply it (`POST /execute`) — and see the HONEST result:
   `execution_disabled` (always, today), `approval_expired`,
   `calendar_action_permission_required`, `failed` (with a retry
   option), or `ambiguous` (explicitly not auto-retried).
6. Undo a confirmed proposal, or view history
   (`GET /history`, `GET /:proposalId`).

Every state is labelled with whether it is "not yet done" or actually
applied — the suggested-vs-executed distinction directive §9 asked to be
unmistakable. No state in this component is simulated; every button maps
to one real `secureApiFetch` call.

## 4. Server-side action authorisation findings (directive §3)

- **Finding, confirmed and then closed**: `allowCalendarSignals` (a
  read-only consent flag) was the only permission the Phase 5C `propose`
  route checked — "do not assume that read consent also authorises
  writes" was not yet honoured. A new, separate, fail-closed
  `allowCalendarActions` permission now gates `propose`, and is
  re-checked AGAIN, authoritatively, at `execute` time — a grant that
  existed when the proposal was prepared is not trusted to still hold by
  the time execution is attempted.
- **What IS checked at execute time today**: authenticated identity
  (`requireAuth`), the `allowCalendarActions` permission, the exact
  approved parameters (the SHA-256 fingerprint, checked at approval time
  and never re-opened), approval validity/expiry (15 minutes), and
  account/connector status in the only sense that exists (the hardcoded
  execution kill-switch).
- **What is NOT checked, and cannot be, honestly stated rather than
  faked**: "ownership of the connected calendar" and "provider-granted
  scopes." `server.ts`'s `OAUTH_PROVIDERS` has no Google Calendar entry —
  there is no server-side Google OAuth token or scope list anywhere in
  this codebase to check against. This was a real, previously-incorrect
  claim in `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` (it listed
  "Google Calendar" and "Gmail" as `OAUTH_PROVIDERS` members) — corrected
  this phase (section 11 below). No code in this batch pretends to
  verify either fact.

## 5. Concurrency and replay verification (directive §4)

- **Real Firestore transactions**, not application-level check-then-write,
  now claim the `approved → executing` and `confirmed → undoing`
  transitions, each with a fresh per-attempt id staged into the same
  write. A second concurrent caller's transaction re-reads the
  already-claimed state and gets `already_executing`/`already_undoing`
  instead of a second connector call. Fails closed with
  `transaction_support_required` if `db.runTransaction` is absent — the
  same discipline `nhei-persistence-service.ts` already established.
- **Idempotency-key collisions**: unchanged from Phase 5C, still correct
  — a repeated `propose` with the same key returns the same proposal.
- **Ambiguous outcomes**: a connector call that THROWS (e.g. a timeout)
  now moves the proposal to a new `ambiguous` state, distinct from a
  clean `failed` — `retryCalendarProtectionExecution` only accepts
  `failed`, so an ambiguous outcome is structurally unretryable; a
  second `execute` call against it reports `ambiguous` again without
  ever calling the connector.
- **Retry cap**: capped at 5 (`CALENDAR_PROTECTION_MAX_RETRIES`) —
  exceeding it throws a clear, named error rather than retrying forever.
- **Approval expiry**: 15 minutes (`CALENDAR_PROTECTION_APPROVAL_TTL_MS`)
  — executing against an expired approval reverts the proposal to
  `awaiting_approval` and returns `approval_expired`.
- **Undo-by-id**: `externalEventId` is populated only from a genuine
  `ok: true` connector outcome; undo refuses to proceed without one.
- **Timezone/DST correctness**: `validateCalendarChangeTimes` requires an
  explicit UTC/offset designator on both `startIso`/`endIso` (rejecting
  the bare-local-time shape that makes a DST fall-back transition
  genuinely ambiguous) and that `endIso` is strictly after `startIso` —
  enforced in the service (thrown, caught by the route as 400) and
  independently testable.
- **14 new service-level tests** (time validation, approval expiry,
  transaction-support-required, ambiguous outcomes, the retry cap, and
  undo's externalEventId requirement) plus **1 new route-level test**
  (the invalid-time-range 400) cover all of the above directly against
  the fake Firestore's real transaction serialization — see section 11.

## 6. Google Calendar connector readiness (directive §5)

- **Finding (re-confirmed this phase)**: `server.ts`'s `OAUTH_PROVIDERS`
  has exactly five entries — Slack, Jira, Asana, Calendly, Monday — each
  with a real stored, refreshable OAuth token. Google Calendar is NOT
  among them. The only Google Calendar connection in this codebase is
  the client-side Firebase popup flow (`signInWithCalendar`,
  `src/lib/auth.tsx`); its access token lives only in transient React
  state (`AuthContext.accessToken`) and is never seen by the server.
- **What was built regardless**: `nova-google-calendar-adapter.ts` — pure,
  tested functions (`buildGoogleCalendarEventInsertRequest`,
  `buildGoogleCalendarEventDeleteRequest`) that construct the exact
  request a real Google Calendar Events API call would need, plus
  `createGoogleCalendarAdapterStub`, a `NovaExternalConnector`
  implementation that is STRUCTURALLY incapable of a real network call
  (no `fetch`/`http` import anywhere in the file — proven by its own
  static audit test, not just by convention) rather than a flag someone
  could flip on. This file is never imported by `server.ts` or any
  `.tsx` component (also statically proven).
- **What real readiness would require, explicitly not attempted here**: a
  Google Calendar `OAUTH_PROVIDERS` entry (server-side refresh-token
  storage, mirroring Slack/Jira/Asana/Calendly/Monday), a decision on how
  the already-granted `calendar.events` write scope is surfaced to users
  as distinct from the existing read-only flow, and then, separately, a
  decision to flip `CALENDAR_PROTECTION_EXECUTION_ENABLED`.

## 7. Before Words temporary-context behaviour (directive §6)

- **Gap found**: `buildNovaIntakeSummaryFromBeforeWords` (Phase 5B) only
  ever produces a summary for `decision === 'retain_as_reflection_evidence'`
  — correctly, since it is the precursor to a permanent evidence write
  that doesn't exist yet. That left `proceed_without_retaining` — an
  equally real, equally common ending — with no handoff at all.
- **What was built**: `buildTemporaryNovaContextFromBeforeWords`
  (`nova-before-words-temporary-context.ts`) produces a
  `NovaTemporaryBeforeWordsContext` for EITHER ending. `persisted: false`
  is a literal on the returned object, not a flag — this file performs
  no Firestore write, no model call, and no logging of any kind. It is
  independent of, and does not replace, the still-unreachable retain
  path.
- **Wired live**: `NheiBeforeWords.tsx`'s 'decided' step now calls this
  function and shows a real, honest message — "available to Nova for
  this conversation only... not saved as a reflection" when there is
  content, or "nothing was shared" when the session was empty — rather
  than leaving the pathway as dead, unit-tested-only code.
- **No automatic longitudinal tracking, no unintended conversation
  logging, no hidden persistence** — verified by the file containing no
  Firestore/model-call imports at all (same audit style as the rest of
  this codebase's offline-contract files).

## 8. Invisible Load integration into the action journey (directive §7)

`NovaInvisibleLoad`'s "Get help with this" (`onRequestHelp`) now feeds a
single, explicitly-chosen item's own description into
`NovaTakeTheLoad`'s initial title, in `NheiPhase5Preview.tsx`. The user
still supplies the actual start/end time themselves — Invisible Load
items never carry a calendar time, so no time was invented on their
behalf. No bulk conversion, no automatic task creation, no hidden score
(unchanged from Phase 5C).

## 9. Privacy and retention findings (directive §9)

- **Audited**: whether `calendar_protection_proposals`/
  `calendar_protection_audit` need registering in
  `user-data-collections.ts` for GDPR export/erasure coverage.
- **Finding**: they do not. Both are written at
  `users/{uid}/calendar_protection_proposals/...` and
  `users/{uid}/calendar_protection_audit/...` — real Firestore
  SUBcollections of the user's own document, not top-level,
  userId-field-keyed collections (the shape that file's guardrail exists
  to catch, and the shape `anxiety_reset_events`/`audit_logs` were when
  they were previously found missing). `server.ts`'s
  `recursiveDelete(userRef)` (account deletion) and the export route's
  `listCollections()` walk both reach every subcollection dynamically, so
  this data is already covered by the existing whole-account mechanisms.
  No code change was needed, and no new per-feature deletion button
  exists — consistent with this codebase's own standing statement that
  **only whole-account deletion exists, not a granular one**, which this
  finding does not change.
- **The new `allowCalendarActions` permission** has its own
  grant/withdrawal timestamps (`allowCalendarActionsGrantedAt`/
  `allowCalendarActionsWithdrawnAt`), giving a real, visible record of
  when it last changed — the same "clear withdrawal mechanism" directive
  §3 asked for.

## 10. Synthetic end-to-end demonstration (directive §8)

`src/components/NheiPhase5Preview.tsx` (still the same offline,
unreachable-by-any-real-user harness from Phase 5/5B/5C) now composes:
Invisible Load → (optional) "get help with this" → Take the Load's full
real-route journey (section 3) → alongside the separately-demonstrated
Before Words temporary-context pathway (section 7) and the real NHEI
consent toggles. This is as close to a true integration demonstration as
the offline harness gets: every Take the Load and consent action in it
is a genuine `secureApiFetch` call against the real Express app (in
tests) or a real dev server (manually) — not a `setTimeout` simulation
like the older `NheiAgenticActionPreview.tsx`. No live NHEI interpretation
was made available to build this; the harness still imports zero `nhei-`
inference of any kind beyond the pure Before Words/consent data shapes it
already used in Phase 5C.

**Not attempted this phase**: a Firestore-emulator-backed version of this
journey (see section 11), and a true multi-scenario runthrough covering
every named failure mode in one connected session (refusal, correction,
duplicate execution, etc.) — those remain covered at the unit/route-test
level (section 11) but not as a single, continuous, manually-walked
demonstration.

## 11. All test results, and what could not be verified

- **TypeScript (`npx tsc --noEmit -p .`)**: clean, zero errors.
- **Lint** (`npm run lint`, which is `tsc --noEmit`): clean, same result.
- **Full Vitest suite** (`npx vitest run`): **314 test files, 4279 tests,
  all passing.**
- **Component suite** (`npm run test:components`): **6 test files, 31
  tests, all passing** (up from 5 files / 23 tests in Phase 5C — added
  `NovaTakeTheLoad.test.tsx` and 2 new `NheiBeforeWords.test.tsx` cases).
- **Firestore emulator**: NOT attempted this phase. The directive asked
  for this "if feasible" — it was not attempted given the scope of the
  rest of this batch, and this report says so rather than claiming
  coverage that does not exist. The fake-Firestore test double's real
  transaction-serialization behaviour (confirmed present and FIFO-queued
  before this phase's work began) was used instead for all concurrency
  tests in this batch; it is a credible stand-in for the specific race
  this phase closes, but it is not the real Admin SDK's optimistic-
  concurrency retry behaviour under genuine parallel load.
- **Browser-level (Playwright) UI tests**: NOT attempted. The jsdom
  component suite verifies real DOM state and interaction, not actual
  rendered geometry at any viewport width or real screen-reader
  behaviour — this is stated plainly in both
  `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`'s cross-cutting gap note
  and `docs/NHEI_RELEASE_BLOCKERS.md` item 22, corrected this phase (see
  section 12) rather than left to claim something no test here proves.
- **Meaningful discrepancy found and corrected (directive §1)**:
  `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` previously, incorrectly,
  listed "Google Calendar" and "Gmail" as `OAUTH_PROVIDERS` members. They
  are not, and never were — corrected in this phase's doc work (section
  12), with the real five providers named instead.

## 12. Documentation reconciliation (directive §12)

- `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`: workstreams B, C, E, L,
  O updated with Phase 5D's real additions; the `OAUTH_PROVIDERS`
  discrepancy above corrected with an explicit "CORRECTION" callout
  rather than a silent edit; the cross-cutting component-test note
  updated to 6 files/31 tests with the jsdom-is-not-WCAG caveat restated.
- `docs/NHEI_ARCHITECTURE.md`: new "Calendar Protection vertical slice
  (Phase 5D...)" section summarising the permission boundary, concurrency
  hardening, the honest Google Calendar limitation, the UI, and the
  Before Words temporary-context addition.
- `docs/NHEI_RELEASE_BLOCKERS.md`: item 20's importer count corrected to
  7 files; item 21 updated to distinguish the real-but-disabled Calendar
  Protection system from the fully-synthetic `NheiAgenticActionPreview`
  one, and to name the Google Calendar OAuth gap explicitly; item 22's
  previously-STALE "no jsdom harness" claim corrected to describe what
  the Phase 5C/5D component suite actually proves and does not prove; a
  new "Phase 5D findings" section records the `allowCalendarActions`
  addition and the export/erasure audit result.
- Confirmed, per directive §12's explicit checklist: NHEI consent routes
  exist in development (unchanged from 5C) and the consent UI remains
  unmounted from live navigation (now 7 offline `.tsx` files, not 6);
  a component-test foundation exists and was extended, not newly
  invented, this phase; calendar protection has real server workflow
  code but no real external execution (unchanged, now with a real UI in
  front of it); Before Words remains offline and its retain option is
  not operational (unchanged; the new temporary-context pathway is a
  separate, additional capability, not a change to that fact).

## 13. Remaining work across all 18 capabilities (directive §11)

No workstream outside E/L (Take the Load/Agentic Actions), B (Before
Words), C (Invisible Load), and O (Privacy/Consent) was touched this
phase — consistent with the directive's own instruction not to expand
into every provider integration. Restating what remains open, by
priority, without re-deriving the full register:

1. **A real connector for ANY category** — still the single largest gap
   in workstream E/L, and now the only thing standing between this
   phase's hardened, real server-side workflow and an actual external
   action. Requires, in order: a Google Calendar `OAUTH_PROVIDERS` entry
   (or a different category's connector entirely), a separate explicit
   decision to flip `CALENDAR_PROTECTION_EXECUTION_ENABLED`, and its own
   dedicated review — not assumed by anything built this phase.
2. **The retain path for Before Words / NHEI reflection_storage** — still
   blocked on the independent safeguarding system (unchanged from every
   prior phase's own honest statement).
3. **A dedicated coach-facing review surface** (workstream M) and
   **professional coaching handoffs** (workstream Q) — not started, not
   touched this phase, no new finding.
4. **Health/wearable integration** (workstream P) — not started.
5. **Browser-level (Playwright) and Firestore-emulator verification** for
   this phase's own new UI and concurrency logic — explicitly deferred
   this phase (section 11), not forgotten.
6. **Task deferral's own UI** for the generic Take the Load engine
   (distinct from the calendar-protection-specific one built this phase)
   — not started.

## 14. Release-readiness assessment

**Not ready for production release, and this phase does not change that
verdict — it only makes the one real agentic workflow more honestly
complete and more defensibly safe while it stays off.**

What IS now true, and credible, as of this commit:
- The Calendar Protection workflow has a real, usable UI in front of its
  real server routes for the first time, with concurrency and replay
  behaviour that would actually hold up if execution were ever turned
  on — not just a server-side API with no screen, and not just
  unit-tested logic with untested races.
- The permission model is now honest about the difference between
  reading a calendar and writing to one, closing a real gap this
  codebase's own Phase 5C work left open.
- A previously-incorrect architectural claim about this app's OAuth
  surface (`OAUTH_PROVIDERS` "including Google Calendar") has been found
  and corrected, rather than silently carried forward into a future
  phase's planning.
- Before Words now has a real, live, working session-only handoff for
  BOTH of its real endings, not just the one that happened to be built
  first.

What is still true, unchanged, and remains the actual release blocker:
real execution is, and remains, impossible from any route in this
codebase — `CALENDAR_PROTECTION_EXECUTION_ENABLED` is still hardcoded
`false`, `server.ts` still imports no connector of any kind, and the
Google Calendar adapter built this phase cannot make a real network call
even if someone tried to wire it in by mistake. Nothing in this phase
activates personal NHEI intelligence, bypasses safeguarding, or performs
any external write, autonomous message, or unapproved action. STOP after
Phase 5D, per the governing directive.
