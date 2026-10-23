# NHEI architecture — Nova Human Experience Intelligence

This is the map of what NHEI actually is today, in code, kept in version
control rather than only in a per-checkpoint delivery report (which is
how this document came to exist: Phase 3C Checkpoint 3 section 10 asked
for the agreed architecture and the release-blocker register to live
here, not only in the scratchpad reports handed over at each checkpoint).
Those per-checkpoint reports remain the detailed, point-in-time record of
*what changed and why* at each step; this file and
`docs/NHEI_RELEASE_BLOCKERS.md` are the maintained, current-state summary
that should be kept accurate as NHEI continues to change, the way
`docs/SECURITY_ARCHITECTURE.md`/`docs/OUTSTANDING_SECURITY_ITEMS.md`
already work for security.

**A note on scope and honesty, matching that same precedent.** This
describes what is actually built and tested in this codebase today. It
does not describe a shipped, customer-facing feature — as of this
writing, **no NHEI mode is enabled for any real user**, and nothing here
should be read as implying otherwise. Where this document names something
as "proposed" or "not yet built," that is a deliberate, load-bearing
distinction, not hedging.

## What NHEI is

A coaching-intelligence layer for Nova, structured around a fixed,
non-clinical taxonomy — never a diagnostic or psychological-surveillance
system. The taxonomy (`nhei-knowledge-types.ts`, `nhei-types.ts`):

- **Three Selves** (`SelfSystem`): Internal, Relational, Perceived-Received.
- **Four Dimensions** (`Dimension`): Metaphysical, Physical, Mental, Emotional.
- **Three Blaze Break frameworks**: SHIP (longer-term rebuild), BLAME
  (moment-to-moment stabiliser), R³ (planned educational content, not an
  executable module anywhere in this app).
- **Two supporting concepts**: Temporal Self Interaction (sequence ≠
  cause), Adaptive Behaviour (observed response patterns, never a
  verdict), and Context & Agency (environmental pressure/realistic
  choice, never a bandwidth score).

Three operating modes, each independently gated:

| Mode | Status | What it does |
|---|---|---|
| **Educational** | Partially wired, server-only flag + Firestore gate, both default OFF | Retrieves approved knowledge-library text relevant to the user's own chat message and splices it into Nova's prompt as quarantined reference material. No evidence extraction, no persistence, no consent required. |
| **Personal Reflection** | Specified, not wired | Would extract structured evidence from a conversation and let a user confirm/correct it. Requires the independent safeguarding system (see below) to exist first. |
| **Longitudinal** | Specified, not wired | Would fold prior sessions' evidence into a reflection. Requires its own, additional consent purpose and the dedicated read interface described below. |

## The pipeline (Educational Mode, the only live path)

```
POST /api/nova/chat (server.ts)
  → nheiEducationalModeIsEnabledNow()            [env var, Checkpoint 2 §2 — default OFF]
  → isNheiModeEnabledInGovernance(db, 'educational') [Firestore doc, Checkpoint 3 §2 — default OFF]
  → buildNheiEducationalChatAddendum(db, ageBand, message)
      → selectEducationalTopics(message)          [Checkpoint 3 §1 — pure, local, no evidence created]
      → runNheiConversationPipeline('educational', topics, ageBand)
          → retrieveApprovedKnowledge(db, topics, ageBand)  [nhei-knowledge-service.ts]
          → composeEducationalResponse(...)         [nhei-educational-response-composer.ts]
      → quarantineKnowledgeEntryForPrompt(...)     [nhei-knowledge-model-interface.ts]
  → mergedSystemPrompt = NOVA_SYSTEM_PROMPT + ... + nheiAddendum + NOVA_SAFETY_INSTRUCTIONS
```

Both gates are checked, in that order, before any Firestore read happens
at all; a disabled gate means zero NHEI processing, not merely an
unaffected output (tested directly via Firestore-call spies). The
educational addendum is always appended **before** the real safety floor,
never after and never in place of it.

## Internal knowledge-review workflow (Phase 3 Closure)

Separate from Educational Mode's own activation gates (below), and
touching neither of them: a real, auth-gated internal workflow for a
human to inspect, approve, or reject the knowledge entries Educational
Mode would eventually retrieve from. Not accessible to ordinary users.

- **Reviewer identity**: a separate, ADDITIVE Firebase custom claim,
  `nheiKnowledgeReviewer: true` — never a value in the single-valued
  `APP_USER_ROLES` claim `/api/admin/users/:uid/role` writes, since that
  would replace/strip whatever role the target already holds. Granted or
  revoked only via `POST /api/admin/users/:uid/nhei-knowledge-reviewer`
  (Platform-Owner-only). Checked server-side by
  `requireNheiKnowledgeReviewer(req)` (`server.ts`), which has no
  platform-owner or legacy-admin bypass — holding `platform_owner` alone
  does not grant review authority, by design (mirrors
  `nhei-authority-contract.ts`'s own stated principle that approving
  educational content is a specific, auditable responsibility, not a side
  effect of a broader admin role).
- **Routes** (all behind `requireNheiKnowledgeReviewer`, except the grant
  route which is Platform-Owner-only):
  - `GET /api/admin/nhei-knowledge/entries` — lists every entry
    regardless of `approvalStatus` (`listAllKnowledgeEntriesForReview`,
    `nhei-knowledge-service.ts`), for inspection.
  - `POST /api/admin/nhei-knowledge/entries/:entryId/review` — approve or
    reject, via `handleNheiKnowledgeReviewRequest`
    (`nhei-knowledge-review-service-boundary.ts`), which derives reviewer
    identity from the verified caller only, never a request body field.
  - `POST /api/admin/nhei-knowledge/import` — the idempotent,
    explicitly-invoked import described below.
