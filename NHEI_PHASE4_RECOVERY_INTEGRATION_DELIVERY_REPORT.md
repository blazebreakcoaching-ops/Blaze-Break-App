# NHEI Phase 4 — Recovery Intelligence Integration: Delivery Report

Branch: `claude/nhei-phase-1`. This batch is **offline engineering only**.
Nothing delivered here is merged into `main`, deployed, feature-flagged
on, wired into any live Nova route, or connected to Guardian notification.
Those remain explicit, separate, future approvals.

## 1. Existing recovery-system audit

| Capability | Status | Notes |
|---|---|---|
| Recovery Routing Engine (`recovery-routing-engine.ts`) | **Operational** | `selectRoute`/`InterventionCandidate`/`RouteType` — this phase imports but never edits it. |
| Recovery signal candidates (`recovery-signal-candidates.ts`) | **Operational** | `MODULE_ROUTE_MAP`/`isKnownRoutingModule` reused directly; this phase never edits it. |
| Recovery Capacity Gate (`recovery-capacity-gate.ts`) | **Operational** | `BandwidthBand`/`isEffortWithinBandwidth` reused directly; `band === null` discipline preserved, never edited. |
| Energy Delta Management (`energy-delta-engine.ts` + `EnergyBudget.tsx`) | **Operational as a standalone feature, NOT routable** | **Audit finding**: no entry in `MODULE_ROUTE_MAP`. Reachable only via its own page today, never through Recovery Routing. See section 5. |
| Reset Studio (`reset-studio-engine.ts` + sub-tools) | **Operational** | Routable via `reset_studio` (STABILISE). |
| Anxiety Reset (`anxiety-reset-engine.ts`) | **Operational** | Routable via `anxiety_reset` (STABILISE). |
| Boundary Architect / Capacity Firewall (`boundary-contract-engine.ts`, `boundary-pushback-engine.ts`, `boundary-outcome-engine.ts`, `my-boundaries-engine.ts`, `capacity-firewall-engine.ts`) | **Operational** | Routable via `boundary_architect` / `capacity_firewall` (PROTECT). |
| Action Engine (`action-engine.ts`) | **Operational** | Routable via `action_engine` (ACT). |
| Recovery Fuel Engine (`recovery-fuel-coach.ts`, `recovery-fuel-patterns.ts`) | **Operational** | Routable via `recovery_fuel` (RECOVER). |
| Nova coaching/conversational modules (`server.ts`'s `/api/nova/chat`, `nhei-nova-chat-educational-integration.ts`) | **Operational for general chat; NHEI's only live integration is the Educational Mode addendum** | Re-confirmed this phase by re-reading `server.ts`'s live NHEI call site: `buildNheiEducationalChatAddendum` is the only NHEI function any live route calls, gated by both `NHEI_EDUCATIONAL_MODE_ENABLED` and the Firestore governance doc (both off). |

No route or deep link was invented anywhere in this audit or the
implementation that follows it — every `targetModule` the bridge can
emit is checked against the real `MODULE_ROUTE_MAP` via
`isKnownRoutingModule` before a suggestion is built, and the one gap
found (Energy Delta) is substituted honestly rather than papered over.

## 2. Files created and modified

Created (none existed before this phase):

- `nhei-recovery-bridge-types.ts` — the typed contract
  (`NheiRecoveryBridgeInput`, `NheiRecoverySuggestion`,
  `NheiRecoveryBridgeResult`, and supporting types). Types only, no logic.
- `nhei-recovery-bridge.ts` — `buildNheiRecoverySuggestions`, the pure
  function implementing the bridge, plus six independent mapping-rule
  functions and a shared finishing helper.
- `nhei-recovery-bridge.test.ts` — 26 tests: fail-closed gates, all 16
  named synthetic scenarios, capacity-suitability, candidate
  cross-referencing, and the Energy Delta finding.
- `NHEI_PHASE4_RECOVERY_INTEGRATION_DELIVERY_REPORT.md` — this report.

Modified:

- `docs/NHEI_ARCHITECTURE.md` — new "Recovery Intelligence Bridge (Phase
  4, offline/unwired today)" section.
