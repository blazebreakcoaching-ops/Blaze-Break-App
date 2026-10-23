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
   started.* All 13 entries (9 in `nhei-knowledge-content-library.ts`, 4
   in `nhei-knowledge-content-drafts.ts`) are `approvalStatus: 'draft'`.
   The procedure a reviewer would follow, and the service boundary that
   would let them act through verified identity, both exist
   (`nhei-knowledge-review-service-boundary.ts`) — but no review has
   happened, and the mechanism to actually invoke it is not yet mounted
   as a route (see item 2).
2. **Registering a knowledge-reviewer role and mounting one route.** *Not
   started.* `NHEI_KNOWLEDGE_REVIEWER_ROLE` is not in `admin-roles.ts`'s
   real role vocabulary. The exact route to add is documented (not
   written as live code) in `nhei-knowledge-review-service-boundary.ts`'s
   footer comment.
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
   command to run this, once an authorised credential and budget exist,
   is documented in the Checkpoint 3 section 4 delivery notes.

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
   against an actual model has occurred.

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
