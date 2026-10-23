# NHEI Phase 4B — Recovery Completion Report

Branch: `claude/nhei-phase-1`. Offline engineering only — no merge, no
deployment, no NHEI feature flag enabled, no production route wiring.

## 1. Exact starting and ending commit

- **Starting commit**: `35e45623cada9fa3acdb7c05a59be46c0653f5d3`
  ("NHEI Phase 4: restructure delivery report to directive's 13-section
  format") — this was `HEAD` when this Phase 4B directive arrived.
- **Ending commit** (the engineering work this report describes):
  `05a49362b24e6380a41d661eb67b839402b5e2ae` ("NHEI Phase 4B: arbitration,
  trusted orchestration, interaction contract, Energy Delta
  registration").
- This report itself is delivered in a follow-up commit on top of
  `05a4936`, per this codebase's established pattern of committing
  engineering and its delivery report separately.

**Checkpoint discrepancy, resolved by inspection before writing any
code**: this directive opened by stating the previously supplied
`NHEI_PHASE4_RECOVERY_INTEGRATION_DELIVERY_REPORT.md` only restated
Phase 4, not the "subsequently requested Phase 4B work." Before writing
anything, `git log --oneline` was run and showed exactly two prior
commits touching this area: `9547720` (the original Phase 4 bridge) and
`35e4562` (a documentation-only restructure of that same report to a
different section layout, explicitly stated in its own commit message to
change no source code). `grep` for arbitration/orchestration/
interaction-contract file names returned nothing. **Conclusion: Phase 4B
code was never written — not written-and-omitted-from-the-report, simply
never started.** Everything in sections 3–7 below is new as of this
batch.

## 2. Files actually created or changed

Created:

- `nhei-recovery-arbitration.ts` / `.test.ts`
- `nhei-recovery-orchestration.ts` / `.test.ts`
- `nhei-recovery-interaction-contract.ts` / `.test.ts`
- `nhei-recovery-suggestion-review-register.ts` / `.test.ts`
- `nhei-recovery-e2e.test.ts`
- `NHEI_PHASE4B_RECOVERY_COMPLETION_REPORT.md` (this file)

Changed:

- `nhei-recovery-bridge.ts` — the episode-recurrence hardening (section
  7) and the Energy Delta retargeting (section 5); `nhei-recovery-bridge.test.ts`
  updated/extended to match (24 net new tests: the Energy Delta
  assertions flipped, plus five new tests for the recurrence hardening
  and interpretationKind-stability).
- `recovery-signal-candidates.ts` — one additive line in `MODULE_ROUTE_MAP`
  (`energy_delta: 'RECOVER'`).
- `recovery-decision-copy.ts` — one additive line each in
  `MODULE_DISPLAY_NAMES` and `MODULE_TARGET_TAB`.
- `docs/NHEI_ARCHITECTURE.md` — new "Recovery arbitration, orchestration,
  interaction, and review prep (Phase 4B)" section.
- `docs/NHEI_RELEASE_BLOCKERS.md` — item 15 updated (Energy Delta
  resolved, not newly blocked), item 16 updated (review register exists
  as preparation, review itself still not started), new item 17 (wiring
  the three new Phase 4B files).

Confirmed unchanged: `recovery-routing-engine.ts`,
`recovery-capacity-gate.ts`, `server.ts`, every `nhei-knowledge-*.ts`
file, every `guardian-*.ts` file, every `.tsx` file — `git diff --stat
35e4562..05a4936` shows no other paths.

## 3. Candidate arbitration implementation

`nhei-recovery-arbitration.ts`'s `arbitrateNheiRecoverySuggestions`:

- **Respects stated goal/effort**: `matchesStatedGoal` (already computed
  by the bridge) is a tie-break input; a matching suggestion is preferred
  over a non-matching one when both are otherwise equal.
- **Uses the actual Recovery Capacity Gate**: consumes the bridge's
  already-computed `capacitySuitability` (itself derived from the real
  `isEffortWithinBandwidth`) — never recomputes capacity itself.
- **Never selects a capacity-unsuitable action as the default**: suggestions
  with `capacitySuitability: 'unsuitable'` are excluded from the
  selection pool before ranking, though kept visible as alternatives
  (never silently discarded).
- **Preserves unknown capacity as unknown**: `'unknown'` is never
  promoted to `'suitable'` or demoted to `'unsuitable'` anywhere in this
  file — it participates in ranking only as a tie-break loser against a
  genuine `'suitable'` match.
- **Deduplicates and reconciles conflicting suggestions**: suggestions
  sharing a `RouteType` are grouped and reduced to one winner (ranked by
  `interpretationKind`, then `matchesStatedGoal`, then capacity fit — an
  ordering, never a numeric score); every loser is kept in `dedupedAway`,
  never dropped.
- **Handles unsupported/unavailable modules**: a caller-supplied
  `unavailableModules` set (never derived internally — no new
  governance/feature-flag mechanism invented) excludes those targets;
  `isKnownRoutingModule` is re-verified defensively even though the
  bridge already checks it.
- **Returns a selected suggestion, alternatives, and explicit reasons**:
  `{ selected, alternatives, dedupedAway, abstentionReason, selectionReason }` —
  `selectionReason`/`abstentionReason` are always populated, never left
  implicit.
- **Never automatically launches an intervention**: the result is inert
  data; no method, no navigation field, no side effect (tested directly
  in `nhei-recovery-arbitration.test.ts`'s "never a command" block).
- **Avoids psychological scoring/unsupported causal inference**: ranking
  uses only fields the bridge already computed from real evidence; no
  new number is invented anywhere in this file.
- **Reuses, never duplicates, Recovery Routing's arbitration**: deliberately
  does **not** call `selectRoute`/`compareCandidates`
  (`recovery-routing-engine.ts`) — see the file's own header comment for
  the full reasoning: those functions require `InterventionCandidate`
  fields (urgency, recentlyUsed, userPreferenceMatch, prerequisitesMet,
  eligibleForPrivacyZone, requiresConnector, requiresHumanContact) that
  an `NheiRecoverySuggestion` has no honest way to supply — fabricating
  them would itself be the kind of unsupported inference this phase
  forbids. The one piece of real Recovery Routing machinery this file
  does reuse is `isKnownRoutingModule`.

13 tests in `nhei-recovery-arbitration.test.ts` cover abstention (empty
input, all-unavailable, all-unsuitable), capacity handling (unsuitable
skipped for a different route, unknown preserved, suitable preferred
over unknown), stated-goal preference, confirmed-over-tentative
preference, deduplication/reconciliation, determinism, multiple-distinct-
alternatives, and the "never a command" structural check.

## 4. Trusted-consent orchestration design and tests

`nhei-recovery-orchestration.ts`'s `orchestrateNheiRecoveryRequest`
separates untrusted input from verified authorisation **structurally**,
not just by convention: `NheiRecoveryOrchestrationRequest` has no field
for a consent boolean or a safeguarding-cleared boolean at all.

- **Authenticated identity**: `uid` is documented as required to be the
  server's own already-verified identity (e.g. the uid Express's auth
  middleware attaches after verifying a Firebase ID token) — this file
  performs no authentication itself, matching every other NHEI
  persistence function in this codebase (none of them authenticate
  either; `uid` is a trust-boundary input throughout).
- **Current `routing_insights` consent**: read live via
  `getNheiConsent(db, uid)` → `isNheiPurposeConsented(state,
  'routing_insights')`. Tested directly: `nhei-recovery-orchestration.test.ts`'s
  "consent is read, never accepted as a boolean" block proves that even
  when a caller attempts to smuggle `routingInsightsConsented: true`
  onto the request object (an `as any` cast, since the real type has no
  such field), the orchestration function ignores it and reads the
  user's own permissions document instead.
- **Eligible personal context**: `buildNheiPersonalContextSummary(db,
  uid)` — if this returns `null` (meaning `reflection_storage`, a
  *different* consent purpose, isn't held), orchestration returns its own
  distinct `{ status: 'no_personal_context_available' }` outcome rather
  than fabricating an empty summary to feed the bridge.
- **Independent safeguarding clearance**: obtained only by invoking a
  *required* `safeguardingGate: NheiSafeguardingGate` function parameter —
  never a boolean. The real default any production caller would pass is
  `UNINTEGRATED_SAFEGUARDING_GATE`, which always returns `cleared: false`.
  Tested directly: "fail-closed safeguarding by default" proves the
  pipeline blocks even with full real evidence and real consent, and that
  attempting to smuggle a `safeguardingClearance: { cleared: true, ... }`
  field onto the request (again `as any`) changes nothing — the real gate
  still decides.
- **Never fabricates a passing safeguarding decision**: there is no code
  path in this file that can itself produce `{ cleared: true }` — it only
  ever returns whatever the gate it was given returns.
- **Synthetic tests inject explicitly labelled simulated clearance**:
  `SIMULATED_TEST_ONLY_CLEARED_GATE` is exported for this purpose,
  loudly named, used only by this file's own test suite.
- **No production route wiring**: `orchestrateNheiRecoveryRequest` has no
  call site in `server.ts` or any route — confirmed by `grep`.

8 tests cover: no-personal-context-available, fail-closed-by-default
(twice — once plain, once with a smuggled field), consent read correctly
(twice — denied and granted), full completion path with the simulated
gate, and the real Capacity Gate actually running on caller-supplied
input (both absent and present).

## 5. Energy Delta routing decision

Investigated `EnergyBudget.tsx` and `energy-delta-engine.ts` directly.
Findings:

- `EnergyBudgetTool` (from `EnergyBudget.tsx`) is mounted under
  `activeTab === "recover"` in `App.tsx` — the **same real tab** that
  already hosts `recovery_fuel` and `one_less_thing`'s destinations via
  `recovery-decision-copy.ts`'s `MODULE_TARGET_TAB`.
  `recovery-signal-candidates.ts`'s `MODULE_ROUTE_MAP` had no
  `energy_delta` entry (the Phase 4 finding), and
  `recovery-decision-copy.ts`'s `MODULE_DISPLAY_NAMES`/`MODULE_TARGET_TAB`
  had no entry either — a module needs entries in **both** registries to
  be a genuine, navigable Recovery Routing destination, confirmed by
  reading `RecoveryIntelligenceHub.tsx`'s own use of
  `MODULE_TARGET_TAB`/`moduleDisplayName` to turn a `selectedModule`
  string into a real "go here" action.
- **Decision: supported, registered.** Added
  `energy_delta: 'RECOVER'` to `MODULE_ROUTE_MAP`,
  `energy_delta: 'Energy & Capacity'` to `MODULE_DISPLAY_NAMES`, and
  `energy_delta: 'recover'` to `MODULE_TARGET_TAB` — the smallest
  possible change (one line in each of two existing `Record<string, ...>`
  literals). Verified purely additive via `grep -n "'energy_delta'"`
  across the whole repo before the change: the only prior occurrence was
  a wholly unrelated `PatternEscalationRoute` literal in
  `anxiety-reset-engine.ts` (Anxiety Reset's own internal pattern-
  escalation vocabulary, a different type, never read by Recovery
  Routing) — no existing candidate-builder function in
  `recovery-signal-candidates.ts` had ever produced `sourceModule:
  'energy_delta'` before this change, so no existing route's behaviour
  changed. `recovery-signal-candidates.test.ts`,
  `recovery-decision-copy.test.ts`, and `recovery-routing-engine.test.ts`
  all pass unmodified, confirming this.
- `nhei-recovery-bridge.ts`'s `ruleRecoveryFoundationLow` now targets
  `energy_delta` directly — the directive's own literal wording ("energy
  and recovery management questions") is Energy Delta's purpose, not
  Recovery Fuel's. **`recovery_fuel` is never substituted in disguise**:
  it is offered only as an `alternativeModules` entry, and only because
  it genuinely, independently matches the same Physical-dimension signal
  through its own real role in the live pipeline — the directive's §3
  instruction ("do not automatically substitute Recovery Fuel for
  energy-planning requests unless Recovery Fuel independently matches
  the user's stated goal") is satisfied by this being a real, separate
  match, not a renamed substitute.

## 6. Implemented user-agency actions

`nhei-recovery-interaction-contract.ts` — six real, tested state
transitions over `NheiRecoveryInteractionState`, built as a pure reducer:

| Action | Effect | Test |
|---|---|---|
| `accept` | Switches `selectedSuggestionId` to the accepted id (works for the default pick or any alternative) | "switches selection to an accepted alternative" |
| `dismiss` | Adds to `dismissedSuggestionIds`; clears selection if the dismissed id was selected | "clears selection when the currently-selected suggestion is dismissed" |
| `explain` | Adds to `explainedSuggestionIds`; never changes selection | "records that an explanation was requested without changing the selection" |
| `view_alternative` | Sets `viewedAlternativeId`; never changes selection (browsing only) | "records which alternative is being viewed without changing the selection" |
| `correct_interpretation` | Adds to `correctedSuggestionIds` by id only; optional `note` is never stored anywhere in state | "the optional note is never stored as raw content anywhere in state" |
| `decline_all` | Sets `declinedAll: true`, clears selection; distinct from dismissing each one individually | "clears the selection and sets declinedAll, with no suggestion-specific penalty" |

An action referencing an unknown suggestion id is a no-op flagged via
`lastActionRejectedReason: 'unknown_suggestion_id'` — never a thrown
error, never silently accepted.

**No automatic persistence as psychological evidence**: this file
imports nothing from `nhei-persistence-service.ts` or any Firestore
client — there is no code path capable of writing anything, so a
correction can never become an `NheiEvidenceRecord`.

**No interpretation of rejection as resistance, noncompliance, or a
trait**: `dismissedSuggestionIds`/`declinedAll` are plain, unscored,
session-scoped arrays/booleans; nothing counts occurrences across
sessions or feeds any other engine. Tested directly ("a dismissal never
carries a resistance score, penalty, or trait field of any kind").

**No automatic navigation, message sending, calendar modification, or
Guardian communication**: this file imports nothing from
`guardian-alert.ts`, any calendar module, any messaging code, React, or
`window` — structurally incapable of any such side effect, not merely
documented not to do one.

15 tests cover every action, the unknown-id rejection path, non-mutation
of input state, and determinism.

## 7. Temporal/episode integrity verification

Reviewed `nhei-adaptive-behaviour-engine.ts`'s `detectBehaviouralPatterns`
and `nhei-temporal-engine.ts`'s `deriveRecurrenceRelations`/
`deriveRelationBetween` directly. Finding:

- `detectBehaviouralPatterns`'s `occurrenceCount` counts relation pairs
  of type **`SEQUENCE` or `RECURRENCE`** (not `RECURRENCE` alone).
- `deriveRecurrenceRelations` (the function Phase 3C-2A built to fix
  exactly this class of bug) is correctly episode-aware — it counts
  *distinct episodes* via `episodeKeyOf`, and a single episode's own
  internal records can never register as a `RECURRENCE` of each other.
  **This part of the pipeline is already correct and untouched.**
- However, `deriveRelationBetween` (a separate, standalone pairwise
  function) can produce a bare `SEQUENCE` relation between any two
  chronologically-ordered records **with no episode-distinctness
  requirement at all** — two tagged facets of one single reported
  experience, if ever fed through this function and into
  `detectBehaviouralPatterns`, could in principle contribute to
  `occurrenceCount >= 2` without being a genuine second episode.
- **In today's real pipeline this is not currently exploitable**:
  `nhei-persistence-service.ts`'s `readNheiTemporalView` — the only
  real-pipeline producer of the `relations` array
  `detectBehaviouralPatterns` ever receives — calls only
  `deriveRecurrenceRelations` (always episode-aware) plus persisted
  asserted-influence relations (a different relation type,
  `detectBehaviouralPatterns`'s own filter already requires
  `SEQUENCE`/`RECURRENCE`, which asserted influences never are). So
  every `NheiBehaviouralPattern.relationTypesObserved` produced by the
  real pipeline today is `['RECURRENCE']` only.
- **Fix applied as defense-in-depth at this file's own reading point,
  not as an edit to the upstream engines**: every rule in
  `nhei-recovery-bridge.ts` that reads
  `NheiBehaviouralPattern.occurrenceCount` (`ruleBoundaryRelated`,
  `ruleActionWithStatedGoal`, `ruleGeneralRepeatedPattern`) now
  additionally requires `relationTypesObserved.includes('RECURRENCE')`
  via a new `isGenuineCrossEpisodeRecurrence` helper. This changes no
  real-pipeline suggestion today (since real patterns already only ever
  carry `RECURRENCE`), but makes the guarantee structural at this file's
  own boundary rather than inherited by accident from one particular
  caller's current behaviour.
- **Other distinctions verified intact**: user-reported facts
  (`confirmedInterpretations`), tentative interpretations
  (`openHypotheses`), and third-party communications
  (`PERCEIVED_RECEIVED_SELF` vs `RELATIONAL_SELF`, never conflated by any
  rule) remain separate throughout the bridge — unchanged from Phase 4,
  re-verified this phase by re-reading every rule. No rule makes a causal
  claim without `causalClaim: false`-backed evidence (the Adaptive
  Behaviour engine's own hard-coded guarantee, never overridden). No rule
  upgrades a tentative interpretation to confirmed as a result of a
  suggestion being produced — `interpretationKind` is computed once, from
  input evidence alone, with zero feedback path from arbitration or
  interaction back into the bridge; proven directly by
  `nhei-recovery-bridge.test.ts`'s new "interpretationKind is never
  upgraded post-hoc" tests (calling the bridge twice/thrice on identical
  input yields identical kinds).

9 new/updated tests in `nhei-recovery-bridge.test.ts` cover: a
SEQUENCE-only pattern failing to trigger each of the three affected
rules (including with a stated ACT goal present), a RECURRENCE pattern
correctly triggering, a mixed SEQUENCE+RECURRENCE pattern still counting
as genuine, and interpretationKind stability.

## 8. Synthetic end-to-end results

`nhei-recovery-e2e.test.ts` chains all four pure stages — bridge →
arbitration → interaction-state init → simulated user action — across 15
`describe` blocks covering every scenario this directive named:

| Scenario | Result |
|---|---|
| Low capacity | A heavier-effort suggestion is correctly excluded from the default pick; abstains with `all_unsuitable_for_capacity` when it's the only candidate. **Pass.** |
| Unknown capacity | Selection proceeds, correctly labelled `'unknown'`, never guessed. **Pass.** |
| Multiple conflicting suggestions | Two suggestions for the same `RouteType` (`reset_studio`/`anxiety_reset`, both `STABILISE`) are reconciled to one winner; the loser is in `dedupedAway`. **Pass.** |
| Separate vs same-episode recurrence | A `SEQUENCE`-only pattern never reaches selection; a genuine `RECURRENCE` pattern does. **Pass.** |
| User correction | Recorded by id, selection unchanged, note text never appears anywhere in the resulting state. **Pass.** |
| User dismissal | Clears selection; `decline_all` is a distinct, real outcome with no penalty field. **Pass.** |
| No suitable intervention | Abstains honestly (`all_unsuitable_for_capacity`) rather than forcing a bad default. **Pass.** |
| Consent denied | Blocked before arbitration ever sees a candidate (`no_candidates`). **Pass.** |
| Safeguarding denied | Identically blocked. **Pass.** |
| Unsupported/unavailable destination | Excluded via `unavailableModules`; falls back to a genuinely different alternative when one exists, abstains honestly (`all_targets_unavailable`) when it doesn't — never invents a substitute. **Pass.** |
| Clear stated goal + insufficient evidence | The evidence threshold still wins; a stated goal never overrides `insufficientEvidence`. **Pass.** |
| Multiple possible pathways | Real, distinct alternatives survive to the user alongside the selection. **Pass.** |
| (structural) Never a command | Every stage's output is inert data — no `navigate`/`execute`/`launch` field anywhere in the chain. **Pass.** |

Plus two direct demonstrations of "the system chooses and respects user
actions correctly," not merely producing candidates: E2E 1/2 run a full
accept/explain-then-accept cycle through the real interaction reducer on
top of a real arbitration result.

19/19 tests pass.

## 9. Regression counts

Phase 4's own verified baseline: **288 test files / 3940 tests.**

This phase's ending state (commit `05a4936`), full `npx vitest run`:
**293 test files / 4011 tests — all passing.** (+5 files, +71 tests: the
5 new Phase 4B files above, plus net +24 in `nhei-recovery-bridge.test.ts`
from the Energy Delta re-targeting and the recurrence-hardening tests
replacing/extending the Phase 4 originals.)

- `npx tsc --noEmit`: zero errors.
- `npx eslint` on every new/changed file: zero errors.
- **Recovery Routing regression**: `recovery-routing-engine.test.ts`,
  `recovery-capacity-gate.test.ts`, `recovery-signal-candidates.test.ts`,
  `recovery-decision-copy.test.ts` — all pass.
- **NHEI temporal/consent regression**: `nhei-context-integration.test.ts`,
  `nhei-consent.test.ts`, `nhei-safeguarding-contract.test.ts`,
  `nhei-temporal-engine.test.ts`, `nhei-adaptive-behaviour-engine.test.ts` —
  all pass, confirming the episode-recurrence fix was applied at the
  bridge's reading point without touching (or needing to touch) these
  upstream files.
- **Knowledge-governance regression**: all 15 `nhei-knowledge-*.test.ts`
  files — all pass, unmodified.
- **Nova safety regression**: `nova-chat-safety.route.test.ts` — passes,
  unmodified.
- **Guardian regression**: all 6 `guardian-*.test.ts`/
  `guardian-*.route.test.ts` files — all pass, unmodified.
- Combined named-category run (37 files, 530 tests) executed together as
  a single check: all pass.
- **Real-model/Firestore-emulator verification**: honestly not attempted
  — none of this phase's new code makes a model call, and
  `nhei-recovery-orchestration.test.ts` uses the same in-memory fake
  `FirestoreLike` pattern already established by
  `nhei-context-integration.test.ts`, not a real emulator (no emulator
  is available in this environment, consistent with every prior phase's
  own honest statement of this gap). Nothing here claims otherwise.
- No existing test was weakened, skipped, or modified to obtain a pass.

## 10. Outstanding independent reviews and release blockers

Tracked in `docs/NHEI_RELEASE_BLOCKERS.md` items 12–17 (12–16 carried
over from Phase 4, updated where this phase changed their status; 17 is
new):

- Item 12 (bridge wiring): unchanged, still not started.
- Item 13 (`routing_insights` consent UI): unchanged, still not started.
- Item 14 (independent safeguarding system): unchanged, still blocks
  everything in this phase identically — `orchestrateNheiRecoveryRequest`
  inherits this exact dependency, not a new one.
- Item 15 (Energy Delta registration): **engineering resolved this
  phase**; the product-level question of whether this registration is
  the right long-term choice has not been reviewed by anyone with
  product authority.
- Item 16 (independent human review of suggestion text): **preparation
  added this phase** (`nhei-recovery-suggestion-review-register.ts`);
  the actual review by a qualified human has still not happened.
- Item 17 (new): wiring `nhei-recovery-arbitration.ts`,
  `nhei-recovery-orchestration.ts`, and
  `nhei-recovery-interaction-contract.ts` into any real route or UI —
  not started; all three remain zero-call-site pure/composition files.

## 11. Explicit Phase 5 engineering readiness decision

**Not ready. This phase does not propose Phase 5 begin.**

What this phase adds does not shorten the list of real-world
prerequisites — it only makes their eventual target a concrete, fully
tested set of contracts instead of an abstract idea. Specifically still
missing before any live wiring could be responsibly proposed:

1. The independent safeguarding layer itself (no engineering decision in
   this codebase can substitute for it — `UNINTEGRATED_SAFEGUARDING_GATE`
   remains the only implementation, and every orchestration call still
   fails closed through it).
2. A real `routing_insights` consent-granting UI.
3. Actual human (product/clinical/safeguarding) review of the suggestion
   text — this phase prepared the material for that review, not the
   review itself.
4. A product-authority decision on the Energy Delta registration as a
   long-term choice, not just an engineering verification that it's safe
   to register.
5. A decision on where, in a real route, `orchestrateNheiRecoveryRequest`
   would actually be called, and how its output would reach a real user
   interface — not attempted or assumed here.

Stop after this Phase 4B implementation batch, per the directive.
