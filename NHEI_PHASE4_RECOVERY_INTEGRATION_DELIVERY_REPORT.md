# NHEI Phase 4 — Recovery Intelligence Integration: Delivery Report

Branch: `claude/nhei-phase-1`. This batch is **offline engineering only**.
Nothing delivered here is merged into `main`, deployed, feature-flagged
on, wired into any live Nova route, or connected to Guardian notification.
Those remain explicit, separate, future approvals.

## 1. Primary objective

Connect NHEI's already-interpreted output to Blaze Break's **existing**
Recovery Routing, capacity, and action systems — not rebuild any of them.
Delivered as `nhei-recovery-bridge-types.ts` (the typed contract) and
`nhei-recovery-bridge.ts` (`buildNheiRecoverySuggestions`, the pure
function implementing it). The bridge:

- Is evidence-aware: every suggestion carries `evidenceReferences`
  (record IDs only, never raw content) and is built only from the
  existing, already-interpreted `NheiPersonalContextSummary`.
- Is capacity-sensitive: reuses `isEffortWithinBandwidth`/`BandwidthBand`
  from `recovery-capacity-gate.ts` without modifying that file.
- Is non-diagnostic: every suggestion's `safetyRestrictions` draws from
  the existing `NheiKnowledgeSafetyRestriction` vocabulary
  (`not_diagnostic` on every rule), and no rule asserts a cause.
- Is uncertainty-transparent: `interpretationKind` is
  `confirmed | tentative | educational`, and capacity suitability is
  `suitable | unsuitable | unknown` — `unknown` is a real, structurally
  forced value, never defaulted to a guess.
- Does not rebuild anything: no new routing arbitration, no new capacity
  model, no new consent mechanism — see section 2's audit for what was
  reused vs. what had to be substituted and why.

## 2. Audit of existing recovery capabilities

