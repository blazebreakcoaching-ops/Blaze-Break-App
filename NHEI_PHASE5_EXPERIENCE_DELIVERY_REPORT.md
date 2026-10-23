# NHEI Phase 5 — Experience, Consent & Control Delivery Report

Branch: `claude/nhei-phase-1`. Offline engineering only — no merge, no
deployment, no NHEI feature flag enabled, no production route wiring, no
real user ever reaches any file this report describes.

## 1. Exact Git commit and changed files

- **Starting commit**: `1158d69` ("NHEI Phase 4B: delivery report") — `HEAD`
  when this Phase 5 directive arrived.
- **Ending engineering commit**: `230f27c` ("NHEI Phase 5: experience,
  consent, and agentic-permission UI (offline)").
- This report is delivered in a follow-up commit on top of `230f27c`, per
  this codebase's established pattern of committing engineering and its
  delivery report separately.

Created:

- `nhei-recovery-navigation.ts` / `.test.ts`
- `nhei-agentic-action-contract.ts` / `.test.ts`
- `nhei-before-words-contract.ts` / `.test.ts`
- `nhei-reflection-preview-fixtures.ts` / `.test.ts`
- `nhei-safeguarding-trust-boundary-audit.test.ts`
- `nhei-phase5-acceptance.test.ts`
- `src/components/NheiRecoverySuggestionCard.tsx`
- `src/components/NheiPrivacyConsent.tsx`
- `src/components/NheiReflectionPreview.tsx`
- `src/components/NheiBeforeWords.tsx`
- `src/components/NheiAgenticActionPreview.tsx`
- `src/components/NheiPhase5Preview.tsx` (offline developer harness, composes
  the five components above for manual review only)
- `NHEI_PHASE5_EXPERIENCE_DELIVERY_REPORT.md` (this file)

Changed:

- `nhei-recovery-arbitration.ts` / `.test.ts` — dedup key fix
  (`targetModule`, not `routeType`) and the new `unsuitableForCapacity`
  field (section 4).
- `nhei-recovery-orchestration.ts` / `.test.ts` — data-minimisation
  reordering fix (section 9).
- `nhei-recovery-e2e.test.ts` — updated assertions to match both fixes
  above.
- `src/App.tsx` — additive `'nhei_recovery_tool_focus'` window event
  listener (section 5).
- `src/components/EnergyBudget.tsx` — `id="energy-delta-tool"` on the root
  element (section 5).
- `docs/NHEI_ARCHITECTURE.md` — new "Experience, consent, and
  agentic-permission UI (Phase 5)" section.
- `docs/NHEI_RELEASE_BLOCKERS.md` — five new items (18–22) for the Phase 5
  UI's own blockers.

## 2. Consent and privacy interfaces

Audited `server.ts` before building anything: `grep -n
"routing_insights|longitudinal_tracking|reflection_storage|...setNheiConsent"`
returns zero matches — **no route exists today to set or withdraw any NHEI
consent purpose.** This drove the entire design of
`NheiPrivacyConsent.tsx`: four mode cards (Educational, Personal
Reflection, Longitudinal, Recovery Insights), each separating the toggle
(granting) from an expandable "what happens with this on?" detail
(viewing). Educational Mode shows a "No consent needed" badge, matching
`authoriseConversationMode`'s real behaviour. The other three modes'
toggles render via a `DisabledToggle` sub-component — always
`disabled`, `aria-checked={false}`, with a tooltip stating plainly that no
backend exists yet. **No real consent grant is ever saved through this or
any other flow**, satisfying the directive's explicit instruction not to
save real consent through an incomplete or unapproved path.

Withdrawal/correction/export/deletion are presented honestly against what
actually works today: a real `<a href="/api/user/export">` link to the
existing, working export route (includes NHEI data via
`exportAllNheiData`), and a real description of the existing whole-account
`POST /api/user/delete-account` flow, with an explicit, visibly-disabled
note that no granular "delete just my reflections" route exists.

## 3. Recovery recommendation experience

`NheiRecoverySuggestionCard.tsx` takes a `NheiRecoveryArbitrationResult`
(Phase 4B's output) and renders: the selected recommendation (module,
reason, `explanationForUser`, an `InterpretationBadge` for
confirmed/tentative/educational, a `CapacityBadge` for
suitable/unsuitable/unknown), the alternatives list, a visually distinct
"exists, but may not fit right now" section for `unsuitableForCapacity`
suggestions, and an explicit abstention message when `selected` is absent
(reading the bridge's `NheiRecoveryNoSuggestionReason`). Built on the same
card shell and single-recommendation discipline as the existing, live
`NovaRecommendationCard.tsx`.

## 4. User interaction functionality

Every button in the card is wired to the real Phase 4B
`applyNheiRecoveryInteraction` reducer: accept, dismiss, explain, view
alternative, correct interpretation, decline all. State lives in a local
`useState<NheiRecoveryInteractionState>` — no decorative control exists
without a real transition, and accepting a recommendation changes only
this component's own state, never an external system.

Also fixed in `nhei-recovery-arbitration.ts` per the directive's §4
instruction:

- **Deduplication was keyed on `routeType`**, silently merging two
  genuinely different real tools (e.g. a Reset Studio suggestion and an
  Anxiety Reset suggestion, both `STABILISE`) into one winner and
  discarding the loser as if it were a duplicate. Changed the grouping key
  to `targetModule` — a true duplicate is now only the same module
  suggested twice (no current bridge rule produces this, but the dedup
  logic now correctly describes what "duplicate" actually means).
- **Added `unsuitableForCapacity: NheiRecoverySuggestion[]`**, structurally
  separate from `alternatives`, in every return path. A capacity-unsuitable
  suggestion can no longer be rendered by any consumer as an ordinary,
  equivalent alternative — the type itself prevents it, not a convention.
- Both fixes required updating `nhei-recovery-arbitration.test.ts` (two
  existing tests corrected, one new test added proving two different
  modules sharing a route type both survive) and two blocks in
  `nhei-recovery-e2e.test.ts`.

## 5. Energy Delta navigation validation

Audited `src/App.tsx`'s `'recover'` tab (~line 2603): it stacks seven
different tools in one scroll (WeeklyGoalTracker, EnergyBudgetMatrix,
FocusZone, EnergyBudgetTool, MicroRecovery, OneLessThing,
WorkloadRealityCheck) — confirming the directive's concern that landing on
the tab alone does not reliably show Energy Delta Management specifically.

Fixed additively, reusing the existing navigation mechanism rather than
inventing a route:

- `nhei-recovery-navigation.ts`: a pure helper. `NHEI_MODULE_ANCHOR_ID`
  deliberately contains only one entry (`energy_delta: 'energy-delta-tool'`)
  — no anchor is invented for any module this phase didn't audit.
  `buildNheiRecoveryNavigationPlan(targetModule)` combines the existing
  `MODULE_TARGET_TAB` lookup with this anchor map.
- `src/App.tsx` gained a second window event listener,
  `'nhei_recovery_tool_focus'`, alongside the existing `'navigate_tab'`
  event. The existing event's ~20 call sites and bare-string `detail`
  contract are completely unchanged — confirmed by grep before editing.
  The new listener does bounded `requestAnimationFrame` polling (up to 30
  attempts, ~0.5s ceiling) for the target element, then
  `scrollIntoView({behavior:'smooth', block:'start'})`, since the tab
  switch itself is an async state update/re-render.
- `src/components/EnergyBudget.tsx`'s `EnergyBudgetTool` root `<div>`
  gained `id="energy-delta-tool"`.
- Verified: `nhei-recovery-navigation.test.ts` (4 tests) proves the lookup
  is correct and that no other module gets an invented anchor. The
  scroll/event-listener behaviour itself cannot be proven by an automated
  test in this codebase (see section 10) — reviewed by reading the
  `requestAnimationFrame` polling logic and comparing it against the
  existing `'navigate_tab'` listener's established pattern in the same
  file.

## 6. Reflection and correction UI

`NheiReflectionPreview.tsx` + `nhei-reflection-preview-fixtures.ts`. Since
the real `NheiEvidenceRecord` type deliberately has no raw-text field (by
design, going back to earlier phases), a new, explicitly-labelled
`NheiReflectionPreviewEntry` fixture type was created — fabricated,
illustrative text only, never presented as real evidence. Two synthetic
episodes, four entries, demonstrating confirmed / hypothesis / disputed
states distinctly: a disputed or confirmed entry never carries
`novaTentativeInterpretation`; a hypothesis entry always does, and is
explicitly labelled "not confirmed." Each entry shows its
Self-system(s)/Dimension(s) as tag pills and its `chronologyLabel`, grouped
by episode. Dismiss/correct are local `useState` actions only — no
Firestore call exists anywhere in either file. The component never asserts
a hypothesis as fact, never diagnoses, and never speaks for a third party's
beliefs.

## 7. Before Words foundations

Audited the whole repository first (case-insensitive search for "before
words"/"beforewords" across `.ts`/`.tsx`/`.md`): **no prior art exists** —
this is new, built from scratch. `nhei-before-words-contract.ts` is a pure
state model: steps `intro → free_expression → optional_prompts → review →
decided`; four optional, individually skippable prompt categories; a
per-prompt uncertainty flag; additive corrections (`addCorrection` never
overwrites); and two endings presented with equal visual weight,
`proceed_without_retaining` and `retain_as_reflection_evidence` — this
preview only ever exercises the former, since nothing here persists
anything. The contract file has **zero import statements**, verified by a
test reading its own source — no model call, no diagnostic label is ever
required to reach `decided`. `NheiBeforeWords.tsx` wraps it with real
`<textarea>`/`<input>` bindings and skip/correct/proceed controls.

## 8. Agentic permission contracts

`nhei-agentic-action-contract.ts`: a strict state machine —
`suggested → prepared → awaiting_approval → approved | declined →
executing → confirmed | failed`, plus `undone` — enforced by a
`VALID_TRANSITIONS` map; any other transition throws
`NheiAgenticInvalidTransitionError`. `requiresUserApproval` is hard-coded
`true`, not a parameter a caller could flip, and `recordApprovalDecision`
is the **only** function that can move a proposal out of
`awaiting_approval` — structurally, not by convention, NHEI interpretation
alone can never authorise an external action. The file has **zero import
statements** (verified by a test reading its own source), so no
connector/Guardian/calendar/messaging code is reachable from it even
transitively. `NheiAgenticActionPreview.tsx` walks a worked calendar
example end-to-end, with the "connector" simulated by a single
`setTimeout` — no real API call of any kind exists in this codebase for
any connector today, and the component's own comments say so explicitly.
No background monitoring, no automatic messaging, calendar modification,
or Guardian communication happens anywhere in this phase.

## 9. Safeguarding and security boundaries

- **Orchestration data-minimisation fix** (directive §9's own "review data
  access ordering" instruction): `orchestrateNheiRecoveryRequest` in
  `nhei-recovery-orchestration.ts` previously called
  `buildNheiPersonalContextSummary` (a real personal-evidence Firestore
  read) before checking either `routing_insights` consent or the
  safeguarding gate. Reordered: consent check first (no read), safeguarding
  gate second (no read), personal-context read only if both pass. Two new
  outcome statuses, `consent_not_granted` and `safeguarding_not_cleared`,
  are returned before any personal-evidence read. This changes *when* a
  read happens, not *what any real caller is told* — the safeguarding
  gate's real-world answer (`UNINTEGRATED_SAFEGUARDING_GATE` → always
  `cleared: false`) is unchanged, so this is a minimisation fix, not a
  behaviour change.
- **`nhei-safeguarding-trust-boundary-audit.test.ts`**: a new, static
  regression guard (grep-based, not an import-graph analysis) proving
  `SIMULATED_TEST_ONLY_CLEARED_GATE` and
  `grantNheiSystemAuthorityForTestingOnly` are never imported — via an
  actual `import {...} from` statement, not merely mentioned in a comment —
  from `server.ts`, any `.tsx` file, or any other non-test root-level
  `.ts` file. (Initial version had a false positive, tripped by
  `nhei-authority-contract.ts`'s own comment explaining why it does *not*
  import the helper; fixed by switching from a substring check to a regex
  matching real import statements.)
- `UNINTEGRATED_SAFEGUARDING_GATE` remains the only default anywhere in
  this codebase; nothing in Phase 5 changes that.
- Age-appropriate presentation of any Phase 5 copy (the suggestion card,
  consent explanations, Before Words prompts, agentic-action descriptions)
  **remains explicitly unreviewed** — tracked as new release-blocker item
  19, not resolved by this phase.
- No automatic Guardian contact exists anywhere in this phase's code. No
  unreviewed safeguarding policy was written or implied.

## 10. Mobile accessibility and UX tests

**This repository has no automated UI-rendering test harness at all.**
`vitest.config.ts` runs with `environment: 'node'` and `include:
['**/*.test.ts']` — `.tsx` files are excluded by the config itself, and
there is no jsdom/@testing-library dependency anywhere in `package.json`.
No `.test.tsx` file exists in this repository, for any of the hundreds of
existing `.tsx` components, let alone the six new ones in this phase. This
is a pre-existing, repo-wide limitation, not something Phase 5 introduced
or could fix within its own scope.

What was actually done instead, matching how every other `.tsx` file in
this codebase has always been verified:

- Every new component uses real semantic HTML (`<button>`, `<input>`,
  `<textarea>`, `role="switch"`/`aria-checked` on consent toggles,
  `aria-label` on icon-only or ambiguous controls) and Tailwind's
  responsive utility classes, reviewed by reading the markup directly.
- `npx tsc --noEmit` — clean across the whole repository (single unified
  `tsconfig.json` covering `.ts` and `.tsx`).
- `npx eslint` — clean on every new/changed file in this batch (verified
  individually and confirmed again in this report's final sweep); the
  pre-existing errors elsewhere in `src/App.tsx` and
  `src/components/EnergyBudget.tsx` (`react-hooks/set-state-in-effect`,
  `react-hooks/refs`, `react-hooks/purity`) were confirmed, via `git diff`,
  to fall entirely outside this phase's added lines.
- No dev-server visual/keyboard/screen-reader/reduced-motion spot-check was
  performed in this batch. This report states that plainly rather than
  implying a check that did not happen.

## 11. Full regression results

- **Full suite**: `npx vitest run` → **299 test files, 4069 tests, all
  passing.**
- **TypeScript**: `npx tsc --noEmit` → clean, zero errors.
- **Changed-file lint**: clean on every file this phase touched or
  created.
- **Category breakdowns** (same categories used in the Phase 4B report,
  re-run against this phase's end state):
  - Recovery Routing: 3 files / 60 tests passing.
  - Recovery Capacity Gate: 1 file / 14 tests passing.
  - NHEI (all — temporal, consent, bridge, arbitration, orchestration,
    interaction, navigation, before-words, agentic-action, acceptance,
    safeguarding-audit, etc.): 59 files / 768 tests passing.
  - Guardian: 6 files / 101 tests passing.
  - "Nova safety" has no file matching that literal substring in this
    codebase; Nova's safety-instruction and trust-boundary coverage lives
    inside the NHEI category above (quarantine/composer tests) and
    elsewhere under different filenames — not a gap introduced by this
    phase, just a naming mismatch against the directive's literal
    category list.
- Firestore emulation was not used in this batch; all NHEI persistence
  tests run against the existing fake/mocked Firestore test doubles already
  used throughout this codebase (same evidentiary standard as every prior
  NHEI phase) — this report does not claim emulator-backed or real-model
  evidence anywhere.

## 12. Unimplemented functionality

- No backend route exists to set, withdraw, or correct any NHEI consent
  purpose — every consent toggle in `NheiPrivacyConsent.tsx` is visibly
  disabled, by design.
- No real connector (calendar, task list, messaging) integration exists —
  `nhei-agentic-action-contract.ts` is a permission contract with no
  reachable connector code, and its preview simulates one with
  `setTimeout`.
- No automated rendering/accessibility test exists for any `.tsx` file in
  this codebase, old or new (section 10).
- No independent human review has occurred for any Phase 5 UI copy
  (consent explanations, suggestion-card text, Before Words prompts,
  agentic-action descriptions), including in a youth age band.
- No component built this phase is wired into live navigation —
  confirmed by `grep -rln` that all six new `.tsx` files are imported only
  by each other and the `NheiPhase5Preview.tsx` harness.
- The independent safeguarding system remains entirely unimplemented;
  `UNINTEGRATED_SAFEGUARDING_GATE` is unchanged.

## 13. Remaining Phase 6 and human-review requirements

Before any future phase wires any Phase 5 component into live navigation,
it must independently re-verify, not assume from this report:

- A real, approved consent-writing backend exists for the specific purpose
  that component requires (release blocker 18).
- The independent safeguarding system exists and is integrated (blocker 5,
  14), or the component's reach is scoped to Educational Mode only.
- A qualified reviewer has read the specific user-facing text that
  component renders, including in a youth age band (blockers 16, 19).
- For any agentic-action wiring specifically: a real, authorised connector
  integration exists (blocker 21), and the "never allow NHEI interpretation
  alone to authorise an external action" structural guarantee in
  `nhei-agentic-action-contract.ts` is preserved at the real call site.
- For Energy Delta navigation specifically: if any other module beyond
  `energy_delta` is ever added to `NHEI_MODULE_ANCHOR_ID`, that module's
  actual rendered DOM must be independently re-confirmed to carry the
  anchor id claimed — this phase only verified `energy_delta`.
- A real DOM-rendering test harness (jsdom/@testing-library) would need to
  be added to this repository before any future phase could claim
  automated component-test coverage for these or any other `.tsx` files.

## 14. Readiness assessment

Phase 5 is complete as an offline implementation batch: the arbitration
and orchestration correctness fixes are real bug fixes with corrected
tests, not cosmetic; Energy Delta navigation reuses the existing event
mechanism without inventing a route; all six new UI components are built
on real, functional state (the Phase 4B interaction reducer, the new
Before Words and agentic-action contracts) rather than decorative mockups;
and every new persistent-looking control that has no real backend is
rendered honestly disabled rather than appearing to work. Nothing in this
phase enables any NHEI mode for a real user, merges to main, deploys, or
activates any production route — `UNINTEGRATED_SAFEGUARDING_GATE` remains
untouched and fail-closed, and the full regression suite (299 files / 4069
tests) passes with zero new failures.

**This is not a production-readiness assessment and must not be read as
one.** The gap between "offline, tested, feature-disabled preview" and
"approved for any real user" is large and explicitly enumerated in section
12 and `docs/NHEI_RELEASE_BLOCKERS.md` (items 18–22 are new this phase):
no consent backend, no connector integration, no independent review of any
new user-facing text, no automated UI test coverage (a repo-wide
limitation), and the independent safeguarding system is still entirely
unbuilt. Per this directive's explicit final instruction, this batch stops
here — no merge, no deployment, no production activation, and no automatic
transition to Phase 6.
