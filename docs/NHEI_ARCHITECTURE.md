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
- **Audit finding (Phase 4 §2)**: `recovery-signal-candidates.ts`'s
  `MODULE_ROUTE_MAP` has no entry for Energy Delta Management — it is
  reachable today only as its own standalone page (`EnergyBudget.tsx`),
  never through Recovery Routing. The directive's own worked example
  ("energy and recovery management questions → Energy Delta Management")
  is therefore not a verified, routable mapping today; the Physical-
  dimension rule targets `recovery_fuel` instead (the nearest module that
  both exists in the registry and addresses the same depleted-foundation
  signal) rather than inventing a route Recovery Routing cannot actually
  reach. Wiring Energy Delta Management into Recovery Routing, if ever
  wanted, is a separate, future `recovery-signal-candidates.ts` change —
  explicitly out of scope here, since this phase never edits that file.
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
