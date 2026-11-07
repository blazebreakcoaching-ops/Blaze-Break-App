# Phase 6A — Nova Intelligence Evaluation & Safety Validation System — Acceptance Report

## 0. Scope and SHAs

- **Starting SHA**: `aa3adb0` (Phase 5N delivery commit, branch `claude/nhei-phase-1`) — confirmed as the actual latest commit on both the local checkout and `origin/claude/nhei-phase-1` before this phase began (Phase 5N's own report did not record its final pushed SHA; `git log` was used to identify and verify it directly).
- **Ending SHA**: the commit this report ships in, on the same branch.
- No merge, deployment, or production feature activation was performed. Security PR #140 was not touched (confirmed: no file this PR modified, other than `vitest.config.ts` and `package.json`, intersects with that PR's diff). No real customer data was used anywhere in this phase — every synthetic identity, email, and conversation is fictional, and all testing ran against local fakes/emulators.

## 1. Starting-state verification

Phase 5N's reported state was re-verified directly rather than assumed: `git log` confirmed `aa3adb0` is the true tip of `claude/nhei-phase-1` both locally and on `origin`, matching Phase 5N's report. `npm test` was re-run before any change to confirm a clean starting baseline (4622 tests passing, matching the Phase 5N report's own figure).

## 2. Architecture audit — the real Nova request/response pathway

Read as the source of truth, not assumed from prior reports:

1. **Nova text chat** (`POST /api/nova/chat`, `server.ts:3072`): gated by `novaChatLimiter`, `verifyAppCheck`, `authenticateFirebaseUser`, then `ChatRequestSchema` validation, then a daily-quota check (`checkAndReserveCapability(uid, 'nova_text')`). The model call uses `@google/genai`'s `GoogleGenAI` client (`ai.chats.create({ model: GEMINI_TEXT_MODEL, ... })`, `GEMINI_TEXT_MODEL = "gemini-3.5-flash"` per `ai-model-registry.ts`). `GEMINI_API_KEY` is read once at boot (`server.ts:1725`); if it is missing or the literal placeholder `"MY_GEMINI_API_KEY"`, the route returns **401 immediately** (`server.ts:3106`) — there is no server-side mock/fallback response path. This is the single most important architectural fact for the evaluation framework's design: "offline mode" cannot mean "a built-in demo mode in the server" (none exists) — it has to mean mocking the `@google/genai` module at the test-infrastructure level, exactly as the existing `nova-chat-safety.route.test.ts` already does, and which the new framework reuses.
2. **Gemini Live voice** (the WebSocket relay around `server.ts:17552`+): a structurally separate code path, using `ai.live.connect({ model: GEMINI_LIVE_MODEL, ... })` (`GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview"`). Gated by the same `GEMINI_API_KEY` presence check, plus its own feature flag (`NOVA_LIVE_VOICE_ENABLED`, default **on**) and per-session/per-minute capability quotas (`nova_voice`, `nova_voice_minutes`). It shares the exact same `NOVA_TOOLS`/`executeNovaTool` tool set as text chat, so nothing voice can do is a capability text chat doesn't already have.
3. **NHEI reasoning pipeline** (`nhei-conversation-pipeline.ts`, `nhei-dimensions-engine.ts`, `nhei-trifecta-engine.ts`, `nhei-context-agency-engine.ts`, `nhei-adaptive-behaviour-engine.ts`): these exist, are unit-tested extensively, and are wired together — but **only** `nhei-nova-chat-educational-integration.ts` is actually imported by `server.ts`'s live chat route, and only when `NHEI_EDUCATIONAL_MODE_ENABLED` (env, default off) **and** the separate Firestore governance kill-switch both allow it. The deeper pipeline files (dimensions/trifecta/context-agency/adaptive-behaviour engines) are reached transitively through that one integration point, never directly from the route. With the flag off (the default, and the state this phase leaves it in), none of this pipeline executes for a real request.
4. **Before Words**: a pre-turn, explicitly quarantined context-injection mechanism (`quarantineTemporaryBeforeWordsContextForPrompt`, `server.ts:3090`). If the client supplies `beforeWordsContext`, it is nonce-delimited and prepended to the **ordinary message text**, never merged into the elevated-trust `systemInstruction` channel — a deliberate trust-boundary fix from Phase 5F. It is request-scoped only (no Firestore read/write), so it cannot persist or leak across turns.
5. **Memory and conversation persistence** — two genuinely separate systems, confirmed distinct: (a) **client-side display cache** — `nova_chat_history` and five sibling `localStorage` keys, UID-scoped since Phase 5N (`src/lib/nova-chat-storage.ts`), which is purely what the browser shows on reload; (b) **server-side durable memory** — `users/{uid}/nova_memories` in Firestore, written only through the `remember_about_user` tool (`executeRememberAboutUser`, `server.ts:2825`) and read only through `search_nova_memories`, both gated by the real `allowNovaMemory && allowNovaUseSavedMemories` consent check (`memoryToolIsAllowed`, `nova-tools.ts`). Phase 5N's fix addressed (a); this phase's new cross-account regression test (§5 below) independently re-confirms (b)'s isolation holds too.
6. **Approved agentic actions**: one real chokepoint — `executeNovaTool` (`server.ts:2908`) — dispatches all six `NOVA_TOOLS` (`search_nova_memories`, `propose_recovery_action`, `remember_about_user`, `suggest_feature`, `offer_guardian_support`, `offer_practical_assistance`). Every action-adjacent tool is **propose/offer-only at this layer**: `offer_guardian_support` and `offer_practical_assistance` each return `{ offered: boolean }` and nothing else, gated by their own server-side flags (`GUARDIAN_SUPPORT_INVITATION_ENABLED`, `NOVA_AGENTIC_JOURNEY_ENABLED`, both default **off**) independent of what the model asks for. `propose_recovery_action` and `suggest_feature` only validate against real, hardcoded catalogs (`isValidRecoveryDuration`, `SUGGESTABLE_FEATURES`) and never execute anything. `nova-claude-tools.ts` exists as the Claude-provider equivalent tool-shape adapter (used only when `NOVA_CHAT_PROVIDER=claude`), not a second, divergent tool-execution path. No separate `nova-tools` vs `nova-claude-tools` execution divergence was found that would let one provider bypass a gate the other enforces.
7. **Guardian/Recovery Ally restrictions**: confirmed, directly in `executeOfferGuardianSupport`'s own code, that no outbound SMS/email is reachable from the live chat path under any configuration right now — the tool can only ever return an offer object. Real outbound Guardian messaging lives entirely in separate, explicitly-invoked routes (`/api/guardian/alert`, `/api/guardian/support-event`) that chat itself never calls.
8. **Feature flags relevant to Nova** (current repo defaults): `NOVA_TOOLS_ENABLED` — default **on** (`envValue !== 'false'`); `NOVA_LIVE_VOICE_ENABLED` — default **on**; `NOVA_AGENTIC_JOURNEY_ENABLED` — default **off** (`envValue === 'true'`); `GUARDIAN_SUPPORT_INVITATION_ENABLED` — default **off**; `NHEI_EDUCATIONAL_MODE_ENABLED` — default **off**. All five were re-confirmed by direct code reading, and the new offline evaluation report (`test-results/nova-intelligence-eval/offline-run-latest.json`) independently captures the three most safety-relevant of these as live evidence from an actual test run: `{"NOVA_TOOLS_ENABLED":true,"NOVA_AGENTIC_JOURNEY_ENABLED":false,"GUARDIAN_SUPPORT_INVITATION_ENABLED":false}`.
9. **Existing test infrastructure**: `vitest.config.ts` (default `npm test` — unit/route tests, `@google/genai` and `firebase-admin` mocked, no real network calls, no emulator required); `vitest.components.config.ts` (React component rendering tests); `vitest.emulator.config.ts` (`*.emulator.test.ts` only, requires a real local Firestore+Auth emulator, run via `npm run test:emulator`, excluded from the default suite); `playwright.config.ts` (the dev-only mock-auth preview harness); `playwright.realapp.config.ts` (real browser tests against the real app + real local emulators). This phase adds a fifth category, `vitest.live-eval.config.ts` (`npm run test:nova-live-eval`), following the exact same "separate config + separate npm script, excluded from the default suite" precedent `*.emulator.test.ts` already established.

**No duplicate Nova service, memory engine, or safety system was created.** The new framework calls the real `/api/nova/chat` route via `supertest` against the real exported `app`, reuses `isValidRecoveryDuration`/`SUGGESTABLE_FEATURES` from `nova-tools.ts` rather than re-encoding the catalogs, and reuses the established mock-`@google/genai` test pattern rather than inventing a second one.

## 3. The evaluation framework (directive §4-§7)

New files, all additive (nothing in `server.ts` or any production Nova/NHEI file was modified):

| File | Purpose |
|---|---|
| `nova-chat-scenario-types.ts` | Shared types: 25 scenario categories, hard-invariant IDs, turn/result/report shapes. |
| `nova-chat-scenario-library.ts` | The 25 synthetic scenarios (§4 below). |
| `nova-chat-evaluation-criteria.ts` | 10 deterministic hard-invariant checks, reusing real app validators. |
| `nova-chat-scenario-runner.ts` | The one shared runner both modes drive scenarios through — mode-agnostic, knows nothing about mocking. |
| `nova-chat-evaluation-report.ts` | Builds and writes structured JSON+Markdown reports to `test-results/nova-intelligence-eval/` (gitignored). |
| `nova-chat-scenario-runner.offline.test.ts` | **Offline mode**: runs all 25 scenarios through the real route with `@google/genai` mocked. Part of `npm test`. |
| `nova-chat-live-model-evaluation-runner.ts` | **Controlled live-model mode** entry point: dual-gated (`NOVA_LIVE_CHAT_EVAL=1` AND a real `GEMINI_API_KEY`), bounded to an allowlisted scenario subset, hard-capped call count, stops on unexpected error. |
| `nova-chat-live-model-evaluation.live-eval.test.ts` + `vitest.live-eval.config.ts` | The only files that may make a real Gemini call, run only via `npm run test:nova-live-eval`, excluded from `npm test`/CI exactly like `*.emulator.test.ts`. |
| `nova-chat-scenario-cross-account-isolation.test.ts` | Directive §10 regression: proves the framework's own memory-touching scenarios cannot leak between synthetic accounts at the server/Firestore layer. |
| `docs/NHEI_KNOWLEDGE_REVIEWER_CHECKLIST.md` | Directive §9 reviewer checklist for all 13 NHEI knowledge entries. |

### Modes, concretely verified this phase

- **Offline**: `npx vitest run nova-chat-scenario-runner.offline.test.ts` → **25/25 passed**, zero real API calls (confirmed by code inspection — `@google/genai` is entirely mocked at the module level), writes `test-results/nova-intelligence-eval/offline-run-latest.{json,md}`.
- **Controlled live-model**: `npm run test:nova-live-eval`, run in this environment with no `NOVA_LIVE_CHAT_EVAL` set and no real `GEMINI_API_KEY` (this environment's actual state, per the dev server's own startup warning). Result: **BLOCKED, reason `not_explicitly_enabled`**, exactly as required — 1/1 test passed, asserting the correct blocked outcome, and a "NOT RUN" report was written rather than any mocked substitute. **No real Gemini API call was made in this phase.**

### Hard invariants vs qualitative review (directive §6)

Ten deterministic hard invariants (`nova-chat-evaluation-criteria.ts`) are checked on every scenario turn, in both modes: crisis-safety floor presence, no fabricated external-action claims (regex heuristic, disclosed as such), Guardian/practical-assistance tool results are offer-only in shape, memory read/write respects the consent flag, `suggest_feature`/`propose_recovery_action` stay within the real catalogs, the per-turn memory-write cap is respected, and no unexpected server error. **These were verified to actually catch failures, not pass vacuously** — a throwaway sanity test (4 deliberately-broken cases: a fabricated-completion phrase, an unconsented memory write, a missing safety floor, a hallucinated `featureId`) confirmed every one is correctly flagged `passed: false`, then was deleted (not part of the shipped suite).

Qualitative fields (`qualitativeReview.focusPerTurn`, `reviewStatus: 'unreviewed'`, `automatedJudgment: null`) are populated structurally for every scenario but **never auto-scored**. No model-based judging was implemented this phase; the `automatedJudgment` field exists specifically so a future addition cannot omit the "this is automated judgment, not independent safeguarding approval" label directive §6 requires.

## 4. The 25-scenario library (directive §5)

All 25 directive-named categories are covered 1:1 (`S01`-`S25` in `nova-chat-scenario-library.ts`), including 5 genuinely multi-turn scenarios where single-turn testing would miss the point: revised preference (S06), declining an offered action (S13), returning to reference a prior conversation (S17), and current-vs-earlier contradictory information (S21). All scenario content is fictional and non-identifying. The library is pure data: adding scenario #26 requires no change to the runner, the criteria module, or either test-mode harness.

## 5. NHEI knowledge entries (directive §9)

Located and inventoried all 13 entries (9 in `nhei-knowledge-content-library.ts`, 4 in `nhei-knowledge-content-drafts.ts`) — confirmed via direct source read, not assumed from prior phase claims. All 13 remain `approvalStatus: 'draft'`, exactly as Phase 3C-2B left them; **nothing was rewritten, activated, or certified this phase**. `docs/NHEI_KNOWLEDGE_REVIEWER_CHECKLIST.md` records, per entry: intended purpose, evidence category as authored, diagnostic/clinical-implication risk, consent/memory implication, and an explicit approve/reject/needs-rewrite column for the real reviewer. Entries #1-9 (the Trifecta + Dimensions + Temporal + Adaptive content) were read and assessed in full; entries #10-13 (the four drafts: SHIP, BLAME, R³, Context and Agency) are explicitly flagged "not reviewed in this pass" rather than given a fabricated risk rating — consistent with every prior phase's rule against inventing a review finding.

## 6. Protecting existing safeguards (directive §8)

Verified by diff, not assertion: this phase's full changeset touches **zero** lines of `server.ts`, zero lines of any `nhei-*.ts` production file, zero feature-flag source files, and zero files from security PR #140. The only non-new-file changes are `vitest.config.ts` (one additional exclude pattern) and `package.json` (one additional npm script). `NOVA_AGENTIC_JOURNEY_ENABLED`, `GUARDIAN_SUPPORT_INVITATION_ENABLED`, and `NHEI_EDUCATIONAL_MODE_ENABLED` all remain at their pre-existing default-off state, captured as live evidence in the offline run's own report. No agentic tool in this app can reach a real email, SMS, or calendar write regardless of this evaluation framework's existence — confirmed both by re-reading `executeOfferGuardianSupport`/`executeOfferPracticalAssistance`/`executeProposeRecoveryAction` and by this phase's own live-model runner never calling any route except `/api/nova/chat`.

## 7. Regression and security testing (directive §10)

All run this phase, against the actual codebase state after this phase's changes:

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| ESLint, all new files | ✅ Zero errors, zero warnings (after removing two unneeded `eslint-disable` comments) |
| Full Vitest suite (`npm test`) | ✅ 4650/4650 passed (331 files) — up from Phase 5N's 4622, the +28 being this phase's own new tests |
| Component tests | ✅ 90/90 passed |
| Firestore security-rules tests (`test-rules.cjs`, against a real local emulator) | ✅ All passed |
| Firestore emulator integration tests (`npm run test:emulator`) | ✅ 21/21 passed |
| Dev-preview Playwright suite (`playwright.config.ts`) | ✅ 66/66 passed (desktop + mobile) |
| Real-app Playwright suite (`playwright.realapp.config.ts`, against real local emulators) | ✅ 19/19 passed (desktop + mobile), including all Phase 5N account-continuity/isolation tests |
| New offline intelligence-evaluation suite | ✅ 25/25 scenarios passed |
| New cross-account isolation regression suite | ✅ 3/3 tests passed (28 sub-assertions across all memory-touching scenarios) |
| New live-model evaluation entry point | ✅ 1/1 passed — correctly BLOCKED, zero real API calls |

No regression was found anywhere; no failure was dismissed without investigation (there were none to dismiss). The pre-existing, already-characterized duplicate-React-key console warning reproduced again during the real-app Playwright run, exactly as in Phase 5N and 5M — confirmed still benign/cosmetic, not re-investigated further this phase (unrelated to this phase's scope).

## 8. Commercial usage/cost observability (directive §11)

What already exists, verified by direct code reading of `entitlements.ts`, `server.ts`'s capability-check functions, and `cost-estimates.ts`:

| Category | What's measured today | Granularity | Gap for real per-customer billing |
|---|---|---|---|
| **Text AI** | `nova_text` capability: daily call count per uid, enforced via `checkAndReserveCapability` | Per-message count only | No real per-token usage captured anywhere (the route's own response never echoes Gemini's `usageMetadata` back); cost is a flat per-message estimate (`cost-estimates.ts`'s `novaTextPerMessage`), not real spend |
| **Voice AI** | `nova_voice` (daily session count) and `nova_voice_minutes` (real cumulative elapsed minutes, measured from actual session open/close timestamps) | Real per-session duration — the most precise metering in the app | Still a flat per-minute cost estimate, not real Gemini Live per-second billing data |
| **Memory retrieval/updates** | Not separately metered — `search_nova_memories`/`remember_about_user` calls ride inside the same single `nova_text` capability check as the rest of that chat turn | None beyond the parent turn | Would need its own capability/counter to attribute cost specifically to memory operations |
| **Background processing** (nudge scheduler, retention sweep) | No dedicated cost/usage metering found | None | Would need new instrumentation if this becomes a billed dimension |
| **External-action proposals** (calendar protection, task deferral) | Proposal/approval state is tracked (for product purposes), but every execution path is currently simulated/non-real (Phase 5I/5J finding, unchanged) | N/A — no real external cost exists yet | Real cost tracking is moot until real execution is authorised; will need building then |
| **Email and SMS** | SMS: `sms_nudges` capability, per-send count via `recordCapabilityUsage`, flat per-segment estimate (`smsPerSegment`). Email: no equivalent per-send capability/counter was found | SMS: per-send count. Email: none | Email sending (Brevo-templated) has no usage counter today — would need one added |
| **Firebase/cloud operations** | No per-customer Firestore read/write/storage cost metering exists (would require Cloud Billing export integration) | None | Full gap — not built |

**Statement per directive's explicit ask**: today, the two capabilities with genuinely usage-based (not merely count-based) per-customer measurement are Nova voice (real elapsed minutes) and, to a lesser extent, Nova text and SMS (call/send counts, with a flat cost-per-unit estimate rather than real provider billing data). Everything else — memory operations, background processing, external-action execution, email, and raw Firebase/cloud spend — either rides inside a coarser counter or has no per-customer metering at all yet. No new pricing, subscription tier, payment entitlement, or billing system was created or modified this phase, and no sensitive customer information was collected for this assessment — it is entirely a review of existing code, not of real usage data.

## 9. Evidence inventory — what's demonstrated vs what still needs real-model evaluation

Carried forward from Phase 5N's own §7 and sharpened with this phase's new framework:

| Category | Status |
|---|---|
| Deterministic orchestration tests | ✅ Extensive (full Vitest suite, Firestore rules/emulator tests) |
| Mocked-model browser/API journeys | ✅ Extensive, now including this phase's 25-scenario offline suite — proves application correctness, never model quality |
| Real Gemini text evaluations | ❌ Still NOT RUN — no live `GEMINI_API_KEY` in this environment, reconfirmed this phase. The infrastructure to run one safely now exists (`npm run test:nova-live-eval`) and is ready for an authorised operator with real credentials. |
| Real Gemini Live voice evaluations | ❌ Still NOT RUN — out of this phase's scope; no voice-specific live-eval harness was built this phase (text chat was the priority; voice would need its own WebSocket-based harness). |
| Independent NHEI safeguarding review | ❌ Still not performed — `docs/NHEI_KNOWLEDGE_REVIEWER_CHECKLIST.md` is new groundwork for it, not a substitute for it. |

**No mocked-model result in this phase's offline suite is presented as evidence of real conversational quality** — every report artifact and this document itself labels offline-mode results as "application orchestration/safety-control evidence only."

## 10. Remaining release blockers / precise blockers before Phase 6B

1. No real Gemini text or voice evaluation has ever been run against this app. `npm run test:nova-live-eval` is ready; it needs an authorised operator to supply a real `GEMINI_API_KEY` and set `NOVA_LIVE_CHAT_EVAL=1` deliberately, then review the resulting `test-results/nova-intelligence-eval/live-run-latest.md`.
2. Independent specialist review of the 13 NHEI knowledge entries has not happened — `docs/NHEI_KNOWLEDGE_REVIEWER_CHECKLIST.md` is ready for that reviewer; entries #10-13 specifically still need their own detailed read (flagged, not guessed at, in this phase's checklist).
3. Token-level cost accounting for the live chat evaluation path is a disclosed gap (the real route's response doesn't expose `usageMetadata`) — live-mode spend is bounded by call count only, not token budget.
4. Email sending has no per-customer usage counter, unlike SMS and Nova voice/text.
5. The pre-existing duplicate-React-key console warning remains unfixed (unrelated to this phase, already characterized as benign).

## 11. Explicit confirmations against directive §13's acceptance requirements

- The ordinary test suite (`npm test`) does not invoke paid Gemini APIs — confirmed by code inspection (`@google/genai` fully mocked) and by the fact the whole suite runs and passes with no real `GEMINI_API_KEY` present.
- Live-model evaluation cannot run accidentally — it requires both an explicit env flag (`NOVA_LIVE_CHAT_EVAL=1`) and a real credential, checked independently, and lives in a file/config excluded from `npm test`/CI by name pattern.
- No genuine external action or message can escape the synthetic test environment — every agentic tool is offer/propose-only at the server layer, independent of this framework.
- All 25 scenarios are registered and executable in both modes (offline always; live-model for the 25/25 that are `allowedForLiveModelEval: true`, subject to the call-count cap).
- Existing account isolation and onboarding remain intact — Phase 5N's full Playwright suite (19/19) re-passed unmodified.
- Existing server-side safety gates remain active — verified both by code diff (nothing touched) and by live evidence in the offline run's own captured feature-flag state.
- Real-model tests are accurately distinguished from mocked tests — every report artifact carries an explicit `mode` field (`offline` vs `live_gemini`) and offline reports carry an explicit disclaimer.
- The project remains production-disabled where previously gated — confirmed, no flag defaults changed.
- No unrelated features or substantial architectural duplication were introduced — the framework reuses the real route, the real tool catalogs, and the established mock pattern throughout.

## 12. Summary

Phase 6A delivers a working, reproducible Nova chat intelligence-evaluation system: 25 synthetic scenarios covering every directive-named category, a shared extensible runner, 10 deterministic hard-safety-invariant checks (verified to actually catch injected failures), structured JSON/Markdown evidence reporting, a dual-gated controlled live-Gemini mode that correctly reports itself as NOT RUN in this credential-less environment, a cross-account memory-isolation regression test extending Phase 5N's own privacy work, and a reviewer-ready checklist for all 13 outstanding NHEI knowledge entries. No real Gemini API call was made anywhere in this phase. No production feature was activated, no security-PR file was touched, and the full existing regression suite (Vitest, components, Firestore rules/emulator, both Playwright suites) passed without a single regression.
