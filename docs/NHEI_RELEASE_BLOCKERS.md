# NHEI release blockers

What stands between NHEI's current, fully-disabled state and activating
any part of it for a real user, kept current in version control rather
than only in a per-checkpoint delivery report. See `docs/NHEI_ARCHITECTURE.md`
for what exists and how it fits together; this file is only the list of
what's still blocking, organised by which mode it blocks. See
`docs/NHEI_STAGING_EVALUATION_PLAN.md` for the plan (not yet executed) to
evaluate Educational Mode in an isolated, non-production environment once
enough of this register has moved to "decided and implemented."

Each item is marked exactly one of:
- **Decided and implemented** — built, tested, and verified in this codebase.
- **Proposed, not approved** — an engineering default or recommendation
  exists, but no authorised human has signed off on it.
- **Not started** — no implementation and no proposal exist yet.

Do not read an item in the second or third category as "safe to treat as
settled" — the whole point of this register is that they are not.

## Blocking Educational Mode specifically

1. **Independent human review of all 13 knowledge entries.** *Not
   started (mechanism now decided and implemented; the review itself has
   not happened).* All 13 entries (9 in
   `nhei-knowledge-content-library.ts`, 4 in
   `nhei-knowledge-content-drafts.ts`) exist only as TypeScript source
   constants — **not one of them has ever existed as a real
   `nhei_knowledge_entries` Firestore document in any environment**
   (confirmed by Phase 3 Closure's exhaustive-grep audit: nothing but
   test files ever imported them). The Phase 3 Closure batch built a real,
   explicitly-invoked, idempotent import mechanism
   (`nhei-knowledge-import-service.ts`, mounted at
   `POST /api/admin/nhei-knowledge/import`) that creates all 13 as real
   Firestore drafts — but running it is itself an operator action nobody
   has taken in any real environment yet, and this register does not
   treat "the import mechanism exists" as "the entries have been
   imported," let alone "reviewed." Even once imported, every entry
   remains `approvalStatus: 'draft'` until a real, named, authorised human
   reviewer acts on each one individually. No automated test, synthetic
   fixture, or this phase's own code ever approves a real entry — see
   `nhei-knowledge-import-service.test.ts`'s explicit self-check that it
   never does.