| Capability | Status | Notes |
|---|---|---|
| Recovery Routing Engine (`recovery-routing-engine.ts`) | **Operational** | `selectRoute`/`InterventionCandidate`/`RouteType` — this phase imports but never edits it. |
| Recovery signal candidates (`recovery-signal-candidates.ts`) | **Operational** | `MODULE_ROUTE_MAP`/`isKnownRoutingModule` reused directly; this phase never edits it. |
| Recovery Capacity Gate (`recovery-capacity-gate.ts`) | **Operational** | `BandwidthBand`/`isEffortWithinBandwidth` reused directly; `band === null` discipline preserved, never edited. |
| Energy Delta Management (`energy-delta-engine.ts` + `EnergyBudget.tsx`) | **Operational as a standalone feature, NOT routable** | **Audit finding**: no entry in `MODULE_ROUTE_MAP`. Reachable only via its own page today, never through Recovery Routing. The bridge's Physical-dimension rule targets `recovery_fuel` instead — see section 7. |
| Reset Studio (`reset-studio-engine.ts` + sub-tools) | **Operational** | Routable via `reset_studio` (STABILISE). |
| Anxiety Reset (`anxiety-reset-engine.ts`) | **Operational** | Routable via `anxiety_reset` (STABILISE). |
| Boundary Architect / Capacity Firewall (`boundary-contract-engine.ts`, `boundary-pushback-engine.ts`, `boundary-outcome-engine.ts`, `my-boundaries-engine.ts`, `capacity-firewall-engine.ts`) | **Operational** | Routable via `boundary_architect` / `capacity_firewall` (PROTECT). |
| Action Engine (`action-engine.ts`) | **Operational** | Routable via `action_engine` (ACT). |
| Recovery Fuel Engine (`recovery-fuel-coach.ts`, `recovery-fuel-patterns.ts`) | **Operational** | Routable via `recovery_fuel` (RECOVER). |
| Nova coaching/conversational modules (`server.ts`'s `/api/nova/chat`, `nhei-nova-chat-educational-integration.ts`) | **Operational for general chat; NHEI's only live integration is the Educational Mode addendum** | Confirmed by re-reading `server.ts`'s live NHEI call site this phase: `buildNheiEducationalChatAddendum` is the only NHEI function any live route calls, gated by both `NHEI_EDUCATIONAL_MODE_ENABLED` and the Firestore governance doc (both off). `nhei-recovery-bridge.ts` has no call site anywhere — confirmed by grep. |

No route or deep link was invented anywhere in this audit or the
implementation that follows it — every `targetModule` the bridge can
emit is checked against the real `MODULE_ROUTE_MAP` via
`isKnownRoutingModule` before a suggestion is built, and the one gap
found (Energy Delta) is substituted honestly, not papered over.

## 3. The NHEI-to-Recovery Bridge

`nhei-recovery-bridge-types.ts` defines `NheiRecoveryBridgeInput` (the
full input list the directive named: `contextSummary` carries self-system/
dimension associations, confirmed interpretations, open hypotheses, and
behavioural patterns with their evidence IDs and chronological
relations already resolved upstream; `userStatedGoal` for user-stated
goals; `capacityBand` for capacity signals; `existingRoutingCandidates`
for valid existing Recovery Routing candidates; `routingInsightsConsented`
and `safeguardingClearance` for consent/safeguarding) and
`NheiRecoveryBridgeResult` (zero or more `NheiRecoverySuggestion` —
structured, inspectable data only, never an execution command — each
carrying `relevantCapabilityLabel`, `reason`, `evidenceReferences`,
`interpretationKind` (confirmed/tentative/educational),
`safetyRestrictions`, `consentPrerequisite`, `capacitySuitability`; or an
explicit `noSuggestionReason`). `nhei-recovery-bridge.ts` implements
`buildNheiRecoverySuggestions`, mirroring `recovery-signal-candidates.ts`'s
own architecture exactly: independent builder functions, each returning a
suggestion or `null`, combined by filtering — the choice between multiple
results is left to a future consumer, the same way `selectRoute` (not
`buildSignalCandidates`) arbitrates between `InterventionCandidate`s.
Private evidence is never exposed beyond record IDs and the already-
summarised self-system/dimension tags the upstream `NheiPersonalContextSummary`
already carries — no raw content field exists anywhere in this file's
inputs or outputs.

## 4. Three-Self distinctness preserved

`selfSystems: SelfSystem[]` on every suggestion is a direct pass-through
of the upstream summary's own tagging (`INTERNAL_SELF` /
`RELATIONAL_SELF` / `PERCEIVED_RECEIVED_SELF`) — the bridge never merges,
re-derives, or re-interprets these. The one rule that reasons about
another person (`ruleBoundaryRelated`) carries
`never_assert_unreported_third_party_beliefs` in every suggestion it
produces, and its `explanationForUser` text was written and tested
(`not.toMatch(/because you felt guilty/i)` etc. in the test suite) to
avoid claiming to know anyone's private thoughts. A suggestion can and
does carry multiple self-systems when the upstream evidence spans them
(`Array.from(new Set(...))` unions across matched records) — this phase
never forces a single-self-system label onto multi-self-system evidence.

## 5. Four-Dimension distinctness preserved

`dimensions: Dimension[]` is likewise a direct pass-through. No rule
cross-attributes a dimension's difficulty to an unconfirmed cause: the
Physical-dimension rule's own `reason`/`explanationForUser` text
explicitly states "Nova doesn't know what's causing it, and isn't
claiming to," and the Emotional-dimension rule's text separates the
user-confirmed *tagging* from Nova's own *suggestion* ("that's confirmed,
not a guess. What it means for what might help is still Nova's own
suggestion"). No dimension is ever treated as a medical category — every
suggestion carries `not_diagnostic` in `safetyRestrictions`.

## 6. Capacity-sensitive recovery

The bridge imports `isEffortWithinBandwidth`/`BandwidthBand` from
`recovery-capacity-gate.ts` and edits nothing in that file. `capacityBand:
null` (no reliable information) always yields `capacitySuitability:
'unknown'` — never defaulted to `'suitable'` or `'unsuitable'` — tested
directly in `nhei-recovery-bridge.test.ts`'s "capacity suitability -
never invents a score" block, which also proves the real-band
suitable/unsuitable split against `isEffortWithinBandwidth`'s own real
behaviour, not a reimplementation of it. No new psychological capacity
scoring system was built.

## 7. Recovery matching — verified, not invented

