# Blaze Break — Unified NHEI × Multilingual Integration Register
Date: 8 November 2026
Working branch: `integration/nhei-multilingual-20261108`
Source branch: `claude/funny-wright-0p84gv`
Separate NHEI source: `main` at `4cb1708b6fcd08d64ea40c2d4fc6e2a13bcc2c0b`

## Phase 1: baseline and first source audit

This is a work-in-progress integration register, not a release certificate.
GitHub compare confirms the two branches **diverged** at `ddf4513b86cafbacc0c60a135f4a60cc50f22e66`: multilingual is ahead 770 commits and behind 114 relative to main. A blind merge or copying `server.ts`, `src/App.tsx`, `firestore.rules`, or `src/lib/nova-brain.ts` risks dropping functionality. The multilingual branch also carries major other product/security/Expo work absent on main. Work on this integration branch first; do not force-push either original branch.

## Feature-by-feature matrix — initial read against the multilingual source

| Existing workstream | Baseline from `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md` | Phase action | Release gate |
|---|---|---|---|
| A. NHEI Experience Intelligence | Partial | Reconcile new consented adaptation/routing from main with existing NHEI gates; do not activate blocked modes | Independent knowledge and safety approvals |
| B. Before Words | Built but offline | Trace actual UI-to-Nova handoff and permission, avoid duplicate memory | Real user journey, no silent persistence |
| C. Invisible Load | Built but offline | Verify Take the Load mapping and hidden/offline state | No unapproved agentic action |
| D. Recovery Friction/Environment | Not started as named workstream | Map existing adjacent tools before creating adapters | Evidence-backed candidate metadata |
| E. Take the Load | Built but offline | Trace existing categorisation, deferral and calendar bridges | Explicit action approval |
| F. Calendar Protection | Integrated read-only | Preserve opt-in and existing read-only behaviour | Calendar permissions + account isolation |
| G. Boundary Messaging | Integrated | Verify direct-request preference wins | Privacy and safe messaging |
| H. Energy/Capacity | Integrated | Map current capacity to routing with provenance | Never exceed self-reported capacity |
| I. Support Circle | Integrated, Tier 3 blocked | Preserve tier and sharing boundaries | Real-world safety approval |
| J. Care Navigation | Integrated, external verification | Avoid claiming provider validation not done | Localisation of safety info |
| K. Voice/Multimodal | Integrated | Verify locale, RTL and accessibility | Real device testing |
| L. Agentic/Proactive | Partial, guarded | No action without user authorisation | Separate gated pilot |
| M. Recovery Outcomes | Partial | Reconcile feedback correction/withdrawal with existing outcome events | Atomic writes and consent |
| N. Identity/Values | Integrated | Keep culturally appropriate, no inferred identity | Member control and translation review |
| O. Privacy Vault/Consent | Partial | Harmonise all memory and learning toggles across accounts | Rules emulator and opt-out E2E |
| P. Wearables | Not started | Do not invent data adapter | Separate opt-in and approval |
| Q. Coaching Handoffs | Not started | Do not infer a connected professional | Separate data-sharing consent |
| R. Organisation Insights | Partial | Preserve aggregate-only employer lane | Cross-role leakage tests |

Source status descriptions are a point-in-time register and MUST be revalidated at live call sites. Do not reclassify built-but-offline as live solely because code exists.

## Translation coverage work queue

1. **Consent and privacy first**: translated onboarding privacy notices, memory/learning/reminder consent and accessible labels (10 new keys, 12 catalogues, committed to this integration branch); all non-English language packs remain machine drafts.
2. Safety and crisis navigation, emergency labels and non-clinical disclaimers: human-review gate before production.
3. Web landing/auth, remaining onboarding pathway and help text: preserve underlying stable values (e.g. `profile.primaryDrain`, `profile.pathway`) while localising display strings.
4. Burnout Fingerprint questionnaire and explanations, all recovery tool screens.
5. Reports/PDF, subscription, Privacy Centre, server explanations/errors, emails/notifications.
6. Native tab bar, account/security screens, Expo recovery routes and large-text/RTL layout.

## Reconciliation protocol