2. **Registering a knowledge-reviewer role and mounting the review
   routes.** *Decided and implemented.* Phase 3 Closure added a separate,
   ADDITIVE Firebase custom claim (`nheiKnowledgeReviewer: true` —
   deliberately NOT a new value in `admin-roles.ts`'s single-valued
   `APP_USER_ROLES`, which would have replaced/stripped an existing
   admin's role to grant it), a strict `requireNheiKnowledgeReviewer(req)`
   checker with no platform-owner/legacy-admin bypass, a
   Platform-Owner-only grant/revoke route
   (`POST /api/admin/users/:uid/nhei-knowledge-reviewer`), and three
   reviewer-gated routes: listing all entries
   (`GET /api/admin/nhei-knowledge/entries`), approving/rejecting
   (`POST /api/admin/nhei-knowledge/entries/:entryId/review`), and
   triggering the import (`POST /api/admin/nhei-knowledge/import`). All
   four routes are tested end-to-end, including unauthorised-caller
   denial, self-approval rejection, and two-reviewer approval/rejection
   concurrency (see `nhei-knowledge-review-admin.route.test.ts`,
   `nhei-knowledge-service.test.ts`). Phase 3 Operational Acceptance added
   a small review tab inside the existing `AdminDashboard.tsx` (no new
   interface) so a reviewer can actually use this without hand-rolled API
   calls, and fixed a real finding: revoking the claim now also calls
   `getAuth().revokeRefreshTokens()`, since removing a custom claim alone
   does not invalidate an ID token already issued before the revocation —
   without this, a just-revoked reviewer could keep acting for up to that
   token's remaining lifetime. What remains is a product/governance
   decision, not engineering: granting the `nheiKnowledgeReviewer` claim
   to a specific, real, named human in a real environment.
3. **Two operational governance gates, both currently OFF.**
   *Decided and implemented* (the mechanism itself): `NHEI_EDUCATIONAL_MODE_ENABLED`
   (env var) AND `app_config/nhei_feature_state.educationalModeEnabled`
   (Firestore) must both be true. Flipping either to true for real users
   is a separate, future authorisation decision this register does not
   make.
4. **Real-model verification of the quarantine boundary (guarantee B).**
   *Harness decided and implemented; the actual run is not started —
   blocked on credentials.* No usable Gemini credential exists in this
   environment. Every string-construction test that exists proves the
   prompt-construction delimiter cannot be forged; none, until Phase 3
   Operational Acceptance, had an executable harness to prove a real
   model actually honours the "this is reference data" framing.
   `nhei-real-model-adversarial-evaluation-runner.ts`
   (`runRealModelAdversarialEvaluation`) is that harness now — seven
   synthetic fixtures across the seven manipulation categories Phase
   3C-2B section 7 named, built on the real `quarantineKnowledgeEntryForPrompt`
   construction, wired and tested against a mocked client
   (`nhei-real-model-adversarial-evaluation-runner.test.ts`), still
   UNEXERCISED against a real model in this environment. The exact
   procedure an authorised operator would follow, once a credential and
   spending approval exist, is `docs/NHEI_REAL_MODEL_EVALUATION_PROCEDURE.md`
   Part B.

## Blocking Personal Reflection Mode (in addition to all of the above, since Educational Mode's own approval does not carry over)

5. **The independent safeguarding system itself.** *Not started.* Only
   the integration *interface* exists
   (`nhei-gated-reflective-mode-integration.ts`); the detection/assessment
   logic, human-support escalation pathways, and audit/retention design
   all require a qualified safeguarding/clinical reviewer's input, not
   an engineering default. `UNINTEGRATED_SAFEGUARDING_GATE` remains the
   fail-closed default and must remain so until this is built.
6. **Age-aware safeguarding for a youth age band**, including a
   guardian/parent notification policy and youth-specific crisis-resource
   copy. *Not started — explicitly deferred to the safeguarding
   reviewer*, not an engineering decision.
7. **A real, user-facing consent-granting UI for `reflection_storage`.**
   *Partial — the writing route now exists (Phase 5C); the screen remains
   offline.* `GET`/`POST /api/nhei/consent` (`server.ts`) now really
   reads/writes this purpose, server-side, per-user, and
   `NheiPrivacyConsent.tsx`'s toggle for it is wired to that route - but
   that component is still not mounted into `App.tsx`'s live navigation
   (see Phase 5's own "offline preview" design), so no real user has
   reached this control yet. The remaining gap is purely "put this screen
   in front of a real user," not "build the backend" or "build the UI."
8. **Real-model extraction accuracy.** *Not started — same credential
   blocker as item 4.* The evaluation harness's real-execution path is
   implemented and its wiring is proven against a mocked client; no run
   against an actual model has occurred. The operator procedure is
   `docs/NHEI_REAL_MODEL_EVALUATION_PROCEDURE.md` Part A, including the
   explicit note that this register does not set a numeric pass/fail
   threshold — an authorised reviewer must state acceptance criteria
   before any run, not after seeing its results.

## Blocking Longitudinal Mode (in addition to all of the above)

9. **A separate, user-facing consent surface for `longitudinal_tracking`.**
   *Partial, same as item 7 — the writing route exists (Phase 5C,
   `POST /api/nhei/consent`), the screen is still offline.* The dedicated,
   stricter read interface (`readNheiEvidenceForLongitudinalMode`,
   requiring both purposes) is implemented and tested, and setting this
   purpose alone (without `reflection_storage`) is explicitly proven,
   by test, not to grant it — that structural guarantee is unaffected by
   the new route existing.

## Cross-cutting, blocking any persistent-evidence mode

10. **Retention-sweep policy parameters** (grace period, warning lead
    time, delivery mechanism, per-purpose vs. cascading withdrawal scope,
    user-confirmed-insight retention parity). *Proposed, not approved* —
    `nhei-retention-policy.ts`'s 90-day/14-day figures are explicitly
    unapproved engineering defaults, not product/legal decisions.
    `NHEI_RETENTION_SWEEP_ENABLED` must remain `false` until a human
    approver resolves this checklist (see the Phase 3C-2B section 9
    retention decision document for the full item-by-item breakdown).
11. **A compliance confirmation on legal minimum retention periods**,
    separately for NHEI evidence and for the (also not-yet-built)
    safeguarding audit log — two different retention regimes that must
    not be assumed to share one answer. *Not started.*

## Blocking the Recovery Intelligence Bridge (Phase 4, in addition to the Educational/Reflection/Longitudinal items above as relevant)

12. **Wiring `nhei-recovery-bridge.ts` into a real conversation turn.**
    *Decided and implemented offline; wiring is not started and is a
    separate, future approval.* `buildNheiRecoverySuggestions` is a pure,
    fully-tested function with no call site anywhere in this codebase —
    not imported by `server.ts` or any route. Before any future phase
    wires it in, that phase must independently re-confirm every
    prerequisite below is actually satisfied at the real call site, not
    merely that this file's types require it.
13. **The `routing_insights` consent purpose's user-facing consent
    screen remains offline**, same partial status as `reflection_storage`
    (item 7) and `longitudinal_tracking` (item 9) — the writing route
    (`POST /api/nhei/consent`) is real and this purpose is one of the
    three it independently supports; `isNheiPurposeConsented(state,
    'routing_insights')` is unaffected. *Partial.*
14. **The independent safeguarding system** (item 5) blocks the bridge
    identically to Personal Reflection Mode — the bridge takes the full
    `NheiSafeguardingClearance` as a required input and only
    `UNINTEGRATED_SAFEGUARDING_GATE` exists today, which always returns
    `cleared: false`. A future wiring phase gets `safeguarding_not_cleared`
    for every real user until this is built — this is intentional, not a
    bug to work around.
15. **Energy Delta Management now has an entry in `recovery-signal-candidates.ts`'s
    `MODULE_ROUTE_MAP`.** *Decided and implemented (Phase 4B)* — resolved
    the Phase 4 finding. `recovery-decision-copy.ts`'s
    `MODULE_DISPLAY_NAMES`/`MODULE_TARGET_TAB` gained the matching entry,
    and `nhei-recovery-bridge.ts`'s Physical-dimension rule now targets
    it directly, with `recovery_fuel` offered as a genuinely-matching
    alternative. *Proposed, not approved*: whether this registration is
    the right long-term product decision (vs., say, a different Recovery
    Routing treatment for Energy Delta) has not been reviewed by anyone
    with product authority — this register tracks that the registration
    exists and is tested, not that it has been product-approved.
16. **Independent human review of how `NheiRecoverySuggestion`'s
    user-facing text (`reason`, `explanationForUser`) would actually read
    to a real user**, including in a youth age band. *Not started —
    preparation exists.* Phase 4B added
    `nhei-recovery-suggestion-review-register.ts`, a static list of every
    user-visible string the bridge's six rules can produce, each flagged
    (`causal_sounding`, `culturally_narrow`,
    `age_appropriateness_unverified`, etc.) for a reviewer's attention —
    but the file is explicitly preparation, not review: nothing in it or
    its drift-guard test marks any entry approved, and no product/
    clinical/safeguarding reviewer has actually read this text yet, the
    same category item 1 and item 6 already require for knowledge
    content and youth safeguarding respectively.
17. **Wiring `nhei-recovery-arbitration.ts`,
    `nhei-recovery-orchestration.ts`, and
    `nhei-recovery-interaction-contract.ts` into a real route and a real
    UI.** *Decided and implemented (offline, fully tested); wiring is not
    started.* All three are pure/composition functions with zero
    production call sites — confirmed by `grep -rl "nhei-recovery-"`
    returning only the Phase 4/4B files themselves. A future phase
    wiring these in must independently re-verify every prerequisite in
    items 12–16 above still holds at the real call site, not assume this
    phase's "offline, tested" status implies readiness.

## Blocking the Phase 5 experience/consent/agentic UI

18. **A real, working consent-writing backend for any NHEI purpose.**
    *Not started.* `NheiPrivacyConsent.tsx` (Phase 5) exists but every
    consent-requiring toggle is rendered visibly disabled — confirmed by
    grep that `server.ts` has no route for setting or withdrawing
    `reflection_storage`, `longitudinal_tracking`, or `routing_insights`.
    This is the same underlying gap as items 7, 9, and 13 above, now also
    blocking the consent *screen* specifically, not only the modes it
    gates. No real consent grant has been saved through this or any other
    incomplete flow.
19. **Independent human review of the Phase 5 UI's own user-facing text and
    presentation**, including the recovery suggestion card, the reflection/
    correction preview, and the Before Words prompts, in a youth age band.
    *Not started.* This is in addition to item 16 (the underlying bridge
    suggestion text), since Phase 5 adds its own new copy (consent
    explanations, Before Words prompts, agentic-action descriptions) that
    register has never covered.
20. **Wiring any Phase 5 component into live navigation.** *Decided and
    implemented offline; wiring is not started.* As of Phase 5D, seven
    `.tsx` files (`NheiPrivacyConsent`, `NheiRecoverySuggestionCard`,
    `NheiReflectionPreview`, `NheiBeforeWords`, `NheiAgenticActionPreview`,
    `NovaInvisibleLoad`, `NovaTakeTheLoad`) are reachable only from each
    other and the `NheiPhase5Preview.tsx` harness — confirmed by
    `grep -rln` returning no other importer. A future phase wiring any of
    them in must independently re-verify every prerequisite above (consent
    backend, safeguarding, human review) still holds, not assume "offline,
    tested" implies readiness.
21. **A real connector integration for any agentic action.** *Partially
    addressed, Phase 5E — credential/connector gap for calendar
    protection specifically is closed; execution is still disabled.*
    `nhei-agentic-action-contract.ts`'s state machine and
    `NheiAgenticActionPreview.tsx`'s worked example remain fully
    synthetic — the "connector" there is still a `setTimeout`. For
    calendar protection specifically, Phase 5E closed the exact gap this
    item previously named: `server.ts`'s `OAUTH_PROVIDERS` now has a
    real `google_calendar_actions` entry (server-side PKCE token
    exchange, refresh with `invalid_grant` disconnect-handling, a
    real `fetchAccountIdentity` ownership check, real `revoke` on
    disconnect), and `nova-google-calendar-connector.ts` is a real
    connector against the actual Events API — unit-tested with fake
    responses AND a real local HTTP server, still structurally
    unreachable from production (its own static audit test confirms
    this, same pattern as the Phase 5D stub it replaces).
    `CALENDAR_PROTECTION_EXECUTION_ENABLED` remains the permanent `false`
    kill-switch — turning it on, and wiring the real connector into
    `server.ts`, is still a separate, later, explicitly-approved decision
    this phase deliberately does not take. No other category (Asana,
    Monday, Calendly task-deferral) has a real connector or credential
    flow of any kind — unaffected by this phase.
22. **Automated rendering/accessibility verification for the Phase 5 UI (or
    any UI in this codebase).** *Partially addressed, Phase 5C/5D/5E —
    still not WCAG/responsive-layout proof.* This item's original text
    ("this repository has no jsdom/@testing-library harness") is now
    STALE and has been corrected here rather than left to mislead a
    future reader: Phase 5C added `vitest.components.config.ts`
    (`environment: 'jsdom'`, run via `npm run test:components`,
    separate from the main `environment: 'node'` suite), and Phase 5D
    extended it to a sixth component (`NovaTakeTheLoad.tsx`), 31 tests
    total. What this DOES verify: real rendered DOM state, computed
    `aria-*` attributes after real user interaction, and keyboard/focus
    behaviour — not markup inspection. **Updated Phase 5E: a real
    browser-level pass HAS now been attempted and run** — `npm run
    test:e2e` (`playwright.config.ts`, `tests/e2e/nhei-phase5-journey.spec.ts`)
    drives real Chromium (desktop AND mobile viewport configurations,
    26 passing test runs — 13 scenarios × 2 viewports) against a
    dedicated dev-only page, with every provider response mocked at the
    network layer, covering keyboard-only interaction, a real
    focus-trapped modal (`role="dialog"`/`aria-modal`/Escape-to-close),
    and real rendered layout at both viewport sizes (confirmed: no
    horizontal overflow). What it still does NOT verify, and this
    register continues not to claim: WCAG conformance of any kind, or
    real screen-reader/assistive-technology behaviour — the directive's
    own explicit instruction for this suite was "do not claim WCAG
    certification from these tests," and this entry doesn't.

## Phase 5B finding, Phase 5C resolution: item 18 (and items 7, 9, 13's writing half)

Phase 5B's wider audit (`docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`,
workstream O) found that a real, working, NON-NHEI consent-writing
pattern already existed in this codebase: `ConnectedNovaPermissions`
(`src/components/ConnectedRecoveryModules.tsx:681`) — a real,
rules-enforced, per-user Firestore permissions document the client reads
and writes directly. Phase 5C built the NHEI-specific equivalent on that
same pattern, server-authored instead of client-written:
`GET`/`POST /api/nhei/consent` (`server.ts`), backed by the
already-existing `getNheiConsent`/`setNheiConsent`/`withdrawNheiConsent`
(`nhei-persistence-service.ts`). **Item 18 is now resolved for the
writing route itself** — `uid` from the verified token only, each
purpose independent, withdrawal never deletes. What remains open (items
7, 9, 13) is putting a real screen in front of a real user:
`NheiPrivacyConsent.tsx`'s toggles are wired to this route but the
component is still not mounted into `App.tsx`'s live navigation.

## Phase 5D findings (not NHEI consent itself — recorded here since they touch items 20–22 and the agentic-action gap)

- **Items 20 and 22 updated in place above** rather than appended here,
  since both were simple corrections (an importer count, and a stale "no
  jsdom harness" claim) rather than new findings.
- **`allowCalendarActions`** (`nova-calendar-action-permission.ts`): a
  new, separate, fail-closed permission for calendar WRITE actions,
  distinct from the pre-existing `allowCalendarSignals` read consent —
  this is NOT an NHEI consent purpose and does not change anything in
  this file's own numbered list; it is Agentic Nova's own permission
  boundary, recorded here only because item 21's "no credential or
  authorisation flow exists" remains true despite it (granting this
  permission authorises nothing today, since real execution stays
  disabled regardless).
- **Export/erasure coverage audit (directive §9)**: confirmed
  `calendar_protection_proposals`/`calendar_protection_audit` are real
  Firestore subcollections of `users/{uid}` (not top-level,
  userId-keyed collections), so they are already covered by the existing
  whole-account `recursiveDelete`/`listCollections()` export and
  deletion paths — no registration in `user-data-collections.ts` was
  needed, and no new gap like the historical `anxiety_reset_events`/
  `audit_logs` one was found. See
  `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` workstream O for the
  full reasoning.

## Phase 5F Agentic Expansion findings (not NHEI consent itself — recorded here for completeness since this phase re-verified the boundary)

- **No item in this file's numbered list changed state.** This phase's
  work (Task Deferral, Invisible Load's help menu, the unified
  `NovaAgenticJourney` sequencer, the new possible-suggestion contract,
  the task-assistance outcome contract) is entirely Agentic Nova/
  non-NHEI code — confirmed by grep: zero `from '...nhei-...'` imports in
  `nova-task-deferral-types.ts`, `nova-task-deferral-service.ts`,
  `nova-task-deferral-connector-contract.ts`,
  `nova-task-assistance-outcome.ts`, `nova-invisible-load-help-contract.ts`,
  or `nova-proactive-assistance-contract.ts`. The full Before Words
  trust-boundary regression suite
  (`nova-before-words-temporary-context.test.ts`,
  `nova-chat-before-words-trust-boundary.route.test.ts`,
  `nova-support-circle-no-auto-contact-audit.test.ts`,
  `nhei-safeguarding-contract.test.ts`) was re-run unchanged and passes.
- **Export/erasure coverage**: the three new Firestore subcollections
  this phase adds — `task_deferral_proposals`, `task_deferral_audit`,
  `task_assistance_outcomes` — are all real subcollections of
  `users/{uid}` (never top-level, userId-keyed collections), the same
  shape `calendar_protection_proposals`/`-audit` already established in
  Phase 5D; they are already covered by the existing whole-account
  `recursiveDelete`/`listCollections()` export and deletion paths with no
  separate registration needed, for the same reason recorded above.
- **No new NHEI consent purpose was added.** Task Deferral's own
  `userControlsDeadline`/`userControlsOwnership` clarification is an
  Agentic Nova workflow input, answered fresh on every proposal, never
  persisted as a standing consent — it has no relationship to
  `nhei-persistence-service.ts`'s consent model.

## Phase 5G Experience Integration findings (not NHEI consent itself — recorded here for completeness since this phase re-verified the boundary)

- **No item in this file's numbered list changed state.** This phase's
  work (the proactive-suggestions UI, the Calendar Protection/Task
  Deferral journey polish, the Invisible Load state-lift fix below, the
  Calendar Protection outcome-feedback extension, two new Playwright
  end-to-end tests) is entirely Agentic Nova/non-NHEI code, confirmed by
  the same grep this file already ran for Phase 5F: zero
  `from '...nhei-...'` imports in `NovaProactiveSuggestions.tsx`,
  `nova-task-deferral-safe-assistance.ts`, or the widened
  `nova-task-assistance-outcome.ts`. NHEI personal modes remain disabled;
  no NHEI knowledge/safeguarding feature was activated; no real
  calendar/task-provider write was introduced (Calendar Protection
  execution stays off platform-wide — confirmed by this phase's own
  route test asserting every `/execute` call still returns
  `execution_disabled`); no unattended Guardian/Recovery Ally/other
  outbound communication was added or touched.
- **A real, non-NHEI UX bug was found and fixed by this phase's own
  Playwright coverage**: `NovaAgenticJourney.tsx` conditionally rendered
  `NovaInvisibleLoad` only while `step === 'invisible_load'`, so a user
  who added an item, then used it to reach Calendar Protection or Task
  Deferral, then returned to add something else, found their original
  item silently gone (the component had remounted with fresh internal
  state). Fixed by lifting `NovaInvisibleLoadContext` into
  `NovaAgenticJourney` as controlled state, passed down via new optional
  `context`/`onContextChange` props on `NovaInvisibleLoad` (uncontrolled
  usage, and every existing test of it, keeps working unchanged). This
  has no NHEI relationship either way — it is in-session UI state only,
  never persisted.
- **PR #140 was not touched.** No file this phase changed overlaps any
  file in that PR, and no commit in this phase's history references it.

## Explicitly not a blocker (confirmed working, independent of any NHEI activation)

- Data export, correction, and deletion already work today through this
  app's existing GDPR endpoints, regardless of whether any NHEI mode is
  ever activated for anyone.
- The standalone notification-preferences normalisation fix
  (`notification-preferences-normalization.ts`) is unrelated to NHEI
  activation; it has its own, separate activation decision (wiring it
  into `notification-router.ts`'s real call site), deliberately not
  bundled with any item above.

## How to use this file

Before any item in this file's "Educational Mode" section is marked
resolved, the corresponding env var / Firestore document must actually be
flipped by an authorised operator in a real environment — this register
tracks readiness, not activation, and activation is never implied by an
item here moving to "decided and implemented."