- `docs/NHEI_RELEASE_BLOCKERS.md` — new "Blocking the Recovery
  Intelligence Bridge (Phase 4)" section, items 12–16.

Nothing else in the codebase was touched. In particular,
`recovery-routing-engine.ts`, `recovery-capacity-gate.ts`,
`recovery-signal-candidates.ts`, `server.ts`, every `nhei-knowledge-*.ts`
file, every `guardian-*.ts` file, and every `.tsx` file are byte-for-byte
unchanged — confirmed via `git status`/`git diff` showing only the files
listed above.

## 3. Integration architecture

`nhei-recovery-bridge.ts` mirrors `recovery-signal-candidates.ts`'s own
architecture exactly: independent builder functions, each returning a
suggestion or `null`, combined by filtering — the choice between
multiple results is left to a future consumer, the same way `selectRoute`
(not `buildSignalCandidates`) arbitrates between `InterventionCandidate`s.
A shared `finishSuggestion` helper (called by every rule) verifies the
target module via `isKnownRoutingModule`, cross-checks it against
`MODULE_ROUTE_MAP`'s own route-type assignment, computes capacity
suitability, checks the stated-goal match, and cross-references any
existing Recovery Routing candidate for the same route — so no individual
rule can emit a structurally inconsistent suggestion. The function is
synchronous and side-effect-free: no Firestore, no React, no model call,
and no import of `server.ts` or any route file — confirmed by `grep -rl
"nhei-recovery-bridge"` returning only the three files this phase created.

## 4. Recovery recommendation contract