- **Approve/reject concurrency**: `approveKnowledgeEntry`/
  `rejectKnowledgeEntry` (`nhei-knowledge-service.ts`) now run inside a
  real Firestore transaction (`db.runTransaction`), reading the entry
  inside the transaction and failing closed with
  `transaction_support_required` if no transaction support exists. Two
  reviewers racing on the same still-draft entry can no longer silently
  overwrite each other — one succeeds, the other correctly sees
  `entry_not_in_draft_state` (tested directly against a fake Firestore
  that models Firestore's optimistic-concurrency retry, not just a
  sequential call order that would pass even against the old,
  non-transactional code).
- **Admin UI** (Phase 3 Operational Acceptance §2): a small, focused
  "NHEI Knowledge Review" tab inside the existing `AdminDashboard.tsx` -
  not a new interface. Lists every entry, lets a reviewer inspect the
  full entry (explanation, taxonomy, sources, evidence category,
  reflection questions, safety restrictions, existing review status),
  complete the 8-item checklist, and approve or reject - all through the
  routes above. A separate small card lets a Platform Owner grant/revoke
  the `nheiKnowledgeReviewer` claim by uid. A 403 from any call (e.g. an
  admin with no reviewer grant) renders as a calm, specific message, not
  an error banner - most admins who open this tab are expected to see it.
- **Reviewer-claim revocation** (Phase 3 Operational Acceptance §3,
  finding and fix): removing the `nheiKnowledgeReviewer` custom claim
  alone does NOT invalidate an ID token already issued before the
  revocation - `verifyIdToken(token, true)`'s revocation check only looks
  at `getAuth().revokeRefreshTokens()`'s timestamp, never a specific
  claim's value. The revoke branch of the grant/revoke route now calls
  `revokeRefreshTokens` for the target uid, forcing every session for
  that account to re-authenticate before its next request succeeds
  anywhere in the app - the same immediate-effect tradeoff the existing
  MFA-disable route already makes, for the same reason. Deliberately NOT
  applied on grant (no comparable urgency, and it would be an unannounced
  forced logout for a purely beneficial change). Tested directly
  (`nhei-knowledge-review-admin.route.test.ts`).
- **Draft-content import** (`nhei-knowledge-import-service.ts`): the 13
  entries in `nhei-knowledge-content-library.ts`/
  `nhei-knowledge-content-drafts.ts` were, until this phase, never
  imported into Firestore by any production code path — confirmed by
  exhaustive grep, only test files ever referenced them. This file
  creates each as a real draft via the existing
  `createDraftKnowledgeEntry` (which itself refuses to overwrite an
  existing document id). Idempotent: re-running reports
  `already_imported` for anything unchanged, and a clear
  `conflict_existing_entry_differs` (never an overwrite) for a document
  whose content has diverged since — including a document a reviewer has
  since approved or rejected, since the comparison only ever looks at
  content fields, never governance ones. Never auto-publishes anything;
  every created document is a draft.

## Other engines that exist, offline/unwired today

- `nhei-trifecta-engine.ts` / `nhei-dimensions-engine.ts` — summarise
  which Self/Dimension has evidence activity. Used only by the
  Personal Reflection/Longitudinal pipeline path, not by Educational Mode.
- `nhei-temporal-engine.ts` — sequence/co-occurrence/recurrence only,
  never causation; recurrence requires ≥2 tag-sharing records.
- `nhei-adaptive-behaviour-engine.ts` — behavioural-pattern detection from
  temporal relations, same non-causal discipline.
- `nhei-knowledge-bridge.ts` — maps a context summary's active
  self-systems/dimensions onto knowledge topics. This is the
  *evidence-driven* topic selector for Personal Reflection/Longitudinal
  Mode — a different function from Educational Mode's own
  `nhei-educational-topic-selector.ts` (Checkpoint 3 §1), which classifies
  message TEXT, not interpreted evidence, and creates no evidence record.
- `nhei-extraction-service.ts` — conversation-to-evidence extraction via
  a dependency-injected model caller; real Gemini integration exists
  (`createGeminiExtractionCallerWithUsage`) but has never been exercised
  against a real model in this environment (no credential exists here).
- `nhei-gated-reflective-mode-integration.ts` — the required integration
  point for Personal Reflection/Longitudinal Mode: takes a mandatory
  `NheiSafeguardingGate` parameter (the compiler refuses a call site that
  omits it), currently always bound to `UNINTEGRATED_SAFEGUARDING_GATE`
  (`nhei-safeguarding-contract.ts`), which unconditionally returns
  `cleared: false`. Not imported by `server.ts` or any route.

## Recovery Intelligence Bridge (Phase 4, offline/unwired today)

`nhei-recovery-bridge-types.ts` and `nhei-recovery-bridge.ts` connect
NHEI's already-interpreted output to Blaze Break's existing Recovery
Routing vocabulary — not a new recommendation engine, and not a rewrite
of any existing recovery file. Neither file is imported by `server.ts` or
any live route; `buildNheiRecoverySuggestions` has no call site in this
codebase today. Wiring it into a real conversation turn is future work,
gated on its own approval.

- **Input**: a single `NheiRecoveryBridgeInput` — the existing
  `NheiPersonalContextSummary` (already consent-gated, already
  interpreted by Phase 1's Trifecta/Dimensions/Adaptive-Behaviour
  engines), an optional user-stated goal expressed in existing
  `RouteType`/`BandwidthBand` vocabulary, the existing capacity band
  (`recovery-capacity-gate.ts`, `null` is a real value, never defaulted),
  any Recovery Routing candidates already generated independently for
  the same turn (`recovery-signal-candidates.ts`), the caller's own
  `isNheiPurposeConsented(state, 'routing_insights')` result (the
  Phase-2-reserved consent purpose this phase implements), and the full
  `NheiSafeguardingClearance` object (not a bare boolean) from
  `nhei-safeguarding-contract.ts`.