- Begin from the multilingual branch in an isolated working branch (already created).
- Identify each `main`-only NHEI addition; bring over isolated pure helpers/tests first where dependencies exist.
- Merge behaviour, not entire versions of shared hot files; manually reconcile `server.ts`, `src/App.tsx`, `firestore.rules`, privacy screens and Nova memory cache after reviewing **both** versions.
- Keep two levels of proof: source inspection (available via GitHub) versus executed tests/staging (not yet available in this connector-only environment).
- Test `npm ci --legacy-peer-deps`, lint, full web build, unit/component suites, emulator, Expo build/Jest and staging user journeys. No GitHub Actions or deployment.
- Required journeys: fresh opt-out, opt-in and withdrawal; memory review/correction/deletion; low-capacity Floor Mode; direct request vs learned suggestion; edit/forget feedback; cross-account switch; device language vs saved locale; RTL/mobile/screen reader; recovery handoff to Nova; offline failure.
- Do not update `main` until the combined branch's diff is reviewed and all executable release checks pass.

## Human and infrastructure gates

Human native-speaker validation for all 11 drafts (especially safety), safeguarding and knowledge approval for gated NHEI modes, physical-device accessibility verification, staging auth/App Check, Firebase rules/index deployment authorisation and controlled production release remain outstanding. This document does not call them completed.

## Phase 1 implementation checkpoint — consent and routing

Completed on this integration branch:
- Added ten consent-screen translation entries to English and the eleven explicitly unreviewed draft language packs.
- Updated `SituationalOnboarding.tsx` to translate privacy, protection explanation and greeting/learning/reminder consent labels, including accessible switch labels. Data-model consent booleans and existing option values were left unchanged.
- Added `i18n/onboarding-consent.test.ts` to check catalogue coverage, machine-draft disclosure and stable answer semantics.
- Ported `nhei-adaptive-intelligence.ts` and its unit/scenario tests from the other branch.
- Reconciled `recovery-routing-engine.ts` by adding an optional adaptive context and passing only adapted preference hints through the existing deterministic decision logic. Old callers remain compatible without supplying context.

**Not yet integrated:** The authenticated `server.ts` routing-decision endpoint must supply member-scoped and consented historical feedback, plus feedback deletion/reset routes and privacy UI, without replacing the multilingual branch's existing backend. The GitHub contents endpoint returned empty content for this branch's large `server.ts`, but its exact blob SHA was retrieved and GitHub's blob API subsequently returned the full file. The multilingual backend includes newer atomic recommendation reservations absent on main, so do not overwrite it with the older main server implementation. Reconcile the consent and feedback code in place, preserving those reservations. The remaining shared NHEI files are also not silently treated as merged.

**Not yet verified:** TypeScript, web/native build, all tests, emulator and staging. Previously reported multilingual test success applies to its earlier source commit and does not validate these new changes.

Phase 1 audit is an **initial inventory**, not a complete call-site-by-call-site execution proof. Advance the matrix as paths are audited, with explicit refs and test evidence.

## Phase 1–4 engineering checkpoint — subsequent integration batch

**Committed to protected integration branch (not merged or deployed):**
- Extended existing recovery routing with opt-in learning hints; retained atomic recommendation reservation and suppression on transaction conflicts.
- Reconciled `server.ts` for account-owned feedback history, correction, erasure and learning reset, including forgotten-rating immutability and accurate attribution. Did **not** replace the multilingual branch's large server implementation.
- Added `NovaAdaptiveControls` to the existing Data Privacy Dashboard, using `users/{uid}/nova_permissions/current`; preserves calendar and gated NHEI permissions.
- Strengthened `nova_memories` Firestore rules: creation requires both memory permissions, corrections remain possible after opt-out for editable records only; system-managed records cannot be deleted by clients.
- Made Nova's memory cache check the active account and memory permissions before loading saved records; withdrawn consent clears local cache.
- Ported Second Memory validation, transactional user-owned CRUD server routes, Memory Centre access and post-opt-out Past Memory review. The Recovery Hub shows a compact note and an explanation only when learning actually influenced a recommendation.
- Added support-directory labels in twelve catalogues without changing phone numbers or provider destinations; native Expo tab labels now use the shared catalogue. `docs/I18N_TRANSLATION_STATUS.md` updated to 232 source keys.
- Added source-level and emulator test definitions; **no execution claims** for this combined branch.