| Directive's named example | Implemented as | Verified via `isKnownRoutingModule`? |
|---|---|---|
| Boundary-related experiences → Boundary Architect | `ruleBoundaryRelated`: a recurring (≥2-occurrence) Relational-Self behavioural pattern → `boundary_architect` (PROTECT) | Yes |
| Settling difficulty → Reset Studio | `ruleDifficultySettling`: confirmed Emotional-dimension evidence (quality ≥ medium) → `reset_studio` (STABILISE) | Yes |
| Stress + grounding need → short reset | `ruleShortGroundingRequest`: explicit `preferredEffort: 'low_bandwidth'` + any Emotional signal → `anxiety_reset` (STABILISE, low-bandwidth only) | Yes |
| Action paralysis + stated goal → Action Engine | `ruleActionWithStatedGoal`: explicit `preferredRouteType: 'ACT'` + a recurring pattern → `action_engine` (ACT) — **never fires on pattern evidence alone** | Yes |
| Energy/recovery management → Energy Delta Management | **Not implemented as stated — audit finding.** `energy_delta` has no `MODULE_ROUTE_MAP` entry. `ruleRecoveryFoundationLow` targets `recovery_fuel` (RECOVER) instead for Physical-dimension evidence, the nearest verified, routable module addressing the same depleted-foundation signal. | `recovery_fuel`: yes. `energy_delta`: confirmed absent — this phase never adds it, since that would require editing `recovery-signal-candidates.ts`, out of scope here. |
| (general case) | `ruleGeneralRepeatedPattern`: any other recurring pattern → `my_patterns` (UNDERSTAND) | Yes |

Every rule is explicitly treated as a *candidate for validation*, not a
deterministic guarantee: `matchesStatedGoal` and `capacitySuitability`
are informational fields a future consumer reads, never used internally
to silently drop or auto-select a suggestion. No suggestion ever auto-
navigates or launches a tool — every `NheiRecoverySuggestion` is inert
data; the nearest thing to an action in this file is a string field.

## 8. Explanation and user agency

Every suggestion carries both a short `reason` and a fuller
`explanationForUser` written to name what evidence it draws on and that
it is a suggestion, not a settled fact. An explicit no-recommendation
outcome is a first-class result (`noSuggestionReason`), tested directly
for the "no relevant evidence" and "disagreement with interpretation"
scenarios (tests 9 and 7). Nothing in this file's types or logic
represents "declined" or "resistant" state — there is no field to set
and no behavior that would treat a past decline differently from a first
suggestion (test 8 asserts no such property exists on the output shape).

## 9. Knowledge/content governance preserved

This phase touches no knowledge-retrieval, approval, or review code.
`nhei-recovery-bridge.ts` does not import `nhei-knowledge-retrieval-engine.ts`,
`nhei-knowledge-service.ts`, or any knowledge-content file beyond the
`NheiKnowledgeSafetyRestriction` *type* (reused for labelling, not for
triggering any knowledge lookup). All 15 knowledge-governance test files
(194 tests) pass unmodified — see section 14. The 13 knowledge entries'
review status is completely unaffected by this phase; this file never
promotes, approves, or reads knowledge-entry content.

## 10. Consent and safeguarding

`buildNheiRecoverySuggestions` checks, in this order, before any mapping
rule runs: (1) `routingInsightsConsented` — false yields
`consent_not_granted`; (2) `safeguardingClearance.cleared` — false yields
`safeguarding_not_cleared`; (3) `contextSummary.insufficientEvidence` —
true yields `insufficient_evidence`. The safeguarding input is the full
`NheiSafeguardingClearance` discriminated union from
`nhei-safeguarding-contract.ts`, not a bare boolean, so a caller cannot
accidentally pass `true` without the ageBand — and since
`UNINTEGRATED_SAFEGUARDING_GATE` (the only implementation that exists)
always returns `cleared: false`, every real invocation today — if this
were ever wired in — would stop at `safeguarding_not_cleared`
unconditionally. This is intentional and tested (`nhei-recovery-bridge.test.ts`,
"fail-closed gates" and scenario 15). No real conversation text is
extracted anywhere in this file — its only input is the already-built
`NheiPersonalContextSummary`. No Guardian notification code is imported
or called. No new Firestore collection, document, or field is written by
this phase — `nhei-recovery-bridge.ts` performs zero I/O of any kind.
Existing Nova safety floor and Guardian Alert code are untouched (see
section 14's regression results).

## 11. Synthetic acceptance scenarios

All 16 named scenarios from the directive are implemented as explicit
tests in `nhei-recovery-bridge.test.ts` (see that file's own section
comments for the full mapping of scenario number to test). Each proves
the property the directive asked for: no invented causation (tests 1, 4,
6), no promised outcome (test 6), no overridden choice (test 8 — no
resistance field exists to override with), no suggestion naming a
nonexistent capability (test 16, plus the "Energy Delta audit finding"
block). 26 tests total in this file, all passing.

## 12. Performance and integration contract

`buildNheiRecoverySuggestions` is synchronous, deterministic, and makes
zero network/Firestore/model calls — it is pure data transformation over
already-fetched, already-summarised inputs, consistent with "bounded
deterministic processing" and "avoid additional model calls." Each rule
function is independent and returns `null` rather than throwing on a
non-match, so one rule's absence of a signal cannot affect another's
result — the same error-isolation property `recovery-signal-candidates.ts`'s
own independent builder functions already have. The interface
(`NheiRecoveryBridgeInput`/`NheiRecoveryBridgeResult`) is route-independent
by construction: nothing in either type references `server.ts`, Express,
or any specific endpoint. Live Nova route behavior is unmodified — `grep`
confirms `nhei-recovery-bridge` has no import site anywhere in `server.ts`
or any `.tsx` file.

## 13. Documentation

- `docs/NHEI_ARCHITECTURE.md`: new "Recovery Intelligence Bridge (Phase
  4, offline/unwired today)" section — input/output shape, fail-closed
  order, all six mapping rules, the Energy Delta audit finding, the
  capacity-suitability discipline, and the test file's scope.