**Input** (`NheiRecoveryBridgeInput`): the existing
`NheiPersonalContextSummary` (self-system activity, dimension activity,
behavioural patterns, confirmed interpretations, open hypotheses — all
already interpreted upstream by Phase 1's engines); an optional
user-stated goal in existing `RouteType`/`BandwidthBand` vocabulary; the
existing capacity band (`null` is a real, legitimate value, never
defaulted); any Recovery Routing candidates already generated
independently for the same turn; the caller's own
`isNheiPurposeConsented(state, 'routing_insights')` result (the
Phase-2-reserved consent purpose this phase implements); and the full
`NheiSafeguardingClearance` object (not a bare boolean).

**Output** (`NheiRecoveryBridgeResult`): zero or more
`NheiRecoverySuggestion` objects — each inspectable data, never an
execution command, no deep link, no "run this" method — carrying the
relevant recovery capability (`targetModule`/`relevantCapabilityLabel`/
`routeType`), a plain-language reason (`reason`) and fuller user-facing
explanation (`explanationForUser`), evidence-record IDs only
(`evidenceReferences`, never raw content), self-systems/dimensions, a
`confirmed | tentative | educational` interpretation-kind flag, safety
restrictions (`safetyRestrictions`), the fixed `routing_insights` consent
prerequisite, a `suitable | unsuitable | unknown` capacity-suitability
flag, whether the suggestion matches a stated goal, a cross-reference to
any existing Recovery Routing candidate for the same route, and
alternative modules — or an explicit `NheiRecoveryNoSuggestionReason`
(`consent_not_granted | safeguarding_not_cleared | insufficient_evidence
| no_relevant_pattern`) when nothing fires. Never silence.

## 5. Mapping decisions and evidence limitations

| Directive's named example | Implemented as | Verified via `isKnownRoutingModule`? |
|---|---|---|
| Boundary-related experiences → Boundary Architect | `ruleBoundaryRelated`: a recurring (≥2-occurrence) Relational-Self behavioural pattern → `boundary_architect` (PROTECT) | Yes |
| Settling difficulty → Reset Studio | `ruleDifficultySettling`: confirmed Emotional-dimension evidence (quality ≥ medium) → `reset_studio` (STABILISE) | Yes |
| Stress + grounding need → short reset | `ruleShortGroundingRequest`: explicit `preferredEffort: 'low_bandwidth'` + any Emotional signal → `anxiety_reset` (STABILISE, low-bandwidth only) | Yes |
| Action paralysis + stated goal → Action Engine | `ruleActionWithStatedGoal`: explicit `preferredRouteType: 'ACT'` + a recurring pattern → `action_engine` (ACT) — **never fires on pattern evidence alone** | Yes |
| Energy/recovery management → Energy Delta Management | **Not implemented as stated — audit finding.** `energy_delta` has no `MODULE_ROUTE_MAP` entry; it is reachable today only as `EnergyBudget.tsx`'s own standalone page. `ruleRecoveryFoundationLow` targets `recovery_fuel` (RECOVER) instead for Physical-dimension evidence — the nearest verified, routable module addressing the same depleted-foundation signal. | `recovery_fuel`: yes. `energy_delta`: confirmed absent — this phase never adds it, since that would require editing `recovery-signal-candidates.ts`, out of scope here. |
| (general case) | `ruleGeneralRepeatedPattern`: any other recurring pattern → `my_patterns` (UNDERSTAND) | Yes |

**Evidence limitations deliberately built in, not overlooked**: a single
relational anecdote never produces a boundary suggestion — the rule
requires the Adaptive Behaviour engine's own ≥2-occurrence pattern
threshold. Confirmed-interpretation-based rules require evidence quality
of `medium` or `high`; `low`/`unknown`-quality evidence alone never
triggers a `confirmed`-kind suggestion (tested directly — scenario 11).
Every rule is treated as a *candidate for validation*, not a
deterministic guarantee: `matchesStatedGoal` and `capacitySuitability`
are informational fields a future consumer reads, never used internally
to silently drop or auto-select a suggestion. No suggestion ever
auto-navigates or launches a tool.

## 6. Capacity-sensitive behaviour

The bridge imports `isEffortWithinBandwidth`/`BandwidthBand` from
`recovery-capacity-gate.ts` and edits nothing in that file.
`capacityBand: null` (no reliable information) always yields
`capacitySuitability: 'unknown'` — never defaulted to `'suitable'` or
`'unsuitable'` — tested directly in `nhei-recovery-bridge.test.ts`'s
"capacity suitability — never invents a score" block, which also proves
the real-band suitable/unsuitable split against
`isEffortWithinBandwidth`'s own real behaviour, not a reimplementation of
it. A user's explicit short-effort request (`preferredEffort:
'low_bandwidth'`) is required, not inferred, before the short-reset rule
fires, and the Action Engine rule requires an explicit `'ACT'` goal
before ever suggesting extended work. No new psychological capacity
scoring system was built.

## 7. User-agency controls

Every suggestion carries both a short `reason` and a fuller
`explanationForUser` written to name what evidence it draws on and that
it is a suggestion, not a settled fact. An explicit no-recommendation
outcome is a first-class result (`noSuggestionReason`), tested directly
for the "no relevant evidence" and "disagreement with interpretation"
scenarios. Nothing in this file's types or logic represents "declined" or
"resistant" state — there is no field to set and no behavior that would
treat a past decline differently from a first suggestion (tested
directly: the output shape is asserted to have no
`wasDeclinedBefore`/`resistanceScore` property). `alternativeModules` on
every suggestion surfaces other valid, verified options rather than
presenting one choice as final.

## 8. Safety and consent boundaries

`buildNheiRecoverySuggestions` checks, in this order, before any mapping
rule runs: (1) `routingInsightsConsented` — false yields
`consent_not_granted`; (2) `safeguardingClearance.cleared` — false yields
`safeguarding_not_cleared`; (3) `contextSummary.insufficientEvidence` —
true yields `insufficient_evidence`. The safeguarding input is the full
`NheiSafeguardingClearance` discriminated union, not a bare boolean, so a
caller cannot accidentally pass `true` without an `ageBand` — and since
`UNINTEGRATED_SAFEGUARDING_GATE` (the only implementation that exists)
always returns `cleared: false`, every real invocation today — if this
were ever wired in — would stop at `safeguarding_not_cleared`
unconditionally. This is intentional and tested. No real conversation
text is extracted anywhere in this file — its only input is the
already-built `NheiPersonalContextSummary`. No Guardian notification code
is imported or called. No new Firestore collection, document, or field is
written by this phase — `nhei-recovery-bridge.ts` performs zero I/O of
any kind. Existing Nova safety floor and Guardian Alert code are
untouched (see section 10). Knowledge/content governance is likewise
untouched: this file imports no knowledge-retrieval, approval, or review
code beyond the `NheiKnowledgeSafetyRestriction` type (for labelling
only); the 13 knowledge entries' review status is completely unaffected,
and nothing here promotes draft content or bypasses review. No SHIP,
BLAME, R³, or Trifecta framework is referenced or implied to have
clinical validation anywhere in this file.

## 9. Synthetic scenario results

All 16 named scenarios from the directive are implemented as explicit
tests in `nhei-recovery-bridge.test.ts`:

1. Leave-guilt/difficulty resting → confirmed suggestion, no causal story invented. **Pass.**
2. Workplace boundary request pattern → Boundary Architect, with third-party-belief restriction. **Pass.**
3. Overload + explicit short-action request → Anxiety Reset only, never Action Engine. **Pass.**
4. Unexplained fatigue, no established cause → tentative Recovery Fuel suggestion, no cause asserted. **Pass.**
5. A single difficult relationship interaction (no recurrence) → no boundary suggestion. **Pass.**
6. Improved outcome report → no suggestion overpromises continued improvement. **Pass.**
7. Disagreement with interpretation (disputed evidence absent upstream) → `no_relevant_pattern`, nothing re-asserted. **Pass.**
8. Rejected recommendation → no resistance/penalty field exists on the output shape. **Pass.**
9. No relevant NHEI evidence → explicit `no_relevant_pattern`. **Pass.**
10. Multiple possible pathways → multiple suggestions returned; ACT never wins by default. **Pass.**
11. Contradictory/low-quality evidence only → no `confirmed`-kind suggestion. **Pass.**
12. Repeated episodes with a stated goal → Action Engine fires correctly. **Pass.**
13. Youth-appropriate interactions → `ageBand` carried through from safeguarding clearance untouched. **Pass.**
14. Missing consent, strong evidence present → fails closed on consent regardless. **Pass.**
15. Safeguarding gate denial, strong evidence present → fails closed on safeguarding regardless. **Pass.**
16. Unavailable/removed tool → structurally impossible to emit (every suggestion re-verified against `isKnownRoutingModule`). **Pass.**

No invented causation, no promised outcome, no overridden user choice,
and no suggestion naming a capability that does not exist in
`MODULE_ROUTE_MAP` was observed in any scenario — 26/26 tests pass.

## 10. Full regression results

Re-run at the time of this report (not merely reused from the prior
pass), on an unmodified tree (confirmed via `git status --porcelain`
showing no pending changes before the run):

- **Full Vitest suite**: 3940 tests across 288 files, all passing.
- **TypeScript**: `npx tsc --noEmit` — zero errors.
- **Lint**: `npx eslint` on all three new files — zero errors (one
  unused-import warning found and fixed during the original batch).
- **Recovery Routing regression**: `recovery-routing-engine.test.ts`,
  `recovery-capacity-gate.test.ts`, `recovery-signal-candidates.test.ts`
  — pass, unmodified by this phase.
- **NHEI intelligence regression**: `nhei-context-integration.test.ts`,
  `nhei-consent.test.ts`, `nhei-safeguarding-contract.test.ts` — pass,
  unmodified by this phase.
- **Knowledge-governance regression**: all 15 `nhei-knowledge-*.test.ts`
  files (194 tests) — pass, unmodified by this phase.
- **Nova-safety regression**: `nova-chat-safety.route.test.ts` — passes,
  unmodified by this phase.
- **Guardian regression**: `guardian-alert.test.ts`,
  `guardian-alert.route.test.ts`, `guardian-copy-safety.test.ts`,
  `guardian-support-invitation.test.ts`,
  `guardian-support-invitation.route.test.ts`,
  `guardian-support-catch-blocks.route.test.ts` — pass, unmodified by this
  phase.
- **Real-model/emulator verification**: honestly not attempted and not
  applicable to this phase's deliverable — `nhei-recovery-bridge.ts`
  makes no model call and no Firestore access of any kind, so there is
  nothing in it a real-model or emulator run could exercise beyond what
  the deterministic unit tests above already cover completely.
- No existing test was weakened, skipped, or modified to obtain a pass.

## 11. Remaining Phase 4 work

- Wiring `buildNheiRecoverySuggestions` into any real conversation turn,
  including deciding where in `server.ts` it would be called and how its
  output would actually reach a user — a separate, future approval, not
  started.
- A user-facing consent UI for `routing_insights`, matching the
  still-missing UI for `reflection_storage`/`longitudinal_tracking` — not
  started.
- The real, independent safeguarding layer
  (`UNINTEGRATED_SAFEGUARDING_GATE` remains the only implementation; this
  bridge inherits that exact dependency, not a new one) — not started.
- Independent human/product/clinical review of the suggestion text this
  phase wrote (`reason`/`explanationForUser`), including youth-appropriate
  phrasing — this phase unit-tested tone only, not a real qualified
  review — not started.
- A product decision on whether Energy Delta Management should ever
  become a routable Recovery Routing module — out of scope for this
  phase, which never edits `recovery-signal-candidates.ts` — not started.

## 12. Phase 5 readiness assessment

**Not ready, and this phase does not propose Phase 5 begin.** The bridge
itself is complete, tested, and internally consistent, but every
prerequisite for taking it live is still outstanding:

- No wiring exists or was attempted — `buildNheiRecoverySuggestions` has
  literally no caller.
- The safeguarding dependency this bridge takes as a required input
  (`NheiSafeguardingClearance`) has no real implementation anywhere in
  this codebase — only the fail-closed placeholder. Any future phase that
  wires this bridge in would get `safeguarding_not_cleared` for every
  real user, which is correct and intentional, not a bug — but it also
  means the bridge cannot produce a real suggestion for a real user until
  that independent layer is built by a qualified reviewer, which is
  explicitly outside this phase's authority.
- The `routing_insights` consent purpose has no consent-granting UI, so
  even with safeguarding solved, no real user could legally be considered
  to have consented to this feature today.
- The suggestion text has had no independent human, product, clinical,
  or youth-safeguarding review — only automated tone assertions in unit
  tests.
- The Energy Delta Management substitution (recovery_fuel in its place)
  is an honest audit finding, not a product decision; whether that
  tradeoff is acceptable for a real release has not been decided by
  anyone with product authority.

Given these, a future Phase 5 (if ever authorised) should be scoped as
"resolve the Phase 4 prerequisites above," not "wire the bridge in" — the
engineering in this phase does not shorten the safeguarding/consent/
review work; it only makes that work's target a concrete, tested
contract instead of an abstract idea.

## 13. Unresolved human-review and release requirements

(Cross-referenced in `docs/NHEI_RELEASE_BLOCKERS.md` items 12–16, added
this phase.)

1. A real, named, qualified human must build the independent
   safeguarding layer before this bridge's `safeguardingClearance` input
   can ever be `cleared: true` for a real user — not an engineering
   decision.
2. A product/legal decision-maker must approve a `routing_insights`
   consent-granting UI design and copy before any real user could be
   considered consented.
3. A product/clinical reviewer must read every `reason`/
   `explanationForUser` string this phase wrote as a real user —
   including a youth user — would read it, and approve or revise it. This
   phase's own unit tests check tone mechanically (no causal language, no
   promised outcomes); they are not a substitute for that review.
4. A product/engineering decision-maker must decide whether substituting
   `recovery_fuel` for the unroutable Energy Delta Management module is
   acceptable long-term, or whether Energy Delta should instead be added
   to `recovery-signal-candidates.ts`'s `MODULE_ROUTE_MAP` — a decision
   this phase explicitly leaves open rather than making unilaterally.
5. Whoever authorises wiring this bridge into a live route in a future
   phase must independently re-verify every item above is actually
   resolved at that time, not assume this report's "offline, tested"
   status implies readiness — it does not.

---

Stop after this Phase 4 implementation batch, per the directive. Phase 5
is not begun.
