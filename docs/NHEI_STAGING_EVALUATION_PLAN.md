# NHEI Educational Mode — staging-only evaluation plan

An actionable plan for running Educational Mode in an isolated,
non-production environment, for authorised testers only. This is a plan
to be approved and then executed by a human operator — **nothing in this
document has been deployed, and this plan itself does not authorise
deployment.** Per the governing directive: no automatic deployment to
staging, no merge to `main`, no production configuration change, and
neither Educational Mode gate is flipped by this document or by writing
it. Staging deployment requires its own, separate, explicit approval
after this plan is reviewed.

## 1. Environment

- A **separate Firebase project** (or, at minimum, a separate Firestore
  database within a non-production project — this app's existing
  `firebaseConfigDatabaseId` multi-database support already makes this
  possible without a second project if that is the organisation's
  preference). Never the production project, and never a project that
  also holds any real user's data.
- A **separate Firestore configuration** for every NHEI collection this
  plan touches: `nhei_knowledge_entries`, `nhei_knowledge_meta`,
  `app_config/nhei_feature_state`, and (only if Personal
  Reflection/Longitudinal testing is ever separately approved — it is
  explicitly NOT part of this plan, see §7) any `users/{uid}/nhei_evidence`
  path. Deployed via the same `firestore.rules` already in this repo — no
  rule changes are needed for this plan; the existing admin-read/
  server-write-only pattern already applies identically in staging.
- `GEMINI_API_KEY` in staging must be its own key, scoped to this
  project, with its own spending ceiling approved separately from any
  production budget — never a shared or production credential.

## 2. Authentication and authorised tester access

- Authorised testers sign in through this app's existing Firebase Auth —
  no new auth mechanism. Each tester's account is explicitly
  allow-listed, by uid, in a staging-only config document (e.g.
  `app_config/nhei_staging_testers`), checked at the same point
  `nheiEducationalModeIsEnabledNow()`/`isNheiModeEnabledInGovernance`
  already gate the Educational Mode addendum in `server.ts`'s
  `POST /api/nova/chat` route — a third, additive gate, specific to
  staging, never present in the production code path.
- The reviewer workflow (this phase's own deliverable: the
  `nheiKnowledgeReviewer` claim and its four admin routes) is granted to
  the same small, named set of people who will review fixtures for this
  environment — granted in staging exactly the way it would be granted in
  production, so the grant/revoke/concurrency behaviour this phase tested
  is exercised for real, not assumed to transfer.
- No tester is anonymous, and no tester is a real customer. "Authorised
  tester" means an internal account explicitly added to the allow-list
  above, nothing broader.

## 3. Feature-gate defaults

- `NHEI_EDUCATIONAL_MODE_ENABLED` defaults to unset/false in staging's
  own environment configuration, identically to production.
- `app_config/nhei_feature_state.educationalModeEnabled` defaults to
  `false` in staging's Firestore, identically to production.
- **Controlled activation for authorised testers only**: because the
  staging-specific tester allow-list (§2) is a THIRD, additive gate never
  present in production, an operator can set staging's two existing gates
  to `true` for the whole staging environment while the tester allow-list
  still prevents anyone not on it from ever reaching the Educational Mode
  code path — this is the mechanism by which "both gates off by default"
  and "controlled activation for authorised testers" are both true at
  once, without a fourth, parallel gating system.
- Flipping any of these three gates in staging is a deliberate, logged
  operator action (`logAdminAction`, reusing the existing audit-log
  convention) — never a side effect of this plan being approved.

## 4. Reviewed and approved educational fixtures

- Only entries with `approvalStatus: 'approved'`, produced through this
  phase's real review workflow (import → list → checklist → approve),
  are ever retrievable — `retrieveApprovedKnowledge`'s existing
  approved-only filter needs no change for staging.
- The 13 real knowledge-library entries are imported into staging's own
  Firestore (via the same `POST /api/admin/nhei-knowledge/import` this
  phase built) and reviewed there by a real, named, independent
  educational reviewer — approving them in staging is the first time any
  of the real 13 are approved anywhere, and that approval decision is
  explicitly out of scope for this plan to make; it is a prerequisite
  this plan assumes will happen under the existing reviewer workflow, not
  something this document pre-approves.
- No synthetic/test-only entry is ever exposed to a tester's real chat
  session — synthetic fixtures stay inside the automated test suite, as
  they do today.

## 5. Existing Nova chat and safeguarding compatibility

- The Educational Mode addendum is appended to Nova's merged system
  prompt in the same position as production
  (`NOVA_SYSTEM_PROMPT + ... + nheiEducationalAddendum + NOVA_SAFETY_INSTRUCTIONS`)
  — staging must not reorder this, since the real safety floor landing
  last is a tested invariant, not an implementation detail to vary.
- Existing Nova safety regressions (`nova-chat-safety.route.test.ts` and
  equivalents) must pass against staging exactly as they do in this
  repo's test suite before any tester session begins — this plan treats
  "Nova works unchanged when NHEI's addendum is present" as a release
  gate for the staging deployment itself, not just for this codebase's
  CI.
- The independent safeguarding system remains unimplemented (see §7) —
  staging inherits the same fail-closed `UNINTEGRATED_SAFEGUARDING_GATE`
  default as production. This plan does not and cannot compensate for
  that absence; it only confirms Educational Mode's own addendum does not
  bypass or weaken whatever safety floor already exists today.