- `docs/NHEI_RELEASE_BLOCKERS.md`: new "Blocking the Recovery
  Intelligence Bridge (Phase 4)" section, items 12–16 — wiring is not
  started (item 12); `routing_insights` has no consent UI (item 13); the
  safeguarding dependency applies identically to this bridge (item 14);
  the Energy Delta gap is a separate future product decision (item 15);
  and the suggestion text has had no independent human/clinical/
  youth-safeguarding review yet (item 16).

## 14. Testing

- **Full Vitest suite**: 3940 tests across 288 files, all passing
  (includes the 26 new tests in `nhei-recovery-bridge.test.ts`).
- **TypeScript**: `npx tsc --noEmit` — zero errors, including the two new
  source files and the new test file.
- **Lint**: `npx eslint` on all three new files — zero errors (one
  unused-import warning found and fixed during this batch).
- **Recovery Routing regression**: `recovery-routing-engine.test.ts`,
  `recovery-capacity-gate.test.ts`, `recovery-signal-candidates.test.ts`
  — all pass unmodified; this phase edited none of these three files.
- **NHEI intelligence regression**: `nhei-context-integration.test.ts`,
  `nhei-consent.test.ts`, `nhei-safeguarding-contract.test.ts` — all pass
  unmodified.
- **Knowledge-governance regression**: all 15 `nhei-knowledge-*.test.ts`
  files (194 tests) — all pass unmodified.
- **Nova-safety regression**: `nova-chat-safety.route.test.ts` — passes
  unmodified.
- **Guardian regression**: `guardian-alert.test.ts`,
  `guardian-alert.route.test.ts`, `guardian-copy-safety.test.ts`,
  `guardian-support-invitation.test.ts`,
  `guardian-support-invitation.route.test.ts`,
  `guardian-support-catch-blocks.route.test.ts` — all pass unmodified.
- **Real-model/emulator verification**: not attempted and not relevant to
  this phase — `nhei-recovery-bridge.ts` makes no model call and no
  Firestore access of any kind; there is nothing in this file a real-model
  or emulator run could exercise that the unit tests above do not already
  cover deterministically.
- No existing test was weakened, skipped, or modified to pass.

## Remaining Phase 4 work (explicitly deferred, not started)

- Wiring `buildNheiRecoverySuggestions` into any real conversation turn,
  including deciding where in `server.ts` it would be called and how its
  output would actually reach a user — a separate, future approval.
- A user-facing consent UI for `routing_insights`, matching the still-
  missing UI for `reflection_storage`/`longitudinal_tracking`.
- The real, independent safeguarding layer (`UNINTEGRATED_SAFEGUARDING_GATE`
  remains the only implementation; this bridge inherits that exact
  dependency, not a new one).
- Independent human/product/clinical review of the suggestion text this
  phase wrote (`reason`/`explanationForUser`), including youth-appropriate
  phrasing — this phase unit-tested tone, not reviewed it with a real
  qualified reviewer.
- A product decision on whether Energy Delta Management should ever
  become a routable Recovery Routing module — out of scope for this
  phase, which never edits `recovery-signal-candidates.ts`.

---

Stop after this Phase 4 implementation batch, per the directive. Phase 5
is not begun.
