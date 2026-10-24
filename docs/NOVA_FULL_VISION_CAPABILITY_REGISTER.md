# Nova full-vision capability register

Phase 5B directive: reconcile the codebase against Blaze Break's full Nova
vision (18 workstreams), not just the slice NHEI's own documents track.
This file is the current-state register for that wider view — it does
not replace `docs/NHEI_ARCHITECTURE.md`/`docs/NHEI_RELEASE_BLOCKERS.md`,
which remain the detailed record for NHEI specifically (workstream A
below points back to them rather than duplicating their content).

**Method.** Every entry below was produced by reading the actual source
(file paths named throughout), not by inferring capability from a
feature's name or from `docs/`-only prose. Where a design document exists
but no working code backs it, that is stated as SPECIFIED ONLY, not
BUILT. Where code exists but nothing live calls it, that is BUILT BUT
OFFLINE, not BUILT AND INTEGRATED.

**Classification key**, used consistently below:

- **BUILT AND INTEGRATED** — real code, reachable by a real user today.
- **BUILT BUT OFFLINE** — real, tested code; no live call site.
- **PARTIAL** — some of the workstream is BUILT AND INTEGRATED, some is
  missing, inconsistent, or only partially rolled out.
- **SPECIFIED ONLY** — a design/spec document exists; no working code.
- **NOT STARTED** — no code and no design document found.
- **BLOCKED** — code/design exists but is explicitly gated off pending a
  human decision (legal, clinical, safeguarding) outside engineering's
  own authority to resolve.

---

## A. NHEI Experience Intelligence — **PARTIAL**

Tracked in full detail in `docs/NHEI_ARCHITECTURE.md` and
`docs/NHEI_RELEASE_BLOCKERS.md` — this entry only cross-references them
rather than duplicating ~20 phases of detail.

- **Existing code**: `nhei-types.ts`, `nhei-knowledge-*.ts`,
  `nhei-context-integration.ts`, `nhei-temporal-engine.ts`,
  `nhei-adaptive-behaviour-engine.ts`, `nhei-recovery-bridge.ts`,
  `nhei-recovery-arbitration.ts`, `nhei-recovery-orchestration.ts`, and
  the Phase 5 UI preview files.
- **Current capabilities**: Educational Mode is partially wired (two
  governance gates, both default OFF) into `POST /api/nova/chat`.
  Personal Reflection/Longitudinal are specified and fully tested, never
  wired into any route.
- **Missing**: the independent safeguarding system (item 5 in
  `NHEI_RELEASE_BLOCKERS.md`), any NHEI consent-writing route (item 18 —
  but see workstream O below for a reusable existing pattern), real-model
  evaluation of the extraction/quarantine boundary.
- **Credentials/approval needed**: a Gemini credential for real-model
  evaluation; human review of all 13 knowledge entries; a safeguarding/
  clinical reviewer for items 5–6.
- **Verification status**: extensively unit/integration tested against
  fakes; zero real-model runs; no automated UI test exists (repo-wide
  gap, see workstream-independent note at the end of this file).
- **Next work**: unchanged from `NHEI_RELEASE_BLOCKERS.md`'s own list —
  this phase added no new NHEI-specific blockers beyond items 18–22
  (already recorded there from Phase 5).

## B. Before Words / Unspoken Experience — **BUILT BUT OFFLINE** (Phase 5E: the temporary context now reaches a real Nova chat turn, not just a preview message)

- **Existing code**: `nhei-before-words-contract.ts` (Phase 5),
  `src/components/NheiBeforeWords.tsx`, `nova-before-words-handoff-contract.ts`
  (Phase 5B, the retain-gated structured handoff), Phase 5D's
  `nova-before-words-temporary-context.ts`, and Phase 5E's addition to
  that same file (`formatTemporaryBeforeWordsContextForNova`) plus new
  props on `src/components/NovaChat.tsx` and a new
  `src/components/NovaAgenticJourney.tsx` sequencer.
- **Current capabilities**: free expression, four optional skippable
  prompts, additive corrections, two equally-presented endings. The
  Phase 5B handoff contract maps a `retain_as_reflection_evidence`
  decision to a plain `NovaIntakeSummary` (never a diagnosis) — `null`
  for `proceed_without_retaining`, by construction, since that function
  is specifically the precursor to a permanent `reflection_storage`
  write that doesn't exist yet.
- **Phase 5D addition (directive §6)**: `buildTemporaryNovaContextFromBeforeWords`
  produces a session-scoped `NovaTemporaryBeforeWordsContext` for EITHER
  ending (`persisted: false` is a literal, not a flag; no Firestore
  write, no model call, no logging) — but Phase 5D itself only ever
  displayed a static message ABOUT this pathway in the preview; nothing
  actually fed it into a live chat turn yet.