## 6. Performance limits and fallback behaviour

- The existing fallback is preserved unchanged: a retrieval/build failure
  inside `buildNheiEducationalChatAddendum` is caught and logged
  (`nheiEducationalAddendum = ""`), and Nova continues the turn exactly as
  if Educational Mode were off — staging must verify this by deliberately
  breaking retrieval (e.g. a malformed cache-version document) and
  confirming the chat turn still completes normally, not merely by
  reading the code.
- The existing 5-minute cache TTL and cross-instance version-stamp
  invalidation (`nhei-knowledge-service.ts`) apply unchanged. Staging
  should run with more than one instance at least once during evaluation
  specifically to exercise the cross-instance invalidation path a
  single-instance local test cannot.
- No new latency budget is introduced for this plan - Educational Mode's
  existing retrieval is bounded by the same retrieval engine and cache as
  today; a staging evaluation that finds this insufficient is itself a
  finding to report, not something this plan presumes is fine.

## 7. Operational disable and rollback verification

- Verify, as an explicit staging test step, that setting
  `app_config/nhei_feature_state.educationalModeEnabled` to `false`
  takes effect on every instance's NEXT request with no deploy — this is
  the entire reason that Firestore-backed gate exists, and staging is
  the right place to actually exercise it under multi-instance
  conditions before ever relying on it in production.
- Verify, separately, that flipping `NHEI_EDUCATIONAL_MODE_ENABLED` off
  requires a new service revision in staging's own deployment target,
  exactly as `docs/DEPLOY.md` documents for production - so the two
  gates' different rollback speeds are confirmed empirically, not just
  asserted in documentation.
- Rollback must never require a data migration: disabling either gate
  leaves all staging Firestore data (knowledge entries, their review
  state) untouched and re-enabling later must not require re-importing
  or re-reviewing anything.

## 8. Audit logging without raw conversation retention

- Every admin action this phase added (`set_nhei_knowledge_reviewer`,
  `nhei_knowledge_review_decision`, `nhei_knowledge_import`) is logged via
  the existing `logAdminAction`/`admin_audit_logs` convention, unchanged,
  in staging exactly as in production.
- **What is never logged**: the content of any tester's actual chat
  message or Nova's response to it. The existing `/api/nova/chat` route
  does not persist conversation content today (Educational Mode adds no
  new persistence of its own - see `docs/NHEI_ARCHITECTURE.md`'s
  "Educational Mode... No evidence extraction, no persistence" line) -
  this plan requires that staying true in staging, including in error
  logs: a retrieval-failure log entry (§6) must record that a failure
  occurred and why, never the user's message text or Nova's reply.
- If staging needs transcript-level debugging for a specific reported
  issue, that must go through an explicit, separately-approved, time-
  bounded debug-logging toggle - never an always-on default for this
  plan.

## 9. Explicit prohibition on real customer psychological data

- No real customer account, and no data derived from one, is ever used
  in this evaluation. Every tester is an internal, allow-listed account
  (§2) using fixtures and their own test conversations only.
- Educational Mode itself creates no evidence record and requires no
  NHEI consent purpose (unchanged - see `docs/NHEI_ARCHITECTURE.md`'s
  consent section) - this plan does not change that, and explicitly does
  NOT extend this evaluation to Personal Reflection or Longitudinal Mode,
  which would create evidence records and do require consent. Those
  remain completely out of scope and completely disabled (see §7 of the
  closure directive and the "other NHEI boundaries" section below).
- Nothing in this plan processes, infers, or stores a psychological
  assessment of any individual, real or test. The Three Selves and Four
  Dimensions remain educational framing only, exactly as
  `docs/NHEI_ARCHITECTURE.md` already states.

## Other NHEI boundaries this plan does not touch

- Personal Reflection and Longitudinal Mode remain completely disabled -
  this plan's tester allow-list and gate changes apply to Educational
  Mode only; nothing here activates, tests, or wires either of the other
  two modes.
- The independent safeguarding system remains unimplemented and is not
  bypassed by this plan (§5).
- No automatic Guardian notification exists or is added by this plan.
- No Recovery Routing integration exists or is added by this plan.
- No NHEI personal-data persistence is introduced - Educational Mode
  creates none today, and this plan does not change that.
- No retention sweep is activated - `NHEI_RETENTION_SWEEP_ENABLED`
  remains hardcoded `false`, unaffected by anything in this plan (there
  is nothing for it to sweep, since nothing here persists evidence).
- Educational access stays independent of personal-tracking consent -
  unchanged from today, since Educational Mode ignores the consent
  parameter entirely (`authoriseConversationMode`'s existing behaviour).

## What this plan requires before staging deployment can actually happen

1. A privacy/compliance decision-maker's sign-off on the separate
   staging Firebase project/database and its own `GEMINI_API_KEY`
   spending ceiling (§1).
2. A named list of authorised testers and named reviewer(s) to actually
   populate the allow-lists in §2.
3. A qualified independent educational reviewer actually completing real
   review of the 13 entries in staging's own Firestore (§4) - this plan
   assumes that happens under the existing workflow; it does not pre-
   approve any specific entry.
4. A separate, explicit go-ahead to actually provision the environment
   and flip staging's own gates - this document is the plan, not that
   approval.

**This plan has not been executed. No staging environment has been
created. No gate has been changed anywhere.**