- **Output**: a `NheiRecoveryBridgeResult` — zero or more
  `NheiRecoverySuggestion` objects, each inspectable data (never an
  execution command, no deep link, no "run this" method) carrying the
  target module, route type, a plain-language reason and user-facing
  explanation, evidence-record IDs only (never raw content),
  self-systems/dimensions, a `confirmed | tentative | educational`
  interpretation-kind flag, safety restrictions, the fixed
  `routing_insights` consent prerequisite, a `suitable | unsuitable |
  unknown` capacity-suitability flag, whether it matches a stated goal,
  a cross-reference to any existing Recovery Routing candidate for the
  same route, and alternative modules — or an explicit
  `NheiRecoveryNoSuggestionReason` (`consent_not_granted`,
  `safeguarding_not_cleared`, `insufficient_evidence`,
  `no_relevant_pattern`) when nothing fires. Never silence.
- **Fail-closed order**: consent, then safeguarding, then
  `insufficientEvidence`, all checked before any mapping rule runs. Since
  `UNINTEGRATED_SAFEGUARDING_GATE` always returns `cleared: false`, every
  real call today — once this is ever wired in — would stop at
  `safeguarding_not_cleared`; the full `NheiSafeguardingClearance` type is
  threaded through specifically so that remains true structurally, not by
  convention.
- **Mapping rules** (mirroring `recovery-signal-candidates.ts`'s own
  pattern: independent builder functions returning a suggestion or
  `null`, combined by filtering): a recurring Relational-Self behavioural
  pattern → Boundary Architect (PROTECT); confirmed Emotional-dimension
  evidence → Reset Studio (STABILISE); an explicit short-effort stated
  goal plus any Emotional signal → Anxiety Reset (STABILISE,
  low-bandwidth only); a recurring pattern plus an explicit stated ACT
  goal → Action Engine (ACT — never fires on pattern evidence alone);
  Physical-dimension evidence → Recovery Fuel (RECOVER); any other
  recurring pattern → My Patterns (UNDERSTAND). Every rule validates its
  target via `isKnownRoutingModule` before emitting — a suggestion naming
  a module that isn't a real, already-routable destination is structurally
  impossible, not just avoided by convention.
