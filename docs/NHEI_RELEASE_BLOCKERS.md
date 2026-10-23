# NHEI release blockers

What stands between NHEI's current, fully-disabled state and activating
any part of it for a real user, kept current in version control rather
than only in a per-checkpoint delivery report. See `docs/NHEI_ARCHITECTURE.md`
for what exists and how it fits together; this file is only the list of
what's still blocking, organised by which mode it blocks.

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
   `nhei-knowledge-service.test.ts`). What remains is a product/governance
   decision, not engineering: granting the `nheiKnowledgeReviewer` claim
   to a specific, real, named human in a real environment.
3. **Two operational governance gates, both currently OFF.**
   *Decided and implemented* (the mechanism itself): `NHEI_EDUCATIONAL_MODE_ENABLED`
   (env var) AND `app_config/nhei_feature_state.educationalModeEnabled`
   (Firestore) must both be true. Flipping either to true for real users
   is a separate, future authorisation decision this register does not
   make.
4. **Real-model verification of the quarantine boundary (guarantee B).**
   *Not started — blocked on credentials.* No usable Gemini credential
   exists in this environment. Every adversarial test that exists proves
   the prompt-construction string cannot be forged; none proves a real
   model actually honours the "this is reference data" framing. The exact
   procedure an authorised operator would follow, once a credential and
   spending approval exist, is `docs/NHEI_REAL_MODEL_EVALUATION_PROCEDURE.md`
   Part B — including the honest note that no harness for this specific
   question exists yet either, so part of the work is building one, not
   only running it.

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
   *Not started.* The consent-purpose plumbing exists and is enforced in
   code; no screen anywhere in this app presents this choice to a user.
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
   *Not started.* The dedicated, stricter read interface
   (`readNheiEvidenceForLongitudinalMode`, requiring both purposes) is
   implemented and tested; no consent UI or route wiring exists.

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
