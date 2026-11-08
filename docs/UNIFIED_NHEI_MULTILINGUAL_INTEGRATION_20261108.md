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