- **Audit finding (Phase 4 §2) — superseded by Phase 4B, see below.** At
  the time of Phase 4, `recovery-signal-candidates.ts`'s `MODULE_ROUTE_MAP`
  had no entry for Energy Delta Management — it was reachable only as its
  own standalone page (`EnergyBudget.tsx`), never through Recovery
  Routing, so the Physical-dimension rule targeted `recovery_fuel`
  instead. **This finding is historical and no longer describes the
  current state** — the "Energy Delta Management is now registered"
  bullet in the Phase 4B section immediately below resolved it: the
  module is registered, the Physical-dimension rule now targets it
  directly, and Phase 5 added anchor-level navigation to it (see that
  phase's own section). A reader should treat this bullet as the record
  of what Phase 4 found, not as the current routing behaviour.
- **Capacity suitability never invents a score**: `null` capacityBand
  (no reliable information) yields `'unknown'`, distinct from
  `'unsuitable'` (a real band exists but `isEffortWithinBandwidth` says
  the required effort doesn't fit) — the same `band === null` discipline
  `recovery-capacity-gate.ts` already enforces, never defaulted here.
- **Tests**: `nhei-recovery-bridge.test.ts` — the fail-closed gates, all
  16 named synthetic scenarios from the Phase 4 directive (leave-guilt/
  rest struggle, workplace boundary request, overload+short-action
  request, unexplained fatigue, a single relational anecdote producing no
  boundary suggestion, improved-outcome non-overpromising, disputed-
  evidence absence, no resistance-tracking field, no-relevant-evidence,
  multiple pathways without ACT defaulting, low-quality-evidence
  rejection, repeated-episodes-with-goal → Action Engine, youth age-band
  pass-through, consent/safeguarding denial under strong evidence, and
  the structural "every suggestion names only a verified module"
  invariant), capacity-suitability, candidate cross-referencing, and the
  Energy Delta finding.

## Recovery arbitration, orchestration, interaction, and review prep (Phase 4B, offline/unwired today)

Phase 4B completes the Recovery Intelligence Bridge's missing pieces -
the bridge alone produced candidates but never picked one, had no
trusted boundary for real consent/safeguarding, and had no tested way
for a user to actually respond to a suggestion. None of the four new
files below is imported by `server.ts`, any route, or any `.tsx`
component - confirmed by `grep -rl "nhei-recovery-"`, which returns only
these files and the Phase 4 bridge itself.

- **`nhei-recovery-arbitration.ts`** (`arbitrateNheiRecoverySuggestions`):
  picks at most one suggestion as a default recommendation from the
  bridge's candidate list, deterministically. Never selects a
  `capacitySuitability: 'unsuitable'` suggestion as the default (it stays
  visible as an alternative, never silently dropped); `'unknown'`
  capacity is preserved as `'unknown'`, never promoted or treated as
  unsuitable. Deduplicates suggestions that target the same `RouteType`
  into one winner (ranked by `interpretationKind`, then
  `matchesStatedGoal`, then capacity fit - an ORDERING, not an invented
  numeric score), keeping every loser in `dedupedAway` rather than
  discarding it. Takes an optional caller-supplied `unavailableModules`
  set for modules that are known but currently paused, and abstains
  honestly (`all_targets_unavailable` / `all_unsuitable_for_capacity` /
  `no_candidates`) rather than inventing a substitute. Deliberately does
  **not** call `selectRoute`/`compareCandidates`
  (`recovery-routing-engine.ts`) - doing so would require fabricating
  `InterventionCandidate` fields (urgency, recentlyUsed,
  userPreferenceMatch, etc.) that NHEI suggestions have no honest way to
  supply; see the file's own header comment for the full reasoning.
- **`nhei-recovery-orchestration.ts`** (`orchestrateNheiRecoveryRequest`):
  the trusted consent/safeguarding boundary. Its request type has no
  field for a consent or clearance boolean - consent is read live via
  `getNheiConsent`/`isNheiPurposeConsented`, and safeguarding clearance
  comes only from invoking a required `NheiSafeguardingGate` function
  parameter (never a boolean a caller could assert). The real default for
  any caller is `UNINTEGRATED_SAFEGUARDING_GATE`, so every call through
  this file behaves exactly like every other NHEI call site that gate
  guards - no bypass is invented here. `uid` must be the server's own
  already-verified identity (documented, not re-enforced - this file
  does no authentication of its own, matching every other NHEI
  persistence function). Capacity comes from running the real
  `determineBandwidth` (`recovery-capacity-gate.ts`) over caller-supplied,
  already-fetched signals - no capacity-relevant Firestore read of its
  own. `SIMULATED_TEST_ONLY_CLEARED_GATE` is exported solely for this
  file's own test suite to exercise the `cleared: true` path no real gate
  can produce yet.
- **`nhei-recovery-interaction-contract.ts`** (`initNheiRecoveryInteractionState`
  / `applyNheiRecoveryInteraction`): a pure reducer over six real actions
  - `accept`, `dismiss`, `explain`, `view_alternative`,
  `correct_interpretation`, `decline_all`. Structural guarantees, not just
  comments: this file imports nothing from any Firestore client (no
  persistence path exists for a correction, which is recorded only as a
  session-scoped suggestion id, never raw text); `dismissedSuggestionIds`/
  `declinedAll` are plain unscored flags with no cross-session counting,
  so a decline is never treated as resistance or a trait; the file
  imports nothing from Guardian, calendar, messaging, or navigation code,
  so no action here can trigger one even by accident.
- **`nhei-recovery-suggestion-review-register.ts`**: a static list of
  every user-visible `reason`/`explanationForUser` string the bridge's
  six rules can produce, each tagged with its governing rule and an
  honest (non-approving) set of flags - `causal_sounding`,
  `culturally_narrow`, `age_appropriateness_unverified`, etc. - for a
  future human reviewer. Nothing in this file marks any entry approved;
  `nhei-recovery-suggestion-review-register.test.ts` is a drift guard
  only, proving the recorded text still matches what the live rules
  produce, never a stand-in for the actual review.
- **`nhei-recovery-bridge.ts` hardening this phase**: every rule that
  reads `NheiBehaviouralPattern.occurrenceCount` now also requires
  `relationTypesObserved.includes('RECURRENCE')` - a bare `SEQUENCE`
  relation (`nhei-temporal-engine.ts`'s `deriveRelationBetween`) only
  means "chronologically ordered," not "from a different episode," so
  `occurrenceCount >= 2` alone was not a sufficient cross-episode
  guarantee at this file's own reading point, even though the real
  pipeline (`readNheiTemporalView`) only ever supplies genuine,
  already-episode-aware `RECURRENCE` relations today. See
  `NHEI_PHASE4B_RECOVERY_COMPLETION_REPORT.md` section 7 for the full
  audit.
- **Energy Delta Management is now registered**: `recovery-signal-candidates.ts`'s
  `MODULE_ROUTE_MAP` and `recovery-decision-copy.ts`'s
  `MODULE_DISPLAY_NAMES`/`MODULE_TARGET_TAB` each gained an `energy_delta`
  entry (→ `RECOVER`, hosted on the same `'recover'` tab as
  `recovery_fuel`/`one_less_thing`). Purely additive - no existing
  candidate-builder function ever produced `sourceModule: 'energy_delta'`
  before this, so no existing route's behaviour changed.
  `nhei-recovery-bridge.ts`'s Physical-dimension rule now targets
  `energy_delta` directly (the directive's own named destination),
  offering `recovery_fuel` as a genuinely, independently matching
  alternative rather than a disguised substitute.

## Experience, consent, and agentic-permission UI (Phase 5, offline/unwired today)

Phase 5 builds the user-facing half of Phase 4B's arbitration/orchestration/
interaction work, plus three new, independent UX foundations. Every new
`.tsx` file below is confirmed, by repeated `grep -rln`, to be imported only
by the other new Phase 5 files (the `NheiPhase5Preview.tsx` harness composes
the rest) — none is imported by `App.tsx` or reachable by any real user, the
same "prepare but do not activate" discipline every earlier phase used for
its backend-only work.

- **Arbitration fix — deduplication was keyed on the wrong field.**
  `nhei-recovery-arbitration.ts` previously grouped candidate suggestions by
  `routeType` before picking a winner, which silently merged two genuinely
  different real tools (e.g. a Reset Studio suggestion and an Anxiety Reset
  suggestion, both `STABILISE`) into one, erasing a real alternative. The
  grouping key is now `targetModule` — a true duplicate is now only ever the
  same exact module suggested twice (no current bridge rule produces this,
  but a future rule could). `arbitrateNheiRecoverySuggestions`'s result also
  gained a new, structurally separate `unsuitableForCapacity` field: a
  capacity-unsuitable suggestion is now returned there, never mixed into
  `alternatives`, so a future UI consumer cannot accidentally render it as
  an ordinary, equivalent choice.
- **Orchestration fix — personal evidence was read before consent/safeguarding
  were checked.** `orchestrateNheiRecoveryRequest` previously called
  `buildNheiPersonalContextSummary` (a real personal-evidence Firestore read)
  unconditionally, before checking either `routing_insights` consent or the
  safeguarding gate — meaning every call read personal evidence even though
  `UNINTEGRATED_SAFEGUARDING_GATE` always rejects every request today. The
  function now checks consent first, then safeguarding, and only calls
  `buildNheiPersonalContextSummary` once both have passed. Two new outcome
  statuses, `consent_not_granted` and `safeguarding_not_cleared`, are
  returned before any personal-context read — this is a data-minimisation
  fix, not a behaviour change for any real caller, since the safeguarding
  gate's answer is unchanged.
- **`nhei-recovery-navigation.ts`**: a pure helper pairing a target module
  with an explicit anchor element id, via a new, deliberately small
  `NHEI_MODULE_ANCHOR_ID` map (today: only `energy_delta` →
  `'energy-delta-tool'` — no anchor is invented for any unaudited module).
  `src/App.tsx` gained a second, purely additive window event listener,
  `'nhei_recovery_tool_focus'`, alongside the existing `'navigate_tab'`
  event (whose ~20 existing call sites and bare-string contract are
  unchanged); the new listener does bounded `requestAnimationFrame` polling
  for the target element, then `scrollIntoView`. `EnergyBudget.tsx`'s root
  element gained `id="energy-delta-tool"`. This exists because the
  `'recover'` tab stacks seven different tools in one scroll — landing on
  the tab alone does not reliably put a user on Energy Delta Management
  specifically; nothing here invents a new route or destination.
- **`src/components/NheiRecoverySuggestionCard.tsx`**: the user-facing card
  for a `NheiRecoveryArbitrationResult`, built on the same shell and
  "never more than one primary recommendation, always a way out" discipline
  as the existing, live `NovaRecommendationCard.tsx`. Every button (accept /
  dismiss / explain / view alternative / correct interpretation / decline
  all) is wired to the real `applyNheiRecoveryInteraction` reducer from
  Phase 4B — no decorative control lacks a state transition. Accepting a
  suggestion only changes this component's own local state; nothing it does
  can reach an external system. Renders `unsuitableForCapacity` suggestions
  in a visually distinct section, never alongside ordinary alternatives, and
  renders the bridge/arbitration's abstention reasons explicitly rather than
  an empty card.
- **`src/components/NheiPrivacyConsent.tsx`**: four consent-mode screens
  (Educational / Personal Reflection / Longitudinal / Recovery Insights),
  each separating *granting* from *viewing*. Confirmed by grep
  (`server.ts` has no route matching `routing_insights|longitudinal_tracking
  |reflection_storage|setNheiConsent`) that no backend exists yet to write
  any NHEI consent purpose — so every consent-requiring toggle renders
  visibly `disabled` with an explicit "not yet available" label, rather than
  appearing to save a grant that cannot be persisted anywhere.
  Export/deletion link to the real, existing `GET /api/user/export` and the
  real, existing whole-account `POST /api/user/delete-account` honestly
  (noting no granular per-purpose NHEI deletion route exists). Educational
  Mode is shown as needing no consent at all, matching
  `authoriseConversationMode`'s real behaviour.
- **`src/components/NheiReflectionPreview.tsx`** +
  `nhei-reflection-preview-fixtures.ts`: a feature-disabled preview of what
  a real reflection view would show, built entirely on a new,
  explicitly-synthetic `NheiReflectionPreviewEntry` fixture type — never the
  real `NheiEvidenceRecord`, which deliberately has no raw-text field.
  Visibly distinguishes what the person reported, Nova's tentative
  interpretation (hypothesis entries only), user-confirmed information, and
  a disputed/corrected entry, grouped by synthetic episode, each tagged with
  its Self(s)/Dimension(s). Local dismiss/correct actions change only this
  component's own state; no Firestore call exists anywhere in this file.
- **`nhei-before-words-contract.ts`** + `src/components/NheiBeforeWords.tsx`:
  a brand-new, from-scratch pure state model (confirmed by a case-insensitive
  repo-wide search: no prior "Before Words" code existed) for an optional,
  low-friction entry experience — free text, four optional, individually
  skippable prompts, an uncertainty flag per prompt, additive corrections
  (never overwritten), and two equally-presented endings,
  `proceed_without_retaining` and `retain_as_reflection_evidence`. The
  contract file has zero import statements (verified by a test reading its
  own source) — no model call, no persistence path, no diagnostic label is
  ever required to finish the flow.
- **`nhei-agentic-action-contract.ts`** +
  `src/components/NheiAgenticActionPreview.tsx`: prepares the permission
  contract a future, separately-authorised phase would need before Nova
  could ever take a real external action (calendar/task adjustment). A
  strict state machine (`suggested → prepared → awaiting_approval →
  approved/declined → executing → confirmed/failed`, plus `undone`) with a
  `VALID_TRANSITIONS` map that throws on any other transition.
  `recordApprovalDecision` is the only function that can move a proposal out
  of `awaiting_approval` — structurally, not just by convention, an NHEI
  interpretation alone can never authorise an external action. The contract
  file has zero import statements, so no connector, Guardian, calendar, or
  messaging code is reachable from it. The preview component only ever
  simulates a connector via `setTimeout` — no real API call of any kind
  exists in this codebase for any connector today.
- **No automated rendering/accessibility test exists for any of the six new
  `.tsx` files above, or for any other `.tsx` file in this codebase.**
  `vitest.config.ts` runs with `environment: 'node'` and only includes
  `**/*.test.ts` — there is no jsdom/@testing-library harness anywhere in
  this repository. Every prior phase's UI work, and this one, has only ever
  been verified by manual review and a dev-server check, never an automated
  component test; this is a pre-existing, repo-wide limitation, not
  something new to Phase 5.

## Phase 5B corrections and the wider Nova picture

Phase 5B's directive asked specifically for documentation drift to be
corrected and for synthetic-preview vs. integrated status to be
unambiguous. Three corrections, plus one pointer:

- **Energy Delta**: see the "superseded by Phase 4B" note added to the
  Phase 4 section above — the Phase 4 finding is historical, not current.
- **Before Words retention**: `nhei-before-words-contract.ts` has always
  had two real, equally-valid endings, but
  `src/components/NheiBeforeWords.tsx` only ever calls
  `decideProceedWithoutRetaining` — nothing in this codebase calls
  `decideRetainAsReflectionEvidence`. This was reviewed explicitly this
  phase and confirmed correct, not an oversight: no real
  `reflection_storage` write exists to receive a "retained" session, so a
  UI button offering it would be exactly the "simulated option mistaken
  for working persistence" risk the directive warns against. The retain
  ending's data shape is prepared offline
  (`nova-before-words-handoff-contract.ts`'s `NovaIntakeSummary`) for a
  future phase that builds the real write path and, only then, a UI
  control for it.
- **Synthetic preview vs. integrated, unambiguous legend**: every file
  under the `nhei-` prefix in this document is offline/unwired unless a
  section explicitly says otherwise (Educational Mode's pipeline is the
  one exception, and even that is default-OFF behind two gates). Every
  `.tsx` component named here is reachable only from
  `src/components/NheiPhase5Preview.tsx`, a developer-only harness not
  imported by `App.tsx` — never from a real user's navigation. This is
  stated once here, deliberately, so no later section needs to repeat it
  per-component.
- **The wider Nova picture**: this document and
  `docs/NHEI_RELEASE_BLOCKERS.md` describe NHEI specifically. Blaze
  Break's full Nova vision is larger than NHEI — see
  `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` (Phase 5B) for the
  18-workstream register covering Support Circle, Boundary Autopilot,
  Calendar/Workload signals, Voice, the new offline Nova Take the Load
  agentic layer, and more, including which of them are real and
  integrated today versus offline, specified, or not started. NHEI is
  one workstream of that larger picture (workstream A there), not a
  synonym for Nova as a whole.

## Real consent-writing routes (Phase 5C, directive §2)

`GET`/`POST /api/nhei/consent` (`server.ts`) are real, server-authored
routes backed by the already-existing, already-tested
`getNheiConsent`/`setNheiConsent`/`withdrawNheiConsent`
(`nhei-persistence-service.ts`) — no new persistence logic was written,
only the route wiring. `uid` comes only from the verified ID token
(`requireAuth(req).uid`), never the request body, so a request can only
ever grant or withdraw consent for the caller's own account. Each of the
three purposes is set independently — one purpose's write never touches
another's field. Withdrawal only flips the flag; it never deletes
anything already persisted, matching `withdrawNheiConsent`'s own
pre-existing "withdrawal and deletion are not equivalent" design.

**This is consent bookkeeping only — it activates no personal NHEI
processing by itself.** Educational Mode is governed entirely by its own
two separate gates (unaffected); Personal Reflection/Longitudinal/
Recovery Insights remain unwired into any conversation route; the
independent safeguarding system remains unbuilt. `src/components/
NheiPrivacyConsent.tsx`'s three personal-purpose toggles are now wired
to this real route (fetch on mount, write on toggle, a real error state
on a rejected write) — still an offline preview, not mounted into
`App.tsx`'s live navigation.

See `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` workstream O for the
full account, including the Phase 5B finding (`ConnectedNovaPermissions`)
this route's design follows.

## Calendar Protection vertical slice (Phase 5D, directive §2–§6)

This phase's work is almost entirely on the Agentic Nova (`nova-` prefix)
side, not NHEI itself — recorded here because it completes the one
agentic workflow NHEI's own docs have been tracking since Phase 5B/5C.

- **`allowCalendarActions`** (`nova-calendar-action-permission.ts`): a
  SEPARATE, fail-closed permission from the pre-existing
  `allowCalendarSignals` (a read-only consent flag that was never meant
  to authorise a write). Stored on the same `nova_permissions/current`
  document, defaulting to `false` on any missing doc/field/error — the
  opposite default direction from `allowCalendarSignals`'s own fail-OPEN
  behaviour, deliberately, since granting an action permission is a
  higher-stakes default than a read signal. `server.ts` checks it at
  `propose` time and again, authoritatively, at `execute` time.
- **Real Firestore-transaction concurrency hardening** in
  `nova-calendar-protection-service.ts`: the `approved → executing` and
  `confirmed → undoing` transitions are each claimed inside a real
  `db.runTransaction` with a fresh per-attempt id, closing the
  "two workers execute the same proposal" race. Fails closed with
  `transaction_support_required` if no transaction support exists — the
  same discipline this file's own `nhei-persistence-service.ts` already
  established for its own transactional writes.
- **Honest limitation, not a fabricated check (Phase 5D)**: directive §3
  also asked for a server-side re-check of "ownership of the connected
  calendar" and "provider-granted scopes" at execute time. Neither was
  possible then — `server.ts`'s `OAUTH_PROVIDERS` had no Google Calendar
  entry, so there was no server-side Google OAuth token or scope list to
  check against. `allowCalendarActions` plus the permanent
  `CALENDAR_PROTECTION_EXECUTION_ENABLED` kill-switch stood in for that
  gap; no code in that phase pretended to verify ownership or scopes it
  couldn't see. **Updated Phase 5E: this specific gap is now closed** —
  see the new section immediately below. The kill-switch itself remains
  unchanged (still permanently `false`), so this correction changes what
  is now POSSIBLE to check, not what is currently enabled.
- **`nova-google-calendar-adapter.ts`**: pure request-construction
  functions for what a real Google Calendar Events API call would need,
  plus a `NovaExternalConnector` that is structurally incapable of a real
  network call (no `fetch`/`http` import anywhere in the file) rather
  than a flag it could someday flip — there is no server-side token to
  give it regardless.
- **`src/components/NovaTakeTheLoad.tsx`**: the first real UI for this
  workflow, wired to all 6 Phase 5C routes plus 2 new read-only ones.
  Makes the suggested-vs-executed distinction explicit at every state.
- **`nova-before-words-temporary-context.ts`**: a session-only, never-
  persisted context Nova could use for one turn, built for EITHER Before
  Words ending (not just the still-unreachable retain path) — see the
  Phase 5B section above for why `buildNovaIntakeSummaryFromBeforeWords`
  alone was never enough for `proceed_without_retaining`.

See `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` workstreams B, C and L
for the full account.

## Secure connectors and conversational continuity (Phase 5E, directive §2–§8)

Like Phase 5D, almost entirely on the Agentic Nova (`nova-` prefix) side,
plus one real piece of NHEI-adjacent wiring (Before Words → Nova chat).
Full account in `docs/NOVA_PHASE5E_CONNECTOR_AND_CONTINUITY_DELIVERY_REPORT.md`;
summarised here because it closes gaps this document itself was tracking.

- **The Google Calendar OAuth gap above is closed**: `server.ts`'s
  `OAUTH_PROVIDERS` now has a real `google_calendar_actions` entry — a
  GENUINELY separate provider/scope/token from the pre-existing
  client-side-only Google Calendar read connection (never a reuse of
  it), using the existing generic connect/callback/disconnect/status
  routes extended with three new optional hooks: PKCE (server-only
  verifier storage, one-shot read-then-delete), `fetchAccountIdentity`
  (records `connectedAccountEmail` on the redacted status doc only — the
  real ownership check directive §3 asked for), and `revoke` (calls
  Google's own revoke endpoint on disconnect). `getValidAccessToken` was
  also hardened: an `invalid_grant` refresh failure now disconnects the
  integration and returns `null`, rather than returning an already-expired
  token forever.
- **A real connector now exists**: `nova-google-calendar-connector.ts` —
  dependency-injected HTTP transport, genuine Events API request/response
  handling (unit-tested against fake responses AND a real local
  `http.Server`, zero real network calls), still structurally unreachable
  from production (its own static audit test confirms no `fetch`/`http`/
  `googleapis` import and no import from `server.ts` or any `.tsx` file).
  `CALENDAR_PROTECTION_EXECUTION_ENABLED` remains the permanent `false`
  kill-switch from Phase 5D — this connector existing does not change
  whether real execution is reachable today.
- **Provider-level idempotency and reconciliation**: every created event
  is tagged with `extendedProperties.private.novaProposalId`; a dedicated
  search function can find it after the fact. Two reconciliation
  functions in `nova-calendar-protection-service.ts` —
  `reconcileAmbiguousCalendarProtectionProposal` (Phase 5E, for a
  connector call that threw) and
  `reconcileStuckExecutingCalendarProtectionProposal` (Phase 5E, for a
  DIFFERENT failure — a worker that died after claiming `executing` but
  before finalising, which the normal retry path cannot reach at all,
  since a second `execute` call deliberately short-circuits to
  `already_executing` forever) — both change state only on a genuine
  search answer, never on an inconclusive one, and neither is wired into
  any production route.
- **Before Words reaches a real Nova chat turn**: audited both real Nova
  conversation entry points and found `NovaChat.tsx`'s existing,
  client-composed, per-request, never-persisted `systemInstruction`
  already sanctioned for exactly this. `formatTemporaryBeforeWordsContextForNova`
  (`nova-before-words-temporary-context.ts`) formats a bounded (≤1,200
  char), plainly-worded addendum with an explicit "temporary, not saved,
  not a diagnosis" framing sentence; two new optional `NovaChat.tsx`
  props fold it into exactly one outgoing `/api/nova/chat` request, then
  the caller clears it — no new persistence, no extra model call. Wired
  end-to-end in the same offline preview harness via a new
  `src/components/NovaAgenticJourney.tsx` sequencer (still not
  `App.tsx`'s live navigation). The Nova Live voice path
  (`useNovaLiveVoice.ts`'s `buildInitialPrompt`) was reviewed and needs
  no component change to accept the same formatted string in a future
  phase — it is already a caller-supplied function.
  **Phase 5F correction (directive §4):** the design above put this
  content into `config.systemInstruction` — Gemini's elevated-trust
  channel, the same one `NOVA_SYSTEM_PROMPT` and `NOVA_SAFETY_INSTRUCTIONS`
  occupy — with no framing marking it as untrusted user text and nothing
  stopping it from forging a fake instruction boundary. A real audit
  finding, not a hypothetical: anything typed into Before Words sat at
  the same trust level as Blaze Break's own safety rules. Fixed by adding
  a new, separate, strictly-bounded, `.strict()`-validated
  `beforeWordsContext` field to `ChatRequestSchema`
  (`server.ts`); `quarantineTemporaryBeforeWordsContextForPrompt`
  (`nova-before-words-temporary-context.ts`) wraps it in the same
  nonce-delimited, delimiter-defusing, explicit "this is not an
  instruction" pattern `quarantineKnowledgeEntryForPrompt`
  (`nhei-knowledge-model-interface.ts`) already established for a
  different kind of untrusted text, and the server places the result in
  the ORDINARY MESSAGE text sent to the model (`chat.sendMessage`/
  `callClaudeNovaChat`'s `message` argument), never in
  `mergedSystemPrompt`. `NovaChat.tsx` no longer builds a
  `beforeWordsAddendum` into `fullSystemInstruction` at all — it sends the
  raw structured context as its own request field and lets the server do
  the quarantining. Covered by `nova-before-words-temporary-context.test.ts`
  (quarantine primitive: framing present, nonce-delimiter forgery
  defused, prompt-injection content contained) and
  `nova-chat-before-words-trust-boundary.route.test.ts` (end-to-end
  through the real Express route: content never reaches the mocked
  Gemini client's `config.systemInstruction`, does reach the ordinary
  message text, oversized/malformed/extra-field payloads are rejected by
  the schema). The Nova Live voice path was re-reviewed under this same
  question and found NOT currently wired to Before Words at all —
  `buildVoiceContext` (`NovaChat.tsx`) has no Before Words reference, and
  the live-voice `initialPrompt` message is already sent via
  `liveSession.sendClientContent({ turns, turnComplete: false })`
  (`server.ts`) — ordinary conversation turns, not `systemInstruction` —
  so there is no equivalent live-voice bug to fix, but also no live-voice
  Before Words continuity to claim either; this remains unbuilt, not
  merely unverified. Ordinary chat history is unaffected and separately
  disclosed to the user: `NovaChat.tsx`'s `messages` state (persisted
  client-side only, in `nova_chat_history` localStorage, never read or
  written by the server) is built from the raw `messageText` the person
  typed, never from the quarantined Before Words block, and
  `src/components/NheiBeforeWords.tsx`'s own 'decided'-step copy now
  names that existing, separate, on-device chat history explicitly, so
  "temporary, not saved" (Before Words) is never confused with "kept on
  this device so you can scroll back" (ordinary Nova chat).
  **Phase 5F Agentic Expansion re-verification (directive §6):**
  re-audited after this phase's `NovaAgenticJourney.tsx` rework (directive
  §4) — the quarantine mechanism itself
  (`quarantineTemporaryBeforeWordsContextForPrompt`, the `beforeWordsContext`
  schema field, the ordinary-message-text placement) was not touched this
  phase; confirmed by grep that nothing new in `nova-task-deferral-*.ts`,
  `nova-proactive-assistance-contract.ts`, or
  `nova-invisible-load-help-contract.ts` imports anything under the
  `nhei-` prefix, and the full `nova-before-words-temporary-context.test.ts`
  / `nova-chat-before-words-trust-boundary.route.test.ts` suite still
  passes unchanged. What DID change: `NovaAgenticJourney.tsx` gained an
  explicit `entry` step offering "say what's on your mind first" (Before
  Words) or "just talk to Nova" (skips it entirely) — directive §4's "allow
  users to enter directly through ordinary Nova chat without forcing them
  through Before Words." This does not weaken the trust boundary; it only
  changes whether a user reaches Before Words at all before chatting —
  once they do, the temporary context still only ever reaches the
  ordinary message text, exactly as before. A new back-navigation stack
  lets a user return to a prior step (including back to Before Words from
  chat) without resetting the whole journey, but a step that has already
  been consumed by `NovaChat`'s one-shot `onTemporaryBeforeWordsContextConsumed`
  is not resurrected by going back — going back re-renders the step, it
  never replays an already-sent request.
- **Browser-level and real-emulator test coverage, both new this phase**:
  a Firestore emulator integration suite (`npm run test:emulator`,
  `vitest.emulator.config.ts`) exercising the real Firebase Admin SDK
  against a genuinely running local emulator — concurrent approvals,
  concurrent execution claims, idempotency, account isolation, approval
  expiry, stuck-execution recovery, audit consistency, export/deletion —
  skipped (not falsely passed) when no emulator is reachable. A
  Playwright suite (`npm run test:e2e`, `playwright.config.ts`) driving a
  real Chromium browser against a dedicated dev-only page
  (`dev-nhei-phase5-preview.html`, never linked from the real app) with
  every provider response mocked at the network layer — mobile and
  desktop viewports, keyboard-only interaction, a real focus-trapped
  modal, consent withdrawal, the suggested-vs-executed distinction,
  permission denial, and failed/ambiguous connector responses. Neither
  suite makes WCAG certification claims.

See `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` workstreams B and L
for the full account.

## Feature governance (both default OFF, AND-combined)

1. `NHEI_EDUCATIONAL_MODE_ENABLED` — a server-only `process.env` read
   (`nhei-educational-mode-flag.ts`), requiring the exact string `'true'`.
   Changing it on this app's actual Cloud Run deployment requires a new
   service revision (confirmed against `docs/DEPLOY.md` — not an
   in-process reload).
2. `app_config/nhei_feature_state` — a Firestore document
   (`nhei-feature-governance.ts`), read fresh on every request with no
   cache, fail-closed on any missing/malformed/erroring read. Three
   independent boolean fields, one per mode. Exists specifically because
   (1) alone is slow to flip off in production; this is the fast path —
   one Firestore write, no deploy, visible to every instance on its next
   request.

Both must be true for Educational Mode to do anything. Neither alone is
sufficient — confirmed by dedicated tests in both directions.

## Consent and privacy boundaries

- Educational Mode needs **no NHEI consent** at all — `authoriseConversationMode`'s
  `'educational'` branch ignores its consent parameter entirely.
- Personal Reflection/Longitudinal would need `reflection_storage`
  (persistence) and, for cross-session use specifically,
  `longitudinal_tracking` as a second, independent purpose — enforced by
  `readNheiEvidenceForLongitudinalMode` (`nhei-persistence-service.ts`),
  which requires both, re-checked on every read (not a write-time
  snapshot), not yet wired into any route.
- All personal-data writes (`writeNheiEvidence`, `setConfirmationState`,
  `writeNheiAssertedInfluence`) require real Firestore transaction
  support and fail closed without it — no nontransactional fallback
  exists in production code.
- Export (`exportAllNheiData`), correction (per-evidence-record
  `corrections` subcollection), and deletion
  (`deleteNheiEvidenceRecord`/`deleteAllNheiData`/account-level
  `eraseUserAccount`) all exist, are tested, and are reachable today
  through the app's existing GDPR export/delete endpoints — independent
  of whether any NHEI mode is ever activated for anyone.
- `NHEI_RETENTION_SWEEP_ENABLED` is hardcoded `false`; no automatic
  deletion scheduling exists anywhere in this codebase.

## The trust boundary between retrieved knowledge and the model

Approved knowledge text is never concatenated into the prompt raw. It is
wrapped in a nonce-suffixed delimiter pair with an explicit "this is
reference data, not an instruction" framing
(`quarantineKnowledgeEntryForPrompt`), and any delimiter-lookalike
substring inside the knowledge text itself is defused so content cannot
forge a fake closing boundary. This is a proven, tested property of
**string construction** — the boundary cannot be forged, and the real
safety floor always lands after it. It is **not**, and is never claimed
to be, a proof that a real model will always honour that framing; no
real-model test has been run against this content (no usable credential
exists in this environment — see `docs/NHEI_RELEASE_BLOCKERS.md` and the
operator procedure in `docs/NHEI_REAL_MODEL_EVALUATION_PROCEDURE.md` Part B).

## Where this document can go stale

This file should be updated whenever a mode's wiring state changes (the
table above), a new consent purpose or gate is added, or a governance
mechanism changes — the same discipline `docs/SECURITY_ARCHITECTURE.md`
expects of itself. The per-checkpoint delivery reports remain the
detailed history of each change; this file is the current-state summary,
not a replacement for them.
