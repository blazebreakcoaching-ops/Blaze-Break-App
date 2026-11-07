# Nova Phase 5C — Agentic Integration Delivery Report

Branch: `claude/nhei-phase-1`. Offline/no-deploy — no merge, no production
deployment, no live NHEI activation, no autonomous messaging, no
unapproved external action.

## 1. Starting and ending commits

- **Starting commit**: `2cba653` ("NHEI Phase 5B: delivery report") —
  `HEAD` when this Phase 5C directive arrived.
- **Ending engineering commit**: `fcc824d` ("NHEI Phase 5C: real consent
  routes, calendar protection workflow, component tests").
- This report is delivered in a follow-up commit on top of `fcc824d`.

## Verification of Phase 5B delivery (directive §1)

Inspected the actual source and Git history for the five named files,
all unchanged in content since Phase 5B's `9bc8eed`, confirmed present
and still passing:

| File | Confirmed |
|---|---|
| `nova-take-the-load-types.ts` | present, zero `nhei-` imports |
| `nova-take-the-load-connector-contract.ts` | present, `createFakeConnectorForTesting` statically guarded |
| `nova-take-the-load-engine.ts` | present, 17 tests passing |
| `nova-invisible-load-contract.ts` | present — **extended this phase** (`deferred`/`deferInvisibleLoadItem`/`undeferInvisibleLoadItem` added; 8→18 tests) |
| `nova-before-words-handoff-contract.ts` | present, unchanged, 5 tests passing |

No discrepancy found between the Phase 5B report's claims and the actual
code. The only reconciliation needed was documentation, not code: the
capability register's workstream E/C entries referenced "this phase"
language that would have read as stale once Phase 5C added to the same
files — corrected in section 10 below (docs updates).

## 2. Files created and modified

Created: `nova-calendar-protection-service.ts`/`.test.ts`,
`nova-calendar-protection-route.test.ts`,
`nova-calendar-protection-no-real-execution-audit.test.ts`,
`nhei-consent-route.test.ts`,
`nova-invisible-load-take-the-load-bridge.ts`/`.test.ts`,
`src/components/NovaInvisibleLoad.tsx`/`.test.tsx`,
`src/components/NheiPrivacyConsent.test.tsx`,
`src/components/NheiBeforeWords.test.tsx`,
`src/components/NheiRecoverySuggestionCard.test.tsx`,
`src/components/NheiAgenticActionPreview.test.tsx`,
`nova-phase5c-agentic-journey.test.ts`,
`vitest.components.config.ts`, `test/component-test-setup.ts`,
`NOVA_PHASE5C_AGENTIC_INTEGRATION_DELIVERY_REPORT.md` (this file).

Modified: `server.ts` (new consent + calendar-protection routes),
`nova-invisible-load-contract.ts`/`.test.ts` (defer/undefer),
`src/components/NheiPrivacyConsent.tsx` (real fetch wiring),
`src/components/NheiBeforeWords.tsx` (visible-disabled retain control),
`src/components/NheiPhase5Preview.tsx` (new Invisible Load section),
`package.json`/`package-lock.json` (new devDependencies:
`@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `@testing-library/dom`, `jsdom`),
`docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`,
`docs/NHEI_ARCHITECTURE.md`, `docs/NHEI_RELEASE_BLOCKERS.md`.

## 3. Consent implementation

`GET`/`POST /api/nhei/consent` (`server.ts`) are new, real,
server-authored routes, built on the already-existing
`getNheiConsent`/`setNheiConsent`/`withdrawNheiConsent`
(`nhei-persistence-service.ts`) — no new persistence logic was written.
`uid` comes only from `requireAuth(req).uid` (the verified ID token),
never the request body — a request can only ever act on the caller's own
account. The three purposes (`reflection_storage`, `longitudinal_tracking`,
`routing_insights`) are each set independently; `setNheiConsent` only
ever merges its own single field, so granting one never touches another
(tested directly: granting `longitudinal_tracking` alone leaves the
other two `false`). Withdrawal (`granted: false`) only flips the flag —
it never deletes anything already persisted, matching
`withdrawNheiConsent`'s pre-existing design; deletion remains the
separate, existing whole-account GDPR flow. Longitudinal consent alone
still does not grant reflection-evidence access — that boundary lives
unchanged in `readNheiEvidenceForLongitudinalMode`, not touched by this
route. `NheiPrivacyConsent.tsx`'s three personal-purpose toggles are now
real: they fetch current state on mount, write on toggle, and show a
real error message on a rejected write (tested: a `SecureApiError`
leaves the toggle unchanged, with a visible error). **This is consent
bookkeeping only** — no personal NHEI processing is activated by this
route; Educational Mode's own two gates are untouched, and the
independent safeguarding system remains unbuilt.

Tested: 10 route-level tests (`nhei-consent-route.test.ts`) + 4 new
rendered-DOM component tests (`NheiPrivacyConsent.test.tsx`).

## 4. Before Words and Invisible Load integration

**Before Words**: audited what happens on both endings.
`decideProceedWithoutRetaining` is the only ending `NheiBeforeWords.tsx`
ever reaches — confirmed, and confirmed correct: no real
`reflection_storage` write exists to receive the other ending. This
phase added a visible-but-genuinely-disabled "Save this as a
reflection" button (previously omitted entirely), so a user sees the
choice exists and is told plainly why it doesn't work yet, rather than
the option disappearing silently. No code path converts temporary
conversation context into persisted evidence without the explicit
retain decision — `buildNovaIntakeSummaryFromBeforeWords` (Phase 5B,
unchanged) still returns `null` for `proceed_without_retaining`.

**Invisible Load**: `nova-invisible-load-contract.ts` gained `deferred`,
`deferInvisibleLoadItem`, `undeferInvisibleLoadItem` — "not now" is a
real, distinct state from "take this off the list" (remove) or "that's
wrong" (correct). `src/components/NovaInvisibleLoad.tsx` (new) is a
mobile-first interface: single-column stack, 44px-minimum touch targets,
every action a real, always-visible `<button>` (no hover-only
affordance). `nova-invisible-load-take-the-load-bridge.ts` connects
EXACTLY ONE explicitly-chosen item to a Take the Load problem — there is
no "build for every item" function anywhere in this codebase (asserted
by a structural test enumerating the module's exports), and a deferred
item is refused outright. Temporary conversation context (this
component's own state) is never persisted; nothing is retained unless a
future phase builds that separately.

Tested: 18 contract/bridge tests + 6 rendered-DOM component tests.

## 5. Agentic calendar workflow

Audited before building: `signInWithGoogleCalendar` (`src/lib/auth.tsx`)
already requests both `calendar.readonly` and the write-capable
`calendar.events` scope at sign-in, for anyone who has connected their
calendar through `CalendarDefenseView.tsx`/`MicroRecovery.tsx`/
`IntegrationsDashboard.tsx`; `getCalendarConnectionState` (`server.ts`)
already gates on real `allowCalendarSignals` consent plus signal
freshness. No write call to Google Calendar exists anywhere in this
codebase today.

Built `nova-calendar-protection-service.ts` + six real server routes
implementing exactly the workflow the directive specifies:

1. **Identify calendar pressure**: `identifyCalendarPressure` reuses the
   existing `computeRedZones`/`hasAnyElevatedZone`
   (`calendar-workload-defence-engine.ts`) — no new scoring model.
2. **Prepare a specific proposed change**: `POST /propose` requires real
   `allowCalendarSignals` consent (403 otherwise) and persists an exact
   `startIso`/`endIso`/`title`, keyed by a caller-supplied idempotency
   key — a repeated propose with the same key returns the SAME proposal.
3. **Check feasibility and permissions**: the consent check above; a
   deterministic SHA-256 `approvalFingerprint` computed from the
   proposal's own id + exact parameters.
4. **Show exact consequences**: the full proposal (exact times, title)
   is returned to the caller — never a vague description.
5. **Obtain explicit approval tied to the specific action**: `POST
   /:id/approve` requires `approvalFingerprint` as a **required** schema
   field — a bare `{approved: true}` is rejected by the request schema
   itself, before any business logic runs. A fingerprint that doesn't
   match the stored proposal (simulating modified parameters) is
   rejected with 409, never partially honoured.
6. **Execute through an authorised adapter**: `POST /:id/execute` always
   passes `null` for the connector — `server.ts` imports no connector of
   any kind. `CALENDAR_PROTECTION_EXECUTION_ENABLED` is a hardcoded
   `false` constant checked before the connector parameter is ever used.
7. **Verify the result, report success/failure**: the real state machine
   (`prepared → awaiting_approval → approved/declined → executing →
   confirmed/failed`) is persisted and returned at every step.
8. **Offer undo only when genuinely supported**: `undoSupported` is
   `true` for this category (a calendar block is a genuinely reversible
   operation); `POST /:id/undo` only succeeds from `confirmed`, which —
   with execution disabled — is unreachable through the live route.

**Server-side authorisation** (directive's explicit list): account/
permission verification (`requireAuth` + `allowCalendarSignals`), replay
protection (fingerprint match required on approval), idempotency
(duplicate propose returns the same proposal; duplicate execute on an
already-`confirmed`/`failed` proposal returns the stored result without
calling a connector again), audit logging (every transition writes to
`users/{uid}/calendar_protection_audit`), safe retry (`retryExecution`
only from `failed`, incrementing a count).

**Provider adapter**: prepared only as the generic
`NovaExternalConnector` interface (Phase 5B) — no Google-Calendar-
specific adapter was written, since execution stays disabled this
phase; validated only against `createFakeConnectorForTesting` via the
test-only `TEST_ONLY_FORCE_EXECUTION_ENABLED` override, never in
production code.

Tested: 20 service-level tests, 8 route-level tests (supertest against
the real Express app), 4 static no-real-execution guard tests.

## 6. Server-side action authorisation

Covered in full in section 5. The specific anti-pattern the directive
names — "never accept a generic `approved: true` field from an
untrusted request as sufficient authorisation" — is structurally
impossible here: the request schema requires `approvalFingerprint`
(`z.object({approved: z.boolean(), approvalFingerprint: z.string().min(1)}).strict()`),
and the service layer independently re-checks it against the value
computed at prepare time, rejecting any mismatch before the `approved`
boolean is ever consulted.

## 7. Actual versus simulated external execution

**Actual**: none. No code path in this batch, or reachable from it,
makes a real write call to Google Calendar, Slack, or any other external
service. The only real external-facing effect of anything in this phase
is the consent route's own write to this app's own Firestore (not an
external service).

**Simulated**: `createFakeConnectorForTesting`
(`nova-take-the-load-connector-contract.ts`, Phase 5B, unchanged) is the
only `NovaExternalConnector` implementation anywhere in this codebase.
It is used only in this phase's own test files, under the loudly-named,
statically-guarded `TEST_ONLY_FORCE_EXECUTION_ENABLED` override — never
imported by `server.ts` or any `.tsx` file (two independent guard tests
cover this: one from Phase 5B for the generic connector contract, one
new this phase for the calendar-specific override symbol).

## 8. UI test evidence

`vitest.components.config.ts` (new): a separate project/config,
`environment: 'jsdom'`, run via `npm run test:components`, independent
of the main `environment: 'node'` suite (hundreds of existing `.test.ts`
files are untouched). 23 real rendered-DOM tests across 5 components:

- `NheiPrivacyConsent.test.tsx` (4): real toggle state via
  `aria-checked`, a real write call, **permission denial** (a rejected
  write shows a real error and leaves the toggle unchanged), keyboard
  tab order.
- `NheiBeforeWords.test.tsx` (4): real textarea focus, prompt
  skippability, the visibly-disabled retain control, the real ending.
- `NovaInvisibleLoad.test.tsx` (6): add/defer/remove/opt-out, the
  per-item "get help" callback, keyboard-reachable remove.
- `NheiRecoverySuggestionCard.test.tsx` (4): real suggestion text,
  decline-all, the explicit abstention message, keyboard focus +
  `onAccept` firing.
- `NheiAgenticActionPreview.test.tsx` (5): **permission denial**
  (decline stops before execution), the `executing` state, a successful
  confirm + undo, **external action failure** (a new simulate-failure
  toggle resolves to a visible, non-auto-retried failure state, no undo
  offered), the real state label.

**This does not claim automated accessibility conformance.** These
tests check specific, real properties (`role`, `aria-checked`,
`aria-label`, focus after a real `userEvent` interaction, keyboard
reachability for individual controls) — they are not a WCAG audit, an
axe-core scan, or a claim that every component meets any accessibility
standard. Mobile layout (actual responsive breakpoint behaviour, touch
target rendering at a real viewport size) is not testable under jsdom,
which has no layout engine — `NovaInvisibleLoad.tsx`'s 44px-minimum
touch targets and single-column stack are a code-level design
discipline, verified by reading the Tailwind classes, not a rendered
visual-regression test.

This covers only the 5 new/touched Phase 5 components named in the
directive's own list where a component actually exists — it does not
retroactively add coverage for the hundreds of pre-existing `.tsx` files
in this codebase (see `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`'s
cross-cutting gap note, updated this phase).

## 9. Full regression results

- Main suite: `npx vitest run` → **311 test files, 4233 tests, all
  passing** (up from 310/4221 immediately before this report's own
  commit; up from 299/4069 at the start of Phase 5B).
- Component suite: `npx vitest run --config vitest.components.config.ts`
  → **5 test files, 23 tests, all passing**.
- `npx tsc --noEmit` → clean, zero errors, across the whole repository.
- Lint: zero errors on every file this phase touched or created; the
  pre-existing warnings in `server.ts` (46, all `@typescript-eslint/
  no-unused-vars` on variables/catch-bindings this phase did not touch)
  were confirmed unrelated by `git diff` before this report was written.
- Consent/security tests: `nhei-consent-route.test.ts` (10),
  `nova-calendar-protection-route.test.ts` (8),
  `nova-calendar-protection-no-real-execution-audit.test.ts` (4),
  `nova-safeguarding-trust-boundary-audit.test.ts` (Phase 5B, unchanged,
  still passing), `nova-support-circle-no-auto-contact-audit.test.ts`
  (Phase 5B, unchanged, still passing).
- Nova chat / recovery / Guardian regressions: unchanged from the main
  suite total above — no existing Nova chat, Recovery Routing, or
  Guardian file was modified this phase (Guardian: 6 files/101 tests,
  same as Phase 5B's own count). This phase's new `nhei-`/`nova-`
  prefixed files (10 new test files) are included in the 311/4233 total
  alongside the pre-existing 88 root-level `nhei-`/`nova-` test files,
  not separately re-measured.
- No Firestore emulation was used — all new persistence tests run
  against the existing `test/fake-firestore.ts` double, same evidentiary
  standard as every prior NHEI/Nova phase.

## 10. Remaining capabilities in the 18-workstream vision

Per `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` (updated this phase):
workstreams C, E, L, O moved forward (Invisible Load UI + bridge;
calendar-protection route; real consent route). Unchanged: D
(Recovery Friction/Environment, not started as a named concept), P
(wearables, not started), Q (professional handoffs, not started), the
~dozen remaining org-aggregate routes in R still on the older inline
privacy pattern, M's coach-facing review surface (not built), and every
other workstream's prior classification. Boundary Autopilot (workstream
G) was reviewed for reusable patterns (server-side audit logging,
real OAuth-token-based sends) but deliberately not modified — its
behaviour is unchanged, per the directive's own instruction.

Asana/Monday/Calendly/Gmail integration contracts were reviewed (all
confirmed still read-only); per the directive's "do not build all
provider integrations in one batch," none gained a write path this
phase — calendar protection was the one category built, matching F's
existing read-only precedent.

## 11. Remaining independent review and release blockers

Unchanged and still blocking, per `docs/NHEI_RELEASE_BLOCKERS.md`: the
independent safeguarding system (item 5), human review of all 13
knowledge entries (item 1), real-model evaluation (items 4/8, credential-
blocked), human review of NHEI/Phase-5/5C user-facing text (items 16,
19). `UNINTEGRATED_SAFEGUARDING_GATE` is untouched by this phase.

New this phase: items 7, 9, 13 moved from *Not started* to *Partial* (the
writing route exists; the screen is still offline) — item 18 is now
resolved for the route itself. A new, not-yet-recorded gap: no human has
reviewed whether the calendar-protection workflow's own exact wording
("Protected recovery block," etc.) is appropriate across age bands —
tracked here, not yet added as a numbered item, since this phase's scope
was the mechanism, not a copy review.

## 12. Recommended next major implementation batch

A real, narrowly-scoped Google Calendar connector for exactly the
calendar-protection category, reusing the already-granted
`calendar.events` scope — explicitly gated on a separate, human
authorisation decision this report does not make, and requiring, before
any real write: independent review of the exact proposal text a user
would see, a decision on whether `allowCalendarSignals` consent alone is
sufficient permission or whether a dedicated, separate consent purpose
should gate real execution, and a UI for the six routes this phase built
(none exists yet). Second priority, unchanged from Phase 5B's own
recommendation: the independent safeguarding system, since it blocks
NHEI Personal Reflection/Longitudinal/Recovery Insights activation
regardless of any other progress.

**Stopping here per the directive.** No merge, no production deployment,
no live NHEI activation, no autonomous messaging, no unapproved external
action — `CALENDAR_PROTECTION_EXECUTION_ENABLED` remains `false`,
`UNINTEGRATED_SAFEGUARDING_GATE` remains the only default, and nothing
previously disabled was activated by this batch.