**Feature-level concerns still to reconcile/verify:**
- `server.ts` is now integrated at the source level but needs TypeScript and full HTTP/emulator runs. Review any other memory-context consumer that may use older permission semantics.
- Verify complete member data export and erasure with new nested `users/{uid}/nova_second_memory` documents (the repo's generic nested-subcollection walk is documented in `user-data-collections.ts`; run actual account fixture tests).
- The majority of web screens listed in the multilingual report are still English: marketing/auth, remaining onboarding choices, fingerprint, individual tools, privacy/billing/reports/PDF, server errors/messages and notifications. Newly translated safety labels are **unreviewed drafts**.
- Confirm the native app's sign-in, account and NHEI routes with device/screen reader and RTL tests.
- Compare the full NHEI change-set from `main` by file, not just the selected routes: new feedback reset tests, privacy guard contracts, Second Memory account isolation and additional Nova chat wiring need review. No claim of complete merge.
- Do not enable gated NHEI Educational, Personal Reflection, Longitudinal or external agentic actions without independent human governance approvals.

**Next acceptance stages:** run clean checkout and builds (web/Expo/functions), full unit/component tests, rules emulator, Firebase-authenticated staging E2E, account/data-rights scenarios and native-speaker/safety review. Only then merge to main and plan deployment. The earlier multilingual Batch 7 test pass does not apply to the integration branch after these changes.

## Continuation — recovery feedback integrity (8 November 2026)

- Fixed `/api/recovery/routing-outcome` to reject `completed` without a value from the existing valid helpfulness enum **before opening the Firestore transaction**. Previously the endpoint could accept an unrated completed outcome and include it in history. This protects downstream adaptation from treating an incomplete answer as meaningful feedback.
- Added `nhei-outcome-validation-contract.test.ts`: checks server authentication/App Check source boundary, pre-transaction validation, owner-scoped decisions, withdrawn-feedback protection and existing idempotency behaviour.
- Commits: `58a1167399f5899649a21b312e0d5fe42d03563f`, `fd54f34f5cb9563f2f0debbaddf53314a46959db` (`[skip ci]`). Changes are confined to protected integration branch; no merge, deployment or GitHub Actions.
- **Verification status:** GitHub confirmed two commits and file contents; the test has NOT been run. Must validate complete/unrated/invalid/corrected/forgotten outcomes against the emulator and authenticated HTTP staging before release. Do not consider this acceptance complete.

## Continuation — protected branch integration (8 November)

- `src/components/RecoveryIntelligenceHub.tsx` now guards account-owned async recommendation and direction responses with signed-in UID and generation invalidation; resets stale decision, direction and pending feedback on account changes. Ported this specific privacy behaviour from newer `main` without wholesale copying its different UI/runtime. Static contract added: `nhei-recovery-account-isolation-contract.test.ts`.
- The Recovery Intelligence heading and existing navigable Explore tool labels now reuse bundled i18n keys, not separate English-only strings.
- Added eight core onboarding headings/questions across English plus eleven machine-draft catalogues; `SituationalOnboarding.tsx` displays these prompts while preserving persistent answer codes and explicit learning consent default. Added `i18n/onboarding-prompts.test.ts`.
- Existing source catalogue increases from 232 to **240** keys. Subtitles and answer labels remain untranslated; the eleven new draft additions have not been reviewed by qualified humans. Do not mark locales reviewed.
- **Verification:** Code committed to integration branch only; source inspection and commit acknowledgements are not TypeScript, Vitest, emulator, authenticated E2E or staging proof. No merge, GitHub Actions or production deployment performed.
- **Remaining:** complete high-impact display strings and notification/report/billing/privacy translations; reconcile `main` NHEI Floor Mode/resume prompts, outstanding memory guards and feedback resets by behaviour, not bulk overwrites; test account-switch races, revoked learning consent and data erasure with emulators; staging sign-in, App Check, accessibility/RTL and safety copy approval before release.

## Continuation — Floor Mode and feedback durability

- Ported an account-scoped, client-only low-energy view to the multilingual Recovery Intelligence Hub. It hides the optional tool grid, insights and memory prompt while keeping one recommendation and any pending helpfulness answer available. The switch is voluntary and stores only a display preference, under a UID-scoped local key.
- Unlike the previous fire-and-forget flow, the pending helpfulness prompt now clears only after the authenticated outcome request succeeds. A failure leaves the choice visible for retry and displays an error; late responses are invalidated on account changes.
- Updated the source-contract regression file. These tests have not been executed; they do not replace real HTTP, mobile/browser, accessibility and account-switch E2E validation.
- Guardrails unchanged: no unapproved NHEI modes, no database schema or permission changes in this batch, no deployment, no merge to main.

## Batch 9 — Fingerprint privacy and customer-facing translation continuation

- Fixed `DiagnoseView` to default `letNovaLearn` false. Only an explicit true value from the current UID-matched local profile is forwarded; missing, malformed and stale shared-browser data fail closed. The server's diagnosis route already treats the client field as **non-authoritative**, and no new backend learning authorisation was added.
- Removed rendering of raw diagnosis backend errors and corrected the error button to reset both the error and the choice mode. Added a source-contract test `nhei-fingerprint-consent-boundary.test.ts`.
- Localised eight Fingerprint interface strings across 12 catalogues without changing the existing 7/14 question model or stored numeric answers. Wrote `i18n/fingerprint-entry.test.ts`.
- Localised six in-app Nudge settings strings across 12 catalogues, preserving stored notification preference fields and disabled push, email, SMS, and Guardian channels. Wrote `i18n/notification-preferences.test.ts`.
- English source now has 254 keys; eleven additional packs contain matching unreviewed machine-draft entries. Question/answer wording, result reports and many customer screens are still English.
- Attempted local GitHub checkout but container DNS could not resolve github.com. GitHub connector source checks confirm the catalogue keys and commits, not an executable build or QA pass. No Actions, staging/production deployment or merge to main.
- Next required checks: complete integrated build/test, Firestore emulator, authenticated staging flows, human safety review, RTL and screen readers. Reconcile remaining branch-only NHEI work before main merge.

## Batch 10 — question prompts, account-switch protection and unfinished-work handoff

- Added fourteen Fingerprint question translations in all 12 catalogues (268 total keys per language). English source questions match the original text. In the existing `DiagnoseSection.tsx`, visible question prompts now use the catalogue while numeric answer values and stable IDs remain unchanged.
- Hardened assessment state across Firebase UID changes: clears private answers, invalidates in-flight submissions, prevents late onComplete from displaying another person's results, and only shows errors from a currently owned request. Updated the static consent boundary test.
- Connected `/api/user/resume-prompt` to the existing Recovery Intelligence Hub, using only real incomplete activity already detected by the server. Restricts permitted route destinations to `plan`, `diagnose`, `recover`; clears on identity change; hides in the optional Floor Mode; always dismissible. No new recommendation engine or Firestore writes.
- Added `i18n/fingerprint-question-prompts.test.ts` and extended `nhei-recovery-account-isolation-contract.test.ts`. GitHub source reads confirm 268 distinct-looking catalogue entries and all fourteen new question keys in every pack, but the tests have **not been run**.
- Blockers: translate every Fingerprint answer option before claiming full alternate-language assessment; conduct human review of translation meaning and safety, measurement equivalence, RTL/layout, accessibility; run TypeScript, Vitest, Firestore emulator and authenticated staging E2E at exact integrated SHA. Other pending features include billing, reports, privacy, notifications, and remaining NHEI branch reconciliation.
- No Actions, main merge, backend migration or deployment.

## Batch 11 — multilingual onboarding and 7-question Fingerprint choice integration

- Added 23 localised onboarding display strings per catalogue (four subtitles, 17 answer displays, two profile headings). Onboarding now renders the localised display value while persisting unchanged English answer tokens. All 12 packs contain the keys.
- Consent regression: reminders start explicitly disabled; checked state requires `sendNovaNudges === true`. Nova adaptive learning still requires its separate affirmative choice.
- Added 28 choice translations per locale for the seven-question quick Fingerprint. Translation keys reflect canonical question IDs and numeric option values, which remain unchanged in the POST payload. Full 14-question assessment deliberately falls back to original English question/answer wording in a non-English locale with a translated disclosure.
- Corrected Fingerprint error/render priority and removed the raw internal category name from the customer view. Added and amended source tests, including `i18n/onboarding-options.test.ts` and `i18n/fingerprint-quick-options.test.ts`.
- All 12 catalogues now contain 320 source keys. **No language review or assessment equivalence claim.** No executable build/test pass has occurred; no merge/deployment/Actions. Release gate remains blocked.

## Batch 11 follow-up — onboarding identity/timer cleanup

- Reset `SituationalOnboarding` draft answers, consent toggles, progress step and error state when the authenticated user ID changes. The reset uses the current interface language and the same fail-closed defaults for learning/reminders.
- Cancel the 400 ms option auto-advance timer on account changes, unmount and manual Next. The delayed callback checks the still-authenticated UID before changing the displayed question.
- Guard completion UI state against late success/failure callbacks from a previous signed-in account. The underlying `onComplete` API retains its own account-ownership responsibilities; authenticated end-to-end account-switch tests remain a required gate.
- Extended `i18n/onboarding-options.test.ts` for source-level regression coverage. Not executed on a local checkout.

No merge to main, GitHub Actions or deployment.

## Build-fix preflight — 8 November 2026

- GitHub integration branch checked at the latest source head. Corrected a stale source-contract expectation in `nhei-recovery-account-isolation-contract.test.ts`: the previous assertion expected an obsolete account guard, but the live code uses an authenticated UID equality check that returns false on mismatch.
- Compared six recent source-contract test files with their corresponding implementation strings; no remaining mismatches were detected among literal `toContain` / `not.toContain` assertions. This is **static source inspection**, not actual Vitest execution.
- Inspected `package.json` and `package-lock.json`: 68 direct dependency specifications match. Lockfile records Vite 8.3.5, @vitejs/plugin-react 5.2.0, @tailwindcss/vite 4.3.2, Vitest 4.1.12, TypeScript 5.8.3, React/React DOM 19.2.7, with compatible declared peer ranges. This is lockfile compatibility inspection, not `npm ci` or installed dependency verification.
- Local container has Node 22.16.0 but cannot resolve github.com; there is no full repository checkout or lockfile-installed `node_modules`. Consequently **npm ci, npm run lint, npm run build and Vitest could not be run** at the actual integrated SHA. Current GitHub commit status checks contain no test results for the build-fix commit.
- Exact next release verification must run from a clean checkout of this branch with `EXPECTED_RELEASE_SHA` set to the exact head and the existing `npm run verify:web:offline` / `npm run verify:integration:offline` scripts. These existing scripts, not new GitHub Actions or deployments, collect trustworthy build/test logs. Do not merge or deploy on source-only evidence.

## Phase 1E — Nova provider-selection isolation (9 November 2026)

- Nova text chat and the admin runtime registry now share one provider-resolution helper.
- The default Gemini route remains; explicit Vertex/Claude or unknown provider choices fail closed when unavailable rather than silently rerouting personal conversations.
- Missing default Gemini key retains its existing 401 response; unavailable alternative providers return 503.
- Unit and API regression tests added, provider documentation corrected. No live credentials or remote runtime settings changed.
- These source changes are committed in development, NOT runtime tested. Sign-in, App Check and staging remain separate acceptance gates.

## Phase 1F — Firebase emulator-target race fix (9 November 2026)

- Corrected the shared client-side Firestore initialization: `getDb()` now publishes its cached instance only **after** emulator hookup completes.
- Two overlapping callers share a single connection promise. A failed hookup remains a failure, instead of leaving a globally marked “connected” flag or returning a live-targeted Firestore instance on retry.
- Added a hard Vite `DEV` guard so a production bundle cannot enable the localhost emulator solely because a mistaken `VITE_USE_FIREBASE_EMULATOR=true` variable was supplied.
- Added isolated jsdom/Vitest regressions for concurrent calls, failed and retried setup, and production flag leakage.
- Staging/production credentials, project IDs, deployment, Firebase rules and Actions untouched. Tests authored, not executed in this environment.

## Phase 1G — client bootstrap-owner verification parity (9 November 2026)

- Fixed an inconsistent legacy email-only owner gate in `src/lib/auth.tsx`: the signed-in client's role and admin display now reuse `isVerifiedOwnerBootstrapIdentity` from the shared `admin-roles.ts`, with Firebase's verified-email state.
- No new role source or privileged bootstrap email was introduced. Backend grants already use the verified-only rule; unverified identities no longer appear as platform owners in the frontend.
- Reset `userRecord.isAdmin` from current claims/verified identity rather than leaving a stale mutable true flag.
- Added source-policy and pure-helper regressions. This does not alter user login, Firebase console settings or API permissions.
- The work is committed for offline tests and a real account/role acceptance review. No tests were executed via GitHub Actions or deployed.

## Phase 1H — platform recovery sample gating (9 November 2026)

- Administrator recovery outcomes no longer expose success/completion percentages on inadequate denominators; informative ratings must independently meet the statistical threshold.
- The member's own history remains visible, unchanged; no B2B/employer visibility added.
- Three pure tests and one route test added. Work committed to development branch only, without runtime verification.

## Phase 1I — adaptive evidence, feedback withdrawal and reset reliability (9 November 2026)

Audited the live Recovery Hub route, learning engine, data-rights endpoints,
Firestore rules and outcome transaction semantics. Implemented:
- Consent stays opt-in; **inferred** adaptation now requires a real current
  capacity band and matching past feedback bands. Explicitly declared
  preferences remain available where a band is unknown.
- Individual feedback forget uses a Firestore transaction against the same
  document used by outcome correction; repeated forget calls are idempotent.
- Reset now writes a durable `users/{uid}/recovery_routing/learning_reset_state`
  boundary (existing Firestore rules permit owner reads but deny client writes),
  then clears ratings. An in-flight/delayed completion of an **older** decision
  checks that boundary in its own transaction and cannot restore withdrawn
  ratings. Newly offered decisions after reset can be rated normally.
- Reset now checks whether an exact 20x100 erase has exhausted all records,
  instead of falsely reporting a partial reset when exactly 2,000 were cleared.
- Added account-isolation, repeated withdrawal, correction race, old/new
  reset-boundary, consent and capacity-alignment regressions.
- No new database collection, additional navigation, feature flag, rules
  change, GitHub Action or deployment. Existing paths/behaviour reused.

**Verification:** source validated against current branch snapshots and
written as a single phase commit, but not compiled or run under the full
repository test suite here. The offline Firestore emulator, Vitest, TypeScript,
staging identity and real cross-account journeys remain release gates.

## Phase 1J — Nova runtime registry and voice reporting accuracy (9 November 2026)

- Text, Claude, Live voice and speech model names in Evolution's admin report
  now reuse `ai-model-registry.ts`, so selected model overrides are visible
  accurately instead of displaying stale hardcoded identifiers.
- Gemini credential presence and the existing `NOVA_LIVE_VOICE_ENABLED`
  kill switch now determine whether Live voice is reported as active.
  TTS has its own status and remains separate from the Live kill switch.
- Corrected old startup logs promising a silent Gemini fallback, which
  would mislead operators after explicit-provider fail-closed work.
- Unit and admin-route regressions authored; source committed on development.
  A 'ready' label means locally configured only, not live provider/IAM tested.
- No live credentials, model defaults, Firebase rules, GitHub Actions or
  deployments changed. Runtime verification remains outstanding.

## Phase 1K — Firestore collection-group index completeness (9 November 2026)

- Audited all 16 literal `server.ts` collection-group call sites. Ten
  distinct collection-group/field combinations perform filtering and
  require collection-group-scope single-field indexes; the manifest only
  contained composite collection-scope indexes.
- Declared all ten missing `COLLECTION_GROUP` ascending field indexes in
  `firestore.indexes.json` using `fieldOverrides`. Kept each field's
  collection-scope ASCENDING and DESCENDING modes to preserve existing
  member-level reads. All five previous composite indexes are unchanged.
- Covered recovery outcome reporting, product activity, support sharing
  links, usage, nudges, pulse monitoring and entitlement lookups.
- Added a source/manifest regression test that detects missing group index
  declarations on later additions.
- **No index deployment**; the live database might still lack these indexes.
  Firebase index deployment is a separate operator/release step for the
  configured named Firestore database, with index build status verification.
  Do not claim the corresponding API routes are release-ready yet.
- No Firestore rules, code routes, GitHub Actions, secrets or staging/production
  environments changed. Static inventory validated; Vitest not executed.

## Phase 1L — member feedback history pagination and privacy UX (9 November 2026)

- The member-specific `GET /api/recovery/my-feedback` now accepts a
  validated, owner-scoped document cursor and scans only bounded chunks
  of the existing chronologically indexed decisions (3 x 60 max).
- Continues until it finds up to 30 real rated completions, instead of
  silently dropping earlier feedback whenever the 60 newest decisions
  are unrated. Returns `nextCursor` without exposing foreign records.
- The existing Adaptive Feedback History UI now supports "Show older
  ratings", loading state, refresh-on-error, cross-account generation
  guards and cursor reset after member changes or learning reset.
- Added API tests for 70-entry pagination, sparse historical ratings,
  malformed/foreign cursors and a UI-source contract.
- No new customer navigation, Firestore indexes/rules, backend data
  model, GitHub Actions or deployments. Source committed for offline
  runtime/component tests and authenticated staging review.

## Phase 1M — multilingual feedback privacy controls (9 November 2026)

- Localised every static feedback review, erasure/reset, paging, error and
  accessibility label through the existing `useI18n()` runtime and all
  twelve bundled language packs, adding 27 checked translation keys.
- Existing `common.save` translation reused; displayed dates follow
  the selected locale. API enum values and authenticated calls are unchanged.
- Dynamic recovery module display names remain in the legacy English
  formatter and require the full recovery-tools translation audit.
- The English pack remains authoritative; all eleven translated packs
  are **unreviewed machine drafts**, not approved safety or legal text.
- Checked twelve-language key coverage, placeholder compatibility and
  guarded account/session behavior at source level. Full TypeScript,
  Vitest, RTL, native-language, screen-reader and staging verification
  have not yet been executed.

## Phase 1N — Authenticated API retry and Firebase initialization reliability (9 November 2026)

- Restricted the protected API client's automatic expired-token retry to GET/HEAD on HTTP 401 only, at most once. Non-idempotent methods never silently replay, even if a caller forgets `noAuthRetry`. HTTP 403 and MFA challenges never auto-retry.
- Parse authentication error codes once **before** deciding to retry, preserving immediate MFA-session expiry detection. A permission denial is no longer misleadingly described as proof that the member signed out.
- Fixed `getDb()` failure caching: concurrent initialization requests still share one attempt; a failed attempt no longer permanently poisons later explicit attempts. The cached database is published only after emulator connection succeeds.
- Expanded the already-existing targeted tests to cover GET retry, 401/403 POST refusal, MFA challenge refusal, network failure, concurrent Firestore initialization failure and later recovery.
- Source and regression tests are committed for offline verification. Not yet executed with the complete repository/dependencies. No production, Firebase configuration, GitHub Actions, `main`, or deployment changed.

## Phase 1O — same-session response ownership (9 November 2026)

- The protected API client now checks that the original Firebase User session is still active **after** asynchronous token acquisition and **after** receiving the HTTP response. Results from account A are rejected with 409 rather than delivered to account B.
- Checks compare the original Firebase User object, so sign-out/sign-in to the **same UID** also rejects stale results. Dev-only E2E mock-auth is preserved.
- Added four isolated unit tests: stable session, account switch while awaiting a token, switch after request dispatch, and same-UID new session. Existing quota, MFA, App Check, transport and provider boundaries remain unchanged.
- This cannot undo a server-side action that completed before an account change, so mutating requests still rely on server-side auth, transactions and idempotency. Runtime tests and live account-switch E2E remain required.