- **Phase 5E addition (directive §5, "Before Words must connect
  meaningfully to Nova's actual conversation system rather than stopping
  at an isolated preview")**: audited both real Nova conversation
  entry points (`/api/nova/chat` via `NovaChat.tsx`'s client-composed,
  per-request, never-persisted `systemInstruction`; `/api/nova/live` via
  `useNovaLiveVoice.ts`'s caller-supplied `buildInitialPrompt`) and found
  `NovaChat.tsx`'s channel already sanctioned and reusable without new
  storage or an extra model call. `formatTemporaryBeforeWordsContextForNova`
  formats the context into a bounded (≤1,200 char), plainly-worded
  addendum with an explicit "temporary, not saved, not a diagnosis"
  framing sentence; `NovaChat.tsx` takes two new optional props
  (`temporaryBeforeWordsContext`, `onTemporaryBeforeWordsContextConsumed`)
  that fold it into exactly one outgoing `fullSystemInstruction`, then
  the caller clears it. `NovaAgenticJourney.tsx` wires
  `NheiBeforeWords`'s new `onDecided` callback straight into a genuinely
  mounted `NovaChat` instance — a real `/api/nova/chat` POST now carries
  what the person just said, for that one reply, in the SAME offline
  preview harness (not yet App.tsx's live navigation). The voice path
  (`buildInitialPrompt`) was reviewed and needs no component change — it
  is already a caller-supplied function a future live integration could
  pass the same formatted string into.
- **Missing**: the live UI still never actually exposes
  `decideRetainAsReflectionEvidence` — correctly, since no real
  `reflection_storage` write exists to receive it yet. The voice path's
  own equivalent handoff remains unexercised (reviewed, not wired) since
  Nova Live voice itself is not reachable from this same offline harness.
- **Working integrations**: none persistent — the Phase 5E wiring adds a
  REAL network call (`/api/nova/chat`) where Phase 5D had none, but still
  zero Firestore writes and zero new model calls beyond the one the user
  already triggers by sending a chat message.
- **Credentials/approval needed**: none to keep it offline; a real
  `reflection_storage` write path (same gap as NHEI generally) before the
  retain ending could ever be real; activating this handoff for a real
  user still depends on the same independent safeguarding review every
  other NHEI-adjacent capability in this register is gated behind.
- **Safeguarding/privacy dependencies**: same as NHEI Personal Reflection
  Mode generally (items 5, 7).
- **Required UX**: already built to directive spec (uncertainty, skip,
  correct, no forced labels); Phase 5E's `NovaAgenticJourney.tsx` adds an
  explicit "Understanding" journey-stage label covering this step.
- **Verification status**: unit tested (15 tests across the original two
  contract files, +6 for the Phase 5D temporary-context module, +5 for
  Phase 5E's `formatTemporaryBeforeWordsContextForNova`); +6 component
  tests for `NheiBeforeWords.tsx`; Phase 5E's `NovaChat`/journey wiring
  is exercised by the real-browser Playwright suite (directive §8:
  `tests/e2e/nhei-phase5-journey.spec.ts`), not a new unit-test file,
  since the thing being proven — a real page, in a real browser, actually
  sending the real request — is exactly what that suite is for.
- **Next work**: nothing further this phase for the retain path —
  correctly stopped short of building a consent-writing route for it; a
  future phase could extend the same formatted-addendum approach to the
  voice path once Nova Live itself has a live, reachable entry point.

## C. Invisible Load Intelligence — **BUILT BUT OFFLINE** (Phase 5C: now has a real UI and a Take the Load bridge; Phase 5F Agentic Expansion: now offers five explicit help choices per item, routing to both real Take the Load categories)

- **Existing code before Phase 5B**: none. A repo-wide, case-insensitive
  search found only a single colloquial phrase in `RecoveryPlan.tsx`
  ("naming the invisible load, not carrying it silently") — prose, not a
  data model.
- **Existing code now**: `nova-invisible-load-contract.ts` (Phase 5B;
  Phase 5C added `deferred`/`deferInvisibleLoadItem`/
  `undeferInvisibleLoadItem`), `src/components/NovaInvisibleLoad.tsx`
  (Phase 5C, mobile-first: stacked layout, full-width 44px-minimum
  touch-target buttons, no hover-only affordance), and
  `nova-invisible-load-take-the-load-bridge.ts` (Phase 5C) — a
  single-item-only function connecting one explicitly-chosen item to a
  Take the Load problem, refusing a deferred item outright.
- **Missing**: any connection to NHEI/Recovery Intelligence as context
  (deliberately not built — see architectural separation note), any
  persistence (component state is session-only, by design).
- **Credentials/approval needed**: none.
- **Safeguarding/privacy dependencies**: none — the contract file has
  zero import statements; no hidden score field exists on
  `NovaInvisibleLoadItem` (checked structurally by key enumeration, not
  text search); the bridge never acts on more than one explicitly-chosen
  item at a time ("do not turn every obligation into a task
  automatically").
- **Required UX**: built this phase — add/correct/remove/defer/opt-out,
  a per-item "get help with this" action, real `<textarea>`/`<select>`/
  `<input>` elements with `aria-label`s.
- **Phase 5D addition (directive §7)**: "get help with this" is now
  wired, in the offline preview harness, into `NovaTakeTheLoad.tsx`'s
  initial title (`NheiPhase5Preview.tsx`) — a single, explicitly-chosen
  item's own description pre-fills the calendar-protection proposal
  title; the user still supplies the actual start/end time themselves,
  since Invisible Load items never carry a calendar time. Still no bulk
  action and no automatic task conversion.
- **Verification status**: unit tested (18 tests across the contract and
  bridge files) + 6 real rendered-DOM component tests (`@testing-library/
  react`, see workstream-independent note on the new component-test
  foundation).
- **Phase 5F Agentic Expansion addition (directive §3)**: "Get help with
  this" is no longer a single bridge call — it opens an explicit,
  per-item menu of five choices (`nova-invisible-load-help-contract.ts`):
  protect time (routes to the real Calendar Protection UI, unchanged from
  Phase 5D), defer or reprioritise (routes to the new real Task Deferral
  UI — see workstream E), break it into steps (a new additive
  `breakdownSteps: string[]` field on `NovaInvisibleLoadItem`, the user's
  own words only, never generated), explore a recovery tool (a fixed,
  honestly-scoped, per-category suggestion naming a real existing tool —
  deliberately NOT a `selectRoute`/`compareCandidates` call, since this
  item has no honest way to supply the signal-derived fields that engine
  requires — see that file's own header), or leave unchanged (no
  callback fires at all). Deferred items are refused every choice except
  leave-unchanged — "not now" still means not now. 9 new unit tests +
  9 new/updated component tests.
- **Next work**: a deliberate decision about whether/how it should ever
  feed Recovery Intelligence as context — never as a hidden score.

## D. Recovery Friction and Recovery Environment — **NOT STARTED** (as named concepts; adjacent features exist under other names)

- **Existing code under other names**: Recovery Debt (`DebtTracker.tsx`,
  real sleep/mental/social data model), Friction Finder (Action Engine
  PR8, formerly "Resentment Tracker"), Workload Reality Check. These are
  real, live, built-and-integrated features that cover overlapping
  ground but were never named "Recovery Friction" or "Recovery
  Environment" and don't share a single data model.
- **Missing**: a named "Recovery Environment" concept (e.g. modelling the
  physical/social/organisational conditions around a person's recovery)
  does not exist anywhere in this codebase.
- **Credentials/approval needed**: a product decision on whether this
  workstream should be a new, unifying concept over the existing
  Debt/Friction Finder/Workload features, or a separate thing — this
  register does not make that call.
- **Next work**: none this phase — out of scope once named-concept absence
  was confirmed; a future phase should decide reconciliation vs. a new
  build before writing any code here.

## E. Nova — Take the Load — **BUILT BUT OFFLINE** (Phase 5C added a complete, real calendar-protection route; Phase 5D added a real UI for it; Phase 5E added a real, still-disabled connector — see workstream L; Phase 5F Agentic Expansion gave `task_deferral` its own complete, real, dedicated workflow — this entry's own long-standing "next work" item)

- **Existing code before Phase 5B**: none.
- **Phase 5B**: `nova-take-the-load-types.ts`,
  `nova-take-the-load-connector-contract.ts`,
  `nova-take-the-load-engine.ts` — the generic orchestration layer
  (identify/prepare/approve/execute/confirm/fail/retry/undo) for two
  synthetic categories (calendar protection, task deferral), reusing the
  real `isEffortWithinBandwidth` for capacity fit, with zero `nhei-`
  imports.
- **Phase 5C**: `nova-calendar-protection-service.ts` applies this same
  discipline to calendar protection SPECIFICALLY, as a real, persisted,
  server-authorised workflow — see workstream L below for the full
  account (server routes, fingerprint-based approval, idempotency,
  replay protection, audit log). `CALENDAR_PROTECTION_EXECUTION_ENABLED`
  is a separate, hardcoded `false` kill-switch in this new file,
  independent of (in addition to) the generic engine's own lack of a
  real connector.
- **Missing (updated Phase 5E)**: a real connector now exists for the
  calendar-specific service specifically (`nova-google-calendar-connector.ts`
  — see workstream L for the full account) — but the GENERIC engine
  (`nova-take-the-load-engine.ts`, `task_deferral`) still has none; its
  only `NovaExternalConnector` is still `createFakeConnectorForTesting`
  — test-only, statically guarded against being imported from `server.ts`
  or any `.tsx` file (a separate, dedicated guard test for each
  connector-adjacent file added across Phase 5B/5C/5D/5E).
- **Working integrations reviewed before building this**: Boundary
  Autopilot (workstream G) already sends real Slack messages/DND/status
  today, still not reused here — a deliberately separate connector per
  category, not a shared one. The real, already-granted `calendar.events`
  OAuth write scope (`signInWithGoogleCalendar`, `src/lib/auth.tsx`,
  Phase 5C finding) remains untouched — Phase 5E's `google_calendar_actions`
  is a GENUINELY separate, server-side OAuth provider/token from that
  client-side-only one, never a reuse of it (the directive's own
  explicit instruction: "do not assume that previously granted
  client-side scopes are sufficient").
- **Credentials/approval needed**: for calendar protection specifically,
  only founder/Google-Cloud-Console configuration remains (see workstream
  L) — the connector and server-side OAuth infrastructure are both
  implemented and tested; turning on real execution is still a separate,
  later, explicitly-approved decision this phase deliberately does not
  take. The generic engine's other category (task_deferral) still needs
  its own connector entirely, unaffected by this phase.
- **Safeguarding/privacy dependencies**: none for the engine itself
  (structurally independent of NHEI consent); the calendar-specific
  service additionally requires `allowCalendarSignals` consent before a
  proposal can even be prepared (Phase 5C).
- **Required UX**: not built for the generic engine (API/service only -
  still no UI for task_deferral or the generic engine directly). Phase
  5D built the real screen for the calendar-protection routes
  specifically — see workstream L for the full account
  (`NovaTakeTheLoad.tsx`).
- **Verification status**: Phase 5B: 21 unit tests (engine + connector
  contract). Phase 5C: 20 service-level tests + 8 route-level tests
  (supertest against the real Express app) + 4 static no-real-execution
  guard tests + 12 combined-journey tests. Phase 5D: +11 more
  service-level hardening tests (expiry, ambiguity, transaction-required,
  retry cap, undo-requires-externalEventId), +9 route-level tests for the
  new permission/history routes, +6 component tests for the new UI, +11
  tests for the Google Calendar adapter stub. Phase 5E: +6 more
  service-level tests for `reconcileStuckExecutingCalendarProtectionProposal`,
  +42 tests for the real connector (fake-transport unit tests AND a real
  local-HTTP-server integration test), +1 new static audit test, +9
  real Firestore EMULATOR integration tests (directive §7 — concurrent
  approvals/execution claims, idempotency, account isolation, expiry,
  stuck-execution recovery, audit consistency, export/deletion
  coverage — against the actual Firebase Admin SDK and emulator
  transaction semantics, not only the in-memory fake), +13 real-browser
  Playwright scenarios (directive §8, ×2 viewports) covering the
  suggested-vs-executed distinction, permission denial, and failed/
  ambiguous connector responses specifically for this workflow — all
  still against the fake connector, a fake/emulated Firestore, mocked
  provider responses, or with execution disabled; no real-world
  execution has ever occurred.
- **Phase 5F Agentic Expansion addition (directive §2)**: `task_deferral`
  now has its own complete, dedicated, real workflow —
  `nova-task-deferral-types.ts`/`-service.ts`/`-connector-contract.ts`,
  nine real `server.ts` routes (`POST /api/nova/task-deferral/identify`,
  `:id/clarify-control`, `:id/prepare`, `:id/present`, `:id/approve`,
  `:id/execute`, `:id/retry`, `:id/outcome`, `GET .../history`,
  `GET .../:id`), and a real UI (`src/components/NovaTaskDeferral.tsx`).
  Built on the SAME production-grade pattern as Calendar Protection
  (idempotent preparation, a fingerprint-bound approval gate, a
  Firestore-transaction-claimed execute step, capped retries, an
  append-only audit trail) — not the generic offline engine, and not a
  fourth near-duplicate state machine (an independent audit before
  writing this found three already-existing ones and recommended
  consolidating; this reuses the Calendar Protection template instead of
  adding a fourth). Two deliberate differences from Calendar Protection,
  both explained in the service file's own header: no `ambiguous`/
  reconciliation states (the connector is permanently mock-only per the
  directive, so a thrown call is this codebase's own code failing, not a
  real system's unknown outcome — recorded directly as `failed`), and a
  new `requires_other_person` terminal state reachable the moment the
  user answers "no" or "unsure" to either "do you control the deadline?"
  or "do you own this alone?" — structurally no function in the service
  can move a proposal out of that state, so no execution is ever reachable
  for a task the user doesn't control. 39 new unit/route tests +
  1 static audit test (no Asana/Monday/Jira SDK or raw network import
  anywhere in the three Task Deferral files).
- **Next work**: as a separate, later, explicitly-approved decision —
  flipping `CALENDAR_PROTECTION_EXECUTION_ENABLED` and wiring the now-real
  connector into `server.ts` (see workstream L). Task Deferral's own
  connector remains permanently mock-only per this phase's own directive,
  not a gap — a future phase would need its own separate, explicitly
  authorised review before any real Asana/Monday/Jira write capability is
  added, the same bar Calendar Protection's real connector went through.

## F. Calendar Protection and Workload Coordination — **BUILT AND INTEGRATED** (read-only)

- **Existing code**: `calendar-workload-defence-engine.ts`,
  `src/lib/calendar-signals.ts`, `server.ts`'s
  `POST/GET /api/signals/calendar` (~line 5712),
  `CalendarDefenseView.tsx`, `WorkloadRealityCheck.tsx`.
- **Current capabilities**: the browser calls the user's own Google
  Calendar API directly with their own OAuth token, computes a 7-day
  aggregate (meeting/back-to-back/evening/weekend counts, total hours —
  no event titles/times leave the browser), persisted server-side behind
  a 14-day-freshness consent gate (`allowCalendarSignals`).
- **Missing**: any write-back capability — no event creation, deletion,
  or modification exists anywhere in this codebase for calendar data.
- **Working integrations**: real Google OAuth, real API reads.
- **Credentials/approval needed**: none further for the read path (already
  live); a real write path would need its own, separate OAuth scope
  escalation and explicit approval — not attempted this phase.
- **Next work**: none identified this phase; this workstream is mature.

## G. Boundary Message and Communication Assistance — **BUILT AND INTEGRATED**

- **Existing code**: `BoundaryRehearsal.tsx`/Boundary Compiler (draft/copy
  generation only, no send path), and — the more significant finding —
  **Boundary Autopilot**, a real, live, user-authorised external-action
  system: `server.ts` (~line 6010 onward) routes
  `/api/boundary-autopilot/slack/{users,send,dnd,status}`,
  `/log-calendar-decline`, `/history`, using the user's own Slack OAuth
  token (real connect/callback flow, ~line 339), every send server-side
  audit-logged. `DigitalBoundaryShield.tsx` is the UI.
- **Current capabilities**: sends a real Slack message, sets real Slack
  DND, sets real Slack status — the most mature real external-action
  precedent in this codebase.
- **Missing**: no other provider (email/SMS) has a send capability; no
  calendar write capability (see F).
- **Credentials/approval needed**: none further — already live and
  already reviewed (its own PR series, Capacity Firewall PR4).
- **Relationship to workstream E**: Nova Take the Load deliberately does
  NOT reuse this connector — a future phase that wants calendar/task
  execution would need its own, separately-reviewed connector, following
  this workstream's audit-logging discipline as a model, not by
  importing its code.
- **Next work**: none identified this phase for this workstream itself.

## H. Energy Delta and Recovery Capacity Adaptation — **BUILT AND INTEGRATED**

- **Existing code**: `EnergyBudget.tsx`, `recovery-capacity-gate.ts`, and
  (Phase 4B) its registration into `recovery-signal-candidates.ts`'s
  `MODULE_ROUTE_MAP` and `recovery-decision-copy.ts`.
- **Current capabilities**: a real, live, Firestore-backed capacity
  tool, reachable both as its own tab and (since Phase 4B) as a Recovery
  Routing destination; Phase 5 added scroll-to-anchor navigation
  (`nhei-recovery-navigation.ts`) so a recommendation lands on the
  specific tool, not just the broader tab.
- **Missing**: nothing identified this phase.
- **Next work**: none.

## I. My Support Circle, Recovery Ally and Guardian Relay — **BUILT AND INTEGRATED** (Tier 3 explicitly **BLOCKED**)

- **Existing code**: `src/components/MySupportCircle.tsx`,
  `RecoveryAlly.tsx`, `NovaGuardianRelay.tsx`, `AllyNudgeScheduler.tsx`,
  `support-capsules.ts`, `recovery-ally-consent.ts`,
  `ally-nudge-quiet-hours.ts`, `guardian-alert.ts`; real mounted routes
  (`/api/support/request`, `/api/guardian/*`, `/api/ally/*`).
- **Current capabilities**: per-category, time-boxed Support Capsules;
  Guardian Relay Tier 1 (one-tap, user-initiated SMS to a trusted
  contact) is live; Preview Their View, Privacy Receipts, Scheduled
  Check-Ins with quiet hours.
- **Missing/BLOCKED**: Tier 3 (unattended, scheduled/cron-driven Guardian
  messaging) exists only as a hardcoded-OFF kill-switch
  (`nudgeSchedulerIsEnabled`); `docs/GUARDIAN_SUPPORT_SPEC.md` itself
  marks it "research only, do not build... permanently out of scope"
  pending clinical/safeguarding/legal review — an explicit, pre-existing
  BLOCKED item this phase did not touch or relitigate.
- **Cross-boundary check (directive §6's specific concern)**: confirmed
  this phase, by static test
  (`nova-support-circle-no-auto-contact-audit.test.ts`, 61 assertions),
  that no Guardian/Ally/Support file imports anything under the `nhei-`
  prefix and no `nhei-` file imports any Guardian/Ally/Support file, in
  either direction. **No automatic outbound contact based on an NHEI
  interpretation is possible today, structurally, not just by
  convention.**
- **Next work**: none needed this phase (directive §6 asked to "prepare
  integration contracts only where existing capabilities are
  incomplete" — none were found incomplete beyond the already-recorded,
  deliberately-blocked Tier 3).

## J. Care Navigation and Verified Support Directory — **BUILT AND INTEGRATED** (verification is honestly outsourced)

- **Existing code**: `crisis-region.ts`, `CrisisSupport.tsx`.
- **Current capabilities**: every region's crisis numbers always render
  regardless of a region guess (a wrong guess only reorders, never
  hides); a global directory block links to findahelpline.com (an
  external, 175+-country aggregator) rather than hardcoding numbers this
  codebase "has no way to keep current or verify," per its own comment.
- **Missing**: no admin-curated/verified directory data model exists —
  verification is entirely external.
- **Credentials/approval needed**: none for current behaviour; a
  first-party curated directory would need an ongoing
  verification/maintenance process, not just code.
- **Next work**: none identified this phase.

## K. Voice-First and Multimodal Nova — **BUILT AND INTEGRATED**

- **Existing code**: `src/lib/useNovaLiveVoice.ts`, server's
  `/api/nova/live` handler.
- **Current capabilities**: real AudioWorklet capture, real streamed
  playback, real barge-in, live transcript, a real WebSocket to a live
  Gemini model — used by three live surfaces (full-screen call, NovaChat
  inline toggle, OmniNova copilot).
- **Missing**: nothing identified this phase.
- **Next work**: none.

## L. Proactive Assistance and Authorised Agentic Actions — **PARTIAL** (Phase 5C: a complete, real, server-authorised workflow now exists for one category; Phase 5D: real UI, a separate action-permission boundary, and concurrency hardening; Phase 5E: the Google Calendar OAuth gap this entry has flagged since Phase 5C/5D is now closed, and a real connector exists behind the still-disabled execution boundary — still never executes for real)

- **Existing code**: `nhei-agentic-action-contract.ts` +
  `NheiAgenticActionPreview.tsx` (Phase 5, offline/synthetic),
  `nova-take-the-load-*` (Phase 5B, offline/synthetic), a real OAuth
  integration system in `server.ts` (`OAUTH_PROVIDERS` — Slack, Jira,
  Asana, Calendly, Monday, each with real `clientIdEnv`/`clientSecretEnv`/
  `tokenUrl`/refresh-token extraction — with working connect/callback/
  status/disconnect routes and real token storage), and — Phase 5C's main
  deliverable — `nova-calendar-protection-service.ts` plus six real
  server routes (`POST /api/nova/calendar-protection/
  propose|:id/present|:id/approve|:id/execute|:id/retry|:id/undo`), plus
  — Phase 5D's additions — two read-only history/status routes, a
  separate `allowCalendarActions` permission boundary (its own two
  routes), real Firestore-transaction concurrency hardening, and a
  structurally-inert Google Calendar adapter stub.
- **CORRECTION (Phase 5D, directive §1 — "identify meaningful
  discrepancies between reports and implementation")**: the Phase 5C
  version of this entry (and workstream L generally) previously listed
  **"Google Calendar"** and **"Gmail"** as members of `OAUTH_PROVIDERS`.
  That was never accurate — re-reading `server.ts`'s actual
  `OAUTH_PROVIDERS` object (confirmed again this phase) shows exactly
  five entries: Slack, Jira, Asana, Calendly, Monday. **There is no
  server-side OAuth token storage, refresh mechanism, or `OAUTH_PROVIDERS`
  entry for Google Calendar anywhere in this codebase.** The only Google
  Calendar connection is the client-side Firebase popup flow
  (`signInWithCalendar`, `src/lib/auth.tsx`), whose access token lives
  only in transient React state (`AuthContext.accessToken`) — never
  persisted, never refreshed, never seen by the server. (Gmail signals
  ARE real and server-reachable, but through a different mechanism —
  `POST /api/signals/gmail` takes a client-supplied unread/total count,
  not an OAuth-stored token — so it was never an `OAUTH_PROVIDERS` member
  either; the prior text's listing of it there was also incorrect.)
- **Current capabilities (Phase 5C addition)**: a real, persisted,
  idempotent prepare → present → approve → execute → retry/undo
  workflow. `propose` requires real `allowCalendarSignals` consent
  (server-verified, 403 otherwise) and persists a specific proposal
  (exact start/end/title) keyed by a caller-supplied idempotency key —
  a repeated propose with the same key returns the SAME proposal, never
  a duplicate. `approve` requires the exact SHA-256 fingerprint the
  server computed when the proposal was prepared — a bare
  `{approved: true}` is rejected by the request schema itself (the field
  is required, not optional), and a fingerprint that doesn't match the
  stored proposal is rejected with 409, never partially honoured. Every
  transition writes a real audit-log entry
  (`users/{uid}/calendar_protection_audit`).
- **Execution is categorically disabled**: `execute` always passes
  `null` for the connector — `server.ts` imports no connector, real or
  fake, of any kind for this workflow. `CALENDAR_PROTECTION_EXECUTION_ENABLED`
  is a hardcoded `false` constant in `nova-calendar-protection-service.ts`,
  checked before the connector parameter is ever used; only this file's
  own test suite can force it on, via a loudly-named, statically-guarded
  `TEST_ONLY_FORCE_EXECUTION_ENABLED` symbol. A duplicate execute call
  for an already-`confirmed`/`failed` proposal returns the stored result
  without ever calling a connector again (idempotent, replay-safe).
- **Missing**: zero write/send capability for Asana, Monday, Calendly,
  Google Calendar, or Gmail today (read-only, confirmed again this
  phase); any real connector for calendar protection or any other
  category.
- **Phase 5D additions (directive §2/§3/§4/§5)**:
  - A real, mobile-first UI (`src/components/NovaTakeTheLoad.tsx`) wired
    to all six existing routes plus two new read-only ones
    (`GET /api/nova/calendar-protection/history`, `GET .../:proposalId`)
    — the first screen a person could actually use to walk the whole
    prepare→present→approve→execute/retry/undo journey. It makes the
    suggested-vs-executed distinction explicit at every state (directive
    §9's own phrase) and shows `execution_disabled`/`approval_expired`/
    `ambiguous`/permission-denied as their own explained states, never
    folded into a generic error.
  - A SEPARATE, fail-closed `allowCalendarActions` permission
    (`nova-calendar-action-permission.ts`), distinct from the read-only
    `allowCalendarSignals` — "do not assume that read consent also
    authorises writes" (directive §3). Checked by `server.ts` at
    `propose` time and again, authoritatively, at `execute` time; stored
    on the same `nova_permissions/current` document as every other
    permission flag, defaulting to `false` on a missing doc/field/error.
  - Real Firestore-transaction concurrency hardening in
    `nova-calendar-protection-service.ts`: the approved→executing and
    confirmed→undoing transitions are each claimed inside a real
    `db.runTransaction` with a fresh per-attempt id, closing the "two
    workers execute the same proposal" race (the loser gets
    `already_executing`/`already_undoing`, never a second connector
    call) — fails closed with `transaction_support_required` if no
    transaction support exists, the same discipline
    `nhei-persistence-service.ts` already uses elsewhere in this
    codebase.
  - A new `ambiguous` outcome for a connector call that THROWS rather
    than resolving (e.g. a timeout) — distinct from a clean `failed`, and
    structurally unretryable through `retryCalendarProtectionExecution`
    (which only accepts `failed`), so an unknown outcome is never
    silently retried.
  - Approval expiry (15 minutes): executing against a stale approval
    reverts the proposal to `awaiting_approval` instead of treating an
    old "yes" as still current.
  - A capped retry count (5) and an `externalEventId` field populated
    only from a genuine `ok: true` connector outcome — undo now refuses
    to proceed without one ("never promise an undo unless the actual
    connector can provide it," directive §4).
  - `nova-google-calendar-adapter.ts`: pure, tested request-construction
    functions for the real Google Calendar Events API insert/delete
    calls, plus a `NovaExternalConnector` implementation that is
    STRUCTURALLY incapable of a real network call (no `fetch`/`http`
    import anywhere in the file — confirmed by its own static audit
    test) rather than a flag-gated one, since (per the correction above)
    there is no server-side token to give it in the first place.
  - Directive §7: `NovaInvisibleLoad`'s "Get help with this" now feeds a
    single, explicitly-chosen item's description into
    `NovaTakeTheLoad`'s initial title (`NheiPhase5Preview.tsx`) — no bulk
    conversion, no automatic task creation, still no hidden score.
- **Phase 5E additions (directive §2/§3/§4)** — this closes the exact gap
  the Phase 5D correction above identified:
  - A real, server-side `google_calendar_actions` `OAUTH_PROVIDERS`
    entry (`server.ts`) — a GENUINELY separate provider/scope/token from
    the pre-existing client-side-only Google Calendar read connection
    (directive's own "distinguish calendar reading from event
    modification"), using the existing generic connect/callback/
    disconnect/status routes, extended with three new OPTIONAL hooks
    every other provider defaults away from: PKCE (S256
    code_challenge/code_verifier, server-only verifier storage at
    `users/{uid}/oauth_pkce/{service}`, one-shot read-then-delete),
    `fetchAccountIdentity` (records `connectedAccountEmail` on the
    redacted status doc only, never the token doc, never logged — the
    real "connected-calendar ownership check"), and `revoke` (calls
    Google's own revoke endpoint on disconnect, best-effort, never blocks
    the local disconnect). `getValidAccessToken` was also hardened
    codebase-wide: an `invalid_grant` refresh failure now disconnects the
    integration and returns `null`, instead of the previous behaviour of
    silently returning an already-expired token forever.
  - A real (not stub) connector, `nova-google-calendar-connector.ts`:
    dependency-injected HTTP transport (unit-tested with fake responses
    AND a real local `http.Server` integration test — genuine HTTP
    request/response handling, zero real network calls), genuine
    create/verify/search-by-tag/undo logic against the real Events API
    request/response shapes, 204/410 both treated as a successful undo
    (the end state is what matters), a 2xx response with no `id` field
    never claimed as success. Still STRUCTURALLY unreachable from
    production — confirmed, same as the Phase 5D stub it replaces, by
    its own static audit test (no `fetch`/`http`/`googleapis` import, and
    `server.ts`/every `.tsx` file confirmed to never import it).
  - Provider-level idempotency/reconciliation: every created event is
    tagged with `extendedProperties.private.novaProposalId`
    (`buildGoogleCalendarEventInsertRequest`'s new optional third
    parameter), and `findGoogleCalendarEventByProposalId` can search for
    it after the fact. Two new reconciliation functions in
    `nova-calendar-protection-service.ts` — `reconcileAmbiguousCalendarProtectionProposal`
    (for a connector call that threw) and
    `reconcileStuckExecutingCalendarProtectionProposal` (for the DIFFERENT
    failure the directive's own "process termination during execution"
    names — a worker that died after claiming `executing` but before
    ever finalising, which no existing retry path can reach, since a
    second `execute` call deliberately short-circuits to
    `already_executing` forever) — both only ever change state on a
    genuine search answer, never on an inconclusive one, and both are
    additive, never wired into any production route.
- **Credentials/approval needed**: the server-side OAuth infrastructure
  above is implemented and tested; what remains is entirely
  founder/Google-Cloud-Console work (documented in
  `docs/INTEGRATIONS_SETUP.md`'s new "Google Calendar Actions" section):
  enabling the Calendar API, configuring the OAuth consent screen, and —
  before this scope could ever be offered outside a small allow-listed
  test-user group — Google's own app-verification review for a sensitive
  write scope. No paid tier is required. A real connector per OTHER
  category (Asana, Monday, Calendly task-deferral) remains explicitly
  future work, unaffected by this phase.
- **Safeguarding/privacy dependencies**: "never allow NHEI interpretation
  alone to authorise an external action" is enforced structurally in all
  three agentic contracts (zero NHEI imports anywhere); the calendar
  service's own approval gate plus the `allowCalendarActions` permission
  are two independent authorisation layers on top of that; Phase 5E adds
  no new NHEI dependency anywhere in this chain.
- **Phase 5F Agentic Expansion addition (directive §5)**: a new, formal
  "possible suggestion" stage — `nova-proactive-assistance-contract.ts`'s
  `generateProactiveSuggestions` plus `POST /api/nova/proactive-
  suggestions` — sitting BEFORE the `prepared_for_review` stage every
  workflow above already implements. Pure, synchronous, deterministic:
  given a user-stated goal/voluntarily-shared obligation/capacity band/
  prior confirmed plan, it returns zero or more suggestions, each
  carrying a transparent `basedOn` list and a literal `stage:
  'possible_suggestion'` field it can never advance past itself. A
  `calendar_protection` suggestion is only ever returned when the server
  route has independently verified the real `allowCalendarActions` grant
  is current; a `task_deferral` suggestion only when a real, existing
  task-provider integration token (Asana/Monday/Jira) is found — neither
  is ever assumed. Turning a suggestion into a real stage-2 proposal is
  always a separate, explicit user action through the real Calendar
  Protection/Task Deferral UIs — this file has no function that calls
  either `prepare*` function for the caller, no scheduling/cron/queue,
  and zero `nhei-` imports. 16 new unit/route tests.
- **Phase 5G Experience Integration addition (directive §2)**: the
  possible-suggestion stage now has a real screen —
  `NovaProactiveSuggestions.tsx`, mounted as `NovaAgenticJourney.tsx`'s new
  `proactive_options` step. Each suggestion card renders all six
  explanatory fields the directive required (what, based-on, why it might
  help, whether permission/integration is required, what happens if the
  user proceeds, what Nova can't do yet) and offers accept/edit/dismiss —
  never an auto-advance. "Use this" hands the (possibly user-edited) text
  straight to the real Calendar Protection or Task Deferral screen via a
  plain callback prop; this file has zero internal approval/state-machine
  logic of its own, so no second approval engine was created.
- **Next work**: as a separate, later, explicitly-approved decision —
  flipping `CALENDAR_PROTECTION_EXECUTION_ENABLED` to `true` and wiring
  the real connector into `server.ts`, which this phase deliberately does
  not do. Also unstarted: the equivalent OAuth/connector work for
  task_deferral's own categories (deliberately out of scope — see
  workstream E).

## M. Personal Recovery Outcomes and Coaching Review — **PARTIAL**

- **Existing code**: Recovery Routing's outcome loop
  (`users/{uid}/recovery_routing_decisions`),
  `recovery-outcomes-intelligence.ts`
  (`docs/RECOVERY_OUTCOMES_INTELLIGENCE.md`).
- **Current capabilities**: real per-user outcome/helpfulness recording;
  real platform-wide aggregation gated by a statistical-reliability floor
  (`checkCohortSufficiency`, threshold 20).
- **Missing**: no dedicated human-coach review UI exists — this is a
  platform-intelligence feature, not a coaching-handoff tool (see Q).
- **Phase 5F Agentic Expansion addition (directive §7)**: a new, separate,
  deliberately simpler feedback contract for practical task assistance —
  `nova-task-assistance-outcome.ts`'s `recordTaskAssistanceOutcome`, wired
  to `POST /api/nova/task-deferral/:proposalId/outcome` and
  `NovaTaskDeferral.tsx`'s own post-confirmation prompt. NOT the same
  shape as the Recovery Routing outcome model above (`'declined'|
  'completed'|'abandoned'` + a helpfulness rating) — the directive's own
  four options ("this helped" / "I changed the plan" / "I didn't use it" /
  "I need another approach") have no equivalent in that model, so reusing
  its enum would have misrepresented what was actually being asked. Keeps
  the same discipline: no causal claim, an unrated proposal is never
  silently counted as helped, and declining/not-using is recorded as a
  plain fact, never surfaced as a trait of the user. One record per
  (workflow, itemId) — a resubmission replaces the prior answer. Covered
  by the Task Deferral route tests (workstream E).
- **Phase 5G Experience Integration addition (directive §8)**: the same
  contract is now also wired to Calendar Protection —
  `POST /api/nova/calendar-protection/:proposalId/outcome` and
  `NovaTakeTheLoad.tsx`'s own post-confirmation prompt, reachable only
  once `proposal.state === 'confirmed'` (a REAL applied action there,
  unlike Task Deferral's `confirmed`, which only ever means a simulation
  completed — see workstream E). `NovaTaskAssistanceWorkflow` widened to
  `'task_deferral' | 'calendar_protection'`, exactly the additive path
  this entry's own prior "next work" note anticipated. The journey's full
  state vocabulary (suggestion received / proposal prepared / proposal
  approved / simulation completed / real action completed / outcome
  confirmed by the user) was re-verified distinct and accurate across
  both workflows; no code anywhere infers wellbeing from an approval,
  simulation, or state transition alone.
- **Next work**: a coach-facing review surface, if this workstream is
  meant to include one — not built this phase (no request for it in
  directive §4's specific scope). Extending the outcome contract to a
  third practical-assistance workflow (e.g. an Invisible Load action) is
  additive, future work.

## N. Identity, Values and Purpose-Based Support — **BUILT AND INTEGRATED**

- **Existing code**: `action-engine.ts` (`PersonalChangeModelTraits`),
  `ChangeGraphChart.tsx`, `ActionEngine.tsx`, `rediscovery-engine.ts`/
  `rediscovery-service.ts`.
- **Current capabilities**: real, live, shipped features using
  behavioural/trait framing ("you tend to...") — confirmed non-clinical
  language, consistent with the rest of this codebase's discipline.
- **Missing**: nothing identified this phase.
- **Next work**: none.

## O. Privacy Vault, Consent, Trust Centre and Governance — **PARTIAL** (Phase 5C: real NHEI consent-writing routes now exist)

- **Existing code**: `PrivacyVault.tsx`, `TrustCentrePage.tsx`,
  `audit-logger.ts`, `RetentionSchedule.tsx`, real GDPR
  `/api/user/export`/`/api/user/delete-account`, Evolution Engine
  governance tiers, `/api/ally/view/:token/consent`, and — Phase 5C's
  addition — `GET`/`POST /api/nhei/consent`.
- **Phase 5B finding**: a general, working, NON-NHEI consent-writing
  pattern already existed and was directly reusable —
  `ConnectedNovaPermissions`
  (`src/components/ConnectedRecoveryModules.tsx:681`) renders ~20
  individually-labelled "Let Nova use my X" toggles backed by a real,
  rules-enforced, per-user Firestore permissions document the client
  reads/writes directly.
- **Phase 5C build**: real, server-side `GET`/`POST /api/nhei/consent`
  routes, following that same "one document, one boolean per purpose"
  pattern but server-authored (via the Admin SDK, `uid` from the
  verified token only, never the request body) rather than a direct
  client write — closing `docs/NHEI_RELEASE_BLOCKERS.md` item 18 for
  real. Each of the three purposes (`reflection_storage`,
  `longitudinal_tracking`, `routing_insights`) is set independently (the
  route never touches a second field); withdrawal (`granted: false`)
  only flips the flag, never deleting anything already persisted,
  reusing the already-existing, already-tested
  `setNheiConsent`/`withdrawNheiConsent`/`getNheiConsent`
  (`nhei-persistence-service.ts`) rather than writing new persistence
  logic. `src/components/NheiPrivacyConsent.tsx`'s three personal-purpose
  toggles are now wired to this real route (still an offline preview —
  not mounted into `App.tsx`'s live navigation).
- **This is consent bookkeeping only** — it activates no personal NHEI
  processing by itself. Personal Reflection/Longitudinal/Recovery
  Insights modes remain unwired into any conversation route, and the
  independent safeguarding system remains unbuilt, both completely
  unaffected by this addition.
- **Missing**: granular per-purpose NHEI data deletion (only whole-
  account deletion exists); any NHEI mode activation (unchanged,
  deliberately out of scope for this or any consent-writing work).
- **Credentials/approval needed**: none for the consent-writing route
  itself; NHEI mode activation remains gated on the independent
  safeguarding system and human review, unaffected by this change.
- **Phase 5D finding (directive §9)**: audited whether the new
  `calendar_protection_proposals`/`calendar_protection_audit` Firestore
  data (workstream L) needs its own export/erasure registration in
  `user-data-collections.ts`. It does not: both are written at
  `users/{uid}/calendar_protection_proposals/...` and
  `users/{uid}/calendar_protection_audit/...` — real SUBcollections of
  the user's own document, not top-level collections keyed by a
  `userId` field (the shape that file's guardrail exists to catch).
  `recursiveDelete(userRef)` and the export route's `listCollections()`
  walk (both in `server.ts`) reach every subcollection dynamically, so
  this data is already covered by the existing whole-account export and
  deletion — consistent with this entry's own existing statement that
  **only whole-account deletion exists**, not a granular, calendar-
  protection-specific one. No code change was needed; this is recorded
  here so the next person doesn't re-ask the same question.
- **Verification status**: 10 route-level tests (supertest against the
  real Express app) + 4 new rendered-DOM component tests covering the
  toggle, the write, and permission-denial (a rejected write). Phase 5D
  added 8 new route-level tests for the separate `allowCalendarActions`
  permission's own GET/POST routes plus 5 unit tests for its
  persistence functions (`nova-calendar-action-permission.ts`).

## P. Optional Health/Wearable Integration — **NOT STARTED**

- Repo-wide case-insensitive search (wearable, Apple Health, Fitbit,
  Oura, Garmin, HealthKit, heart rate, sleep tracking) found only
  unrelated false positives (e.g. "behavioural" substring-matching
  "oura"), verified by reading the actual lines. No device/wearable
  integration code, route, or UI exists anywhere.
- **Next work**: none this phase — would need a product decision on
  scope (which device platforms, what data) before any engineering.

## Q. Professional Coaching Handoffs — **NOT STARTED**

- Search for professional-coach/clinician-handoff/licensed-therapist/
  coaching-handoff phrasing found only two hits, both inside
  `nhei-real-model-adversarial-evaluation-runner.ts`/`.test.ts` —
  adversarial test fixtures checking Nova resists being manipulated into
  claiming clinical authority, not a real handoff feature. No referral
  mechanism, directory, or UI exists.
- **Next work**: none this phase — a real handoff feature would need
  professional/clinical input before any engineering, not an engineering
  default.

## R. Organisational Insights with strict individual-data privacy boundaries — **PARTIAL**

- **Existing code**: `anonymous-aggregation-engine.ts`
  (`checkCohortSufficiency`, `buildLockedAggregateResponse` — a
  k-anonymity gate against `org.privacyThreshold`), Work Design
  Intelligence/Pulse surfaces built on top of it.
- **Current capabilities**: the privacy-wall primitive is real, tested,
  and sound; `GET /api/org/:orgId/dashboard` is migrated onto it.
- **Missing**: the file's own header comment states only the clearest
  call site was migrated — roughly a dozen other org aggregate routes
  still use an older, duplicated inline pattern, "deliberately left as a
  follow-up." A second guard (filter-based re-identification protection)
  is built and unit-tested but has no real call site yet (no current UI
  applies multi-dimension filters that would need it).
- **Next work**: migrate the remaining aggregate routes onto the shared
  primitive — not attempted this phase (would be a large, separate
  refactor across many `server.ts` routes, out of this phase's scope).

---

## Architectural separation, re-confirmed this phase (directive §3)

- NHEI (`nhei-` prefix) performs structured, uncertainty-aware
  interpretation only — it has no outbound-action capability of any kind
  (confirmed: zero imports of Guardian/Support/connector code anywhere
  under the `nhei-` prefix).
- Agentic Nova (`nova-take-the-load-*`, this phase) prepares and executes
  permitted external actions — it has zero `nhei-` imports and its
  approval gate cannot be satisfied by any NHEI consent or interpretation
  value, only by `recordApprovalDecision`'s own explicit boolean.
- Recovery Intelligence (`nhei-recovery-bridge.ts`/`-arbitration.ts`/
  `-orchestration.ts`) selects and explains; it has no execution
  capability of its own — a selected suggestion is data a UI or (in a
  future phase) Take the Load would act on, never a command this layer
  runs itself.
- My Support Circle (workstream I) coordinates only explicitly
  user-initiated human contact — confirmed, by static test, to share no
  import-level connection with NHEI in either direction.
- Outcome Intelligence (workstream M) records and aggregates
  user-confirmed outcomes — it has no causal claim anywhere in its types
  (`causalClaim: false` is a hardcoded literal in
  `nhei-adaptive-behaviour-engine.ts`, reused by the outcomes layer's own
  discipline).

No feature in this register was placed inside the `nhei-` namespace
merely because it reads NHEI-adjacent context — `nova-invisible-load-
contract.ts`, `nova-before-words-handoff-contract.ts`, and the Take the
Load files are all named and scoped outside it for exactly this reason.

## Cross-cutting gap, independent of any single workstream

**Updated in Phase 5C, extended in Phase 5D.** A real component-test
foundation now exists — `vitest.components.config.ts`
(`environment: 'jsdom'`, `@testing-library/react`), run separately via
`npm run test:components` so the main suite's hundreds of
`environment: 'node'` tests are untouched. It now covers seven Phase 5/5F
Agentic Expansion components (`NheiPrivacyConsent`, `NheiBeforeWords`,
`NovaInvisibleLoad`, `NheiRecoverySuggestionCard`,
`NheiAgenticActionPreview`, `NovaTakeTheLoad`, and — Phase 5F Agentic
Expansion — the newly-added `NovaAgenticJourney`; `NovaInvisibleLoad`'s
own suite also grew from 6 to 11 tests for the new five-choice help menu
— 43 tests total, real rendered-DOM interaction via `userEvent`, not
markup inspection), not every `.tsx` file in this codebase.
`NovaTaskDeferral.tsx` has no dedicated component test yet — its real
behaviour is covered by the route-level tests in workstream E instead. The hundreds of pre-existing `.tsx` components across all 18
workstreams remain verified by code review and manual dev-server checks
only — this is a real, partially-closed gap, not a fully-closed one,
and no workstream above should be read as having automated UI coverage
unless its own entry says so explicitly. As in Phase 5C: **this jsdom
suite is not evidence of responsive mobile layout or WCAG conformance**
— it verifies real DOM state, labels and interaction, nothing about
actual rendered geometry or a screen reader's real behaviour. Phase 5D
attempted no browser-level (Playwright) pass for this UI; that remains
unattempted, not merely unclaimed.

## Phase 5F Agentic Expansion reconciliation (directive §8)

This phase's own scope: Task Deferral end to end (workstream E), Invisible
Load's five-choice help menu (workstream C), the unified
`NovaAgenticJourney` sequencer with direct-chat entry and back navigation
(workstream B/E — see that component's own header), a formal
possible-suggestion stage (workstream L), and a task-assistance outcome
contract (workstream M). It deliberately did not attempt every remaining
gap this register lists — per the directive's own "avoid building every
remaining feature in this batch."

**Recommended next workstream: F (Calendar Protection and Workload
Coordination) and L's own long-deferred execution decision, taken
together — NOT a new workstream.** Reasoning, by integration value and
actual missing capability rather than novelty:

- Workstream L (Proactive Assistance) has had a fully real, tested,
  server-authorised Calendar Protection workflow since Phase 5C, a real
  (if structurally unreachable) connector since Phase 5E, and the
  founder/Google-Cloud-Console prerequisites documented since Phase 5E —
  everything engineering can build without a human decision has now been
  built twice over (once for calendar protection, once for task deferral
  this phase). The single highest-leverage next step is not more
  engineering — it is the standing "separate, later, explicitly-approved
  decision" this register has deferred since Phase 5C: whether to flip
  `CALENDAR_PROTECTION_EXECUTION_ENABLED` for a real, allow-listed test
  cohort. Every workstream downstream of "Nova can actually do something,
  not just propose it" (L's own UI, the new possible-suggestion stage in
  L, Invisible Load's "protect time" choice in C) stays a complete,
  honestly-labelled simulation until that decision is made — this is
  integration value realised by a decision, not by more code.
- Failing that decision, the next-highest engineering-only value is
  surfacing workstream L's new possible-suggestion stage
  (`generateProactiveSuggestions`/`POST /api/nova/proactive-suggestions`)
  in `NovaAgenticJourney.tsx`'s own UI — the contract and route exist and
  are tested, but no screen calls the route yet, so today it is reachable
  only by a direct API call. This is a small, bounded addition (one new
  journey step, no new backend) that would make the "useful options"
  stage of the target journey (directive §4) genuinely end-to-end for the
  first time, rather than skipping straight from Invisible Load's
  explicit choices to a proposal.
- Workstreams D (Recovery Friction/Environment), P (wearables), and Q
  (coaching handoffs) remain NOT STARTED and are real gaps, but none of
  them integrates with anything this phase touched — building any of them
  now would not compound with Task Deferral/Invisible Load/the proactive-
  suggestion stage the way finishing L's own standing decision would.
