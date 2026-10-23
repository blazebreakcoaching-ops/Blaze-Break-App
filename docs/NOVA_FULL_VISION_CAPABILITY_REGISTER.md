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

## B. Before Words / Unspoken Experience — **BUILT BUT OFFLINE**

- **Existing code**: `nhei-before-words-contract.ts` (Phase 5),
  `src/components/NheiBeforeWords.tsx`, and this phase's
  `nova-before-words-handoff-contract.ts` (the structured handoff this
  directive asked for).
- **Current capabilities**: free expression, four optional skippable
  prompts, additive corrections, two equally-presented endings. The
  handoff contract maps a `retain_as_reflection_evidence` decision to a
  plain `NovaIntakeSummary` (never a diagnosis) — `null` for
  `proceed_without_retaining`, by construction.
- **Missing**: the live UI never actually exposes
  `decideRetainAsReflectionEvidence` (reviewed this phase, see workstream
  O and the architecture-doc fix below) — correctly, since no real
  `reflection_storage` write exists to receive it yet.
- **Working integrations**: none — zero import statements in either
  contract file.
- **Credentials/approval needed**: none to keep it offline; a real
  `reflection_storage` write path (same gap as NHEI generally) before the
  retain ending could ever be real.
- **Safeguarding/privacy dependencies**: same as NHEI Personal Reflection
  Mode generally (items 5, 7).
- **Required UX**: already built to directive spec (uncertainty, skip,
  correct, no forced labels).
- **Verification status**: unit tested (15 tests across the two contract
  files); no automated UI test (repo-wide gap).
- **Next work**: nothing further this phase — correctly stopped short of
  building a consent-writing route.

## C. Invisible Load Intelligence — **BUILT BUT OFFLINE** (Phase 5C: now has a real UI and a Take the Load bridge)

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
- **Verification status**: unit tested (18 tests across the contract and
  bridge files) + 6 real rendered-DOM component tests (`@testing-library/
  react`, see workstream-independent note on the new component-test
  foundation).
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

## E. Nova — Take the Load — **BUILT BUT OFFLINE** (Phase 5C added a complete, real calendar-protection route; still no real connector)

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
- **Missing**: any real connector implementation for either the generic
  engine or the calendar-specific service. The only `NovaExternalConnector`
  in this codebase is `createFakeConnectorForTesting` — test-only,
  statically guarded against being imported from `server.ts` or any
  `.tsx` file (two separate guard tests, one per phase).
- **Working integrations reviewed before building this**: none reused.
  Boundary Autopilot (workstream G) already sends real Slack
  messages/DND/status today; the real, already-granted
  `calendar.events` OAuth write scope (`signInWithGoogleCalendar`,
  `src/lib/auth.tsx`, Phase 5C finding) is likewise not touched — no
  write call to Google Calendar exists anywhere in this codebase.
- **Credentials/approval needed**: a real, authorised connector (a future
  phase's own decision, explicitly out of scope here) before any
  execution could touch a real calendar or task list.
- **Safeguarding/privacy dependencies**: none for the engine itself
  (structurally independent of NHEI consent); the calendar-specific
  service additionally requires `allowCalendarSignals` consent before a
  proposal can even be prepared (Phase 5C).
- **Required UX**: not built this phase for the generic engine (API/
  service only); no UI calls the new calendar-protection routes yet
  either — this phase delivered the server-side workflow, not a screen.
- **Verification status**: Phase 5B: 21 unit tests (engine + connector
  contract). Phase 5C: 20 service-level tests + 8 route-level tests
  (supertest against the real Express app) + 4 static no-real-execution
  guard tests + 12 combined-journey tests — all against the fake
  connector or with execution disabled; no real-world execution has ever
  occurred.
- **Next work**: a UI for the calendar-protection flow, and — as a
  separate, later, explicitly-approved decision — a real connector.

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

## L. Proactive Assistance and Authorised Agentic Actions — **PARTIAL** (Phase 5C: a complete, real, server-authorised workflow now exists for one category — still never executes for real)

- **Existing code**: `nhei-agentic-action-contract.ts` +
  `NheiAgenticActionPreview.tsx` (Phase 5, offline/synthetic),
  `nova-take-the-load-*` (Phase 5B, offline/synthetic), a real OAuth
  integration system in `server.ts` (`OAUTH_PROVIDERS` — Slack, Asana,
  Monday, Calendly, Google Calendar, Gmail — with working connect/
  callback/status/disconnect routes and real token storage), and —
  Phase 5C's main deliverable — `nova-calendar-protection-service.ts`
  plus six real server routes (`POST /api/nova/calendar-protection/
  propose|:id/present|:id/approve|:id/execute|:id/retry|:id/undo`).
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
  category; any UI for the new routes.
- **Phase 5C finding on real-world readiness**: `signInWithGoogleCalendar`
  (`src/lib/auth.tsx`) already requests the write-capable
  `calendar.events` OAuth scope at sign-in time for anyone who has ever
  connected their calendar through `CalendarDefenseView.tsx`/
  `MicroRecovery.tsx`/`IntegrationsDashboard.tsx` — the scope exists for
  many real accounts today, but no code anywhere uses it to write
  anything. A future, separately-approved connector could use this
  already-granted scope rather than requesting a new one — that
  decision is explicitly not made by this phase.
- **Credentials/approval needed**: a real, separately-authorised
  connector per category, explicitly future work.
- **Safeguarding/privacy dependencies**: "never allow NHEI interpretation
  alone to authorise an external action" is enforced structurally in all
  three agentic contracts (zero NHEI imports anywhere); the calendar
  service's own approval gate is a second, independent authorisation
  layer on top of that.
- **Next work**: a UI for the calendar-protection flow; then, as a
  separate, later, explicitly-approved decision, a real connector —
  most plausibly reusing the already-granted `calendar.events` scope.

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
- **Next work**: a coach-facing review surface, if this workstream is
  meant to include one — not built this phase (no request for it in
  directive §4's specific scope).

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
- **Verification status**: 10 route-level tests (supertest against the
  real Express app) + 4 new rendered-DOM component tests covering the
  toggle, the write, and permission-denial (a rejected write).

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

**Updated in Phase 5C.** A real component-test foundation now exists —
`vitest.components.config.ts` (`environment: 'jsdom'`, `@testing-library/
react`), run separately via `npm run test:components` so the main
suite's hundreds of `environment: 'node'` tests are untouched. It
currently covers five new Phase 5 components (`NheiPrivacyConsent`,
`NheiBeforeWords`, `NovaInvisibleLoad`, `NheiRecoverySuggestionCard`,
`NheiAgenticActionPreview` — 23 tests total, real rendered-DOM
interaction via `userEvent`, not markup inspection), not every `.tsx`
file in this codebase. The hundreds of pre-existing `.tsx` components
across all 18 workstreams remain verified by code review and manual
dev-server checks only — this is a real, partially-closed gap, not a
fully-closed one, and no workstream above should be read as having
automated UI coverage unless its own entry says so explicitly.
