# Phase 6B — Real Intelligence Validation, Cost Instrumentation & Safeguarding Readiness — Acceptance Report

## 0. Scope and SHAs

- **Starting SHA**: `4d634f9` (Phase 6A delivery commit, branch `claude/nhei-phase-1`) — confirmed via `git log` as the actual tip of both the local checkout and `origin/claude/nhei-phase-1` before this phase began, matching the directive's own identified value.
- **Ending SHA**: the commit this report ships in, on the same branch.
- No merge, deployment, or production feature activation was performed. Security PR #140 was not touched (confirmed by diff: no file this PR modified intersects with this phase's changeset). No real customer data was used — every synthetic identity, scenario, and conversation in this phase's testing is fictional, run against local fakes/emulators.
- **Real-model calls made this phase: NO.** `GEMINI_API_KEY` is not configured in this environment (reconfirmed); `NOVA_LIVE_CHAT_EVAL` was never set to `1`. The controlled live-model chat evaluation entry point correctly reported `BLOCKED` every time it was exercised this phase. Zero real Gemini API calls, zero cost incurred.

## 1. Verification of Phase 6A (directive §1)

- Identified the real final pushed SHA directly via `git log` on both the local checkout and `origin/claude/nhei-phase-1`: `4d634f9` (Phase 6A's report had already correctly self-identified this).
- Confirmed the branch matches Phase 6A's reported changes: `git show --stat 4d634f9` lists exactly the 12 files Phase 6A's own report claims, no more, no less.
- Verified the 25-scenario evaluation framework and test scripts exist and pass: re-ran `nova-chat-scenario-runner.offline.test.ts` (25/25 before this phase's expansion), `nova-chat-live-model-evaluation.live-eval.test.ts` (1/1, correctly BLOCKED), and the cross-account isolation suite (3/3) — all passed before any Phase 6B change was made, establishing a clean baseline.
- Reviewed the changed files for discrepancies: none found. Phase 6A's own claims (reuse of `nova-tools.ts` catalogs, no production file touched beyond `vitest.config.ts`/`package.json`, honest BLOCKED reporting) were independently re-verified and hold.
- All existing privacy protections and feature flags preserved — verified by diff: `NOVA_AGENTIC_JOURNEY_ENABLED`, `GUARDIAN_SUPPORT_INVITATION_ENABLED`, `NHEI_EDUCATIONAL_MODE_ENABLED` remain untouched, all still default-off.
- Security PR #140: not modified, not merged, not deployed.

## 2. Cost instrumentation (directive §2)

Audited the real Gemini response pathway (`/api/nova/chat` in `server.ts`) and implemented structured, Firestore-based measurement — reusing the EXISTING `usage_counters` architecture (`users/{uid}/usage_counters/{dayKey|monthKey}`), never a second billing system:

| Signal | Implementation |
|---|---|
| **Input/output tokens** | Captured from the real Gemini SDK's `usageMetadata.promptTokenCount`/`candidatesTokenCount` on every `chat.sendMessage()` call this turn makes (including tool-call round-trips), accumulated per turn, written to `usage_counters` as new `novaTextPromptTokens`/`novaTextOutputTokens` fields, and returned to the caller in the response's new `usage` field (token counts only — no conversation text). Missing/malformed `usageMetadata` degrades to 0, never invented. |
| **Model name/version, actual reported usage** | `GEMINI_TEXT_MODEL` (`gemini-3.5-flash`, from `ai-model-registry.ts`) is the model id attached to every usage record and report; "actual reported usage" is exactly the `usageMetadata` above - real SDK data, not an estimate. |
| **Model API calls per account** | Already covered by the existing `nova_text` capability daily count (`checkAndReserveCapability`); unchanged this phase. |
| **Voice session duration** | Already real and precise (`nova_voice_minutes`, elapsed wall-clock duration) - confirmed unchanged and still the most accurate metering in the app. Available Live-API usage metadata: **none found** - `LiveServerMessage`'s shape (server.ts's Nova Live relay) carries no `usageMetadata` field; this is reported as **unavailable**, not estimated. |
| **Memory searches and writes** | New `recordNovaToolUsageMetric` function, called once from the single shared `executeNovaTool` dispatcher (used by BOTH text chat and Nova Live voice, so one instrumentation point covers both surfaces). Increments `novaMemorySearchCount` on every `search_nova_memories` call, and `novaMemoryWriteCount` only when `remember_about_user` actually saved (`output.saved === true`) - a call the tool itself refused (no consent) is not counted as a real operation. |
| **Background reasoning calls** | Audited: no background job anywhere in this codebase currently calls a paid Gemini model. Reported as **N/A today**, not instrumented with an invented placeholder. |
| **Email and SMS usage** | SMS: already measured (`allSmsCount`/`categoryCounts`), unchanged. Email: audited `sendBrevoEmail` - **no counter exists**, confirmed via code read; reported as a genuine, not-yet-closed gap, not silently assumed to be covered by the SMS figures. |
| **Agentic-action proposals** | New `agenticProposalCount` + `agenticProposalsByTool` breakdown, incremented only when `offer_guardian_support`/`offer_practical_assistance`/`propose_recovery_action`/`suggest_feature` actually succeeded (`offered`/`proposed`/`suggested === true`), via the same `executeNovaTool` chokepoint. |
| **Cost estimates by customer and capability** | `/api/admin/cost-usage`'s new `measured` field surfaces all of the above, plus `novaTextTokenCostUsd` (via `estimateNovaTextCostFromMeasuredTokens`, cost-estimates.ts) - the one cost figure in that response derived from real tokens rather than a flat per-message assumption, still clearly labelled `isEstimate: true`. An explicit `unavailable` sub-object names exactly what still can't be measured (background reasoning, email, voice token usage, raw cloud spend) rather than omitting those rows silently. |

**Configurable model-price registry**: new `ai-model-price-registry.ts` - `MODEL_PRICE_REGISTRY`, one entry per model id, each carrying `inputUsdPer1kTokens`, `outputUsdPer1kTokens`, a `sourceDate`, `isEstimate: true` (always, today - no live provider billing API is integrated anywhere), and a `sourceNote` disclosing exactly how stale/rough the figure is. This also fixed a real latent bug in the existing `nhei-real-model-evaluation-runner.ts`: its own prior local cost table only listed `gemini-2.0-flash`, a model this app no longer uses (`GEMINI_TEXT_MODEL` is `gemini-3.5-flash`) - every real run that runner could ever make would have silently reported a `null` cost estimate. Both that runner and the new instrumentation now read from the one shared registry.

**Storage discipline**: every new counter is a plain number (a count or a token count) on the existing `usage_counters` document - no conversation text, scenario content, or model output is ever written for financial-reporting purposes, satisfying the directive's "store only necessary numerical usage metadata, never sensitive conversation text."

## 3. Live-model evaluation safety budget (directive §3)

`nova-chat-live-model-evaluation-runner.ts` was substantially strengthened, on top of Phase 6A's existing dual gate (explicit `NOVA_LIVE_CHAT_EVAL=1` flag + real credential check):

| Control | Implementation | Enforcement type |
|---|---|---|
| Explicit live-test opt-in | `NOVA_LIVE_CHAT_EVAL=1`, unchanged from Phase 6A | Real, hard gate |
| Maximum API request count | `maxScenarios` (default 3), unchanged from Phase 6A | Real, hard gate |
| Maximum input tokens/call | `maxEstimatedInputTokensPerCall` (default 4000) - caps the PRE-CALL conservative estimate used for budget reservation math | Soft - this harness fully controls what it sends, so it is a real ceiling on what the harness will ever attempt to send, but is not a provider-side enforcement of the real tokenizer's count |
| Maximum output tokens/call ("maximum model response length") | `maxOutputTokensPerCall` (default 512), threaded through a new, additive, strictly cost-reducing `ChatRequestSchema.maxOutputTokens` field into the real Gemini `generationConfig` | **Real, provider-enforced hard cap** - the one genuinely provider-side control this phase achieved |
| Conservative pre-request budget reservation | Before every call, estimates input tokens (a deliberately pessimistic chars-per-token heuristic, explicitly disclosed as not a real tokenizer) plus the full `maxOutputTokensPerCall` ceiling, prices it via the model-price registry, and refuses the call outright if already-spent-plus-this-call's-worst-case would exceed `maxTotalUsd` (default $0.05) | Real - verified by test to refuse the call BEFORE the invoker is ever reached |
| Automatic stop on budget exhaustion | Post-call true-up using the REAL usage server.ts now returns; if real cumulative spend exceeds `maxTotalUsd`, the next call is refused the same way | Real - verified by test using a deliberately huge fake usage response |
| Request timeout | `requestTimeoutMs` (default 20000ms), via a `Promise.race` wrapper | Real - verified by test with a deliberately hanging fake invoker |
| Retry limit ("no unbounded retries") | `maxRetriesPerCall` (default **0**) - a bounded `for` loop, never a while/recursive retry | Real - verified by test: exactly `1 + maxRetriesPerCall` attempts, never more, on a persistently-failing call |
| Final usage-and-cost report | `buildRunReport`'s `usage`/`estimatedCostUsd` fields now populated from real accumulated tokens (previously always `null` in Phase 6A, by that phase's own disclosed design trade-off) | Real, built from real per-call usage |

**Honest limitation disclosure** (as the directive requires when hard pre-request monetary enforcement is impossible): true pre-request enforcement of the EXACT dollar cost of a call is not possible before the call completes, because the real token count is only known from the provider's own response. The "maxEstimatedInputTokensPerCall" + reservation mechanism is the strongest available CONSERVATIVE substitute - a deliberately pessimistic estimate that errs toward refusing a call too early rather than too late - combined with the one genuinely provider-enforced control available on this integration point (`maxOutputTokens`, a real hard ceiling on response length/cost).

**Verification without any real API access**: a new `nova-chat-live-model-budget.test.ts` (6 tests, runs under plain `npm test`, zero real HTTP/Gemini calls - a fake `vi.fn()` invoker only) proves every one of the above mechanisms actually works: refuses pre-call over budget, stops post-call over budget, passes `maxOutputTokens` through, treats a timeout as a failure with no retry, retries exactly `maxRetriesPerCall` times and no more, and never retries when the limit is 0 even if a later attempt would have succeeded.

**Live tests remain disabled by default** - confirmed again this phase: no real Gemini call was made (see §0).

## 4. Scenario-evaluation framework completion (directive §4)

Reviewed the original 25 scenarios for weaknesses and added **10 new scenarios** (`S26`-`S35`) in `nova-chat-scenario-library.ts`, closing every named gap:

| Gap named in the directive | New scenario |
|---|---|
| Multi-turn consistency | `S26_multi_turn_consistency` |
| Unsupported assumptions | `S27_unsupported_assumption_check` |
| Poor or generic responses | `S28_generic_response_check` |
| Incorrect memory recall | `S29_incorrect_memory_recall_check` |
| User correction and withdrawal of consent | `S30_consent_withdrawal_mid_conversation` (distinct from the existing single-turn S9/S24 - this one withdraws consent PARTWAY through a conversation and asserts the very next turn is already blocked) |
| Repeated or unwanted follow-ups | `S31_repeated_unwanted_followups` |
| Action claims without completed actions | `S32_action_claim_without_completion` |
| Failure to acknowledge uncertainty | `S33_failure_to_acknowledge_uncertainty` |
| Boundary protection under misleading instructions | `S34_boundary_protection_under_misleading_instructions` (a DIRECT jailbreak attempt in the user's own message, distinct from S25's retrieved-context version) |
| Appropriate handling of mental health concerns | `S35_mental_health_concern_second_presentation` (a second, more indirect crisis phrasing, so the safety floor isn't only ever proven against S16's one wording) |

**New mechanism**: `permissionsDocAfterThisTurn` on a scenario turn, applied by a new `onAfterTurn` hook the shared runner (`runScenario`) now accepts and calls once per turn, used by `S30` to simulate a REAL mid-conversation consent change rather than a scenario-wide static setting. The runner itself still has zero Firestore/mocking knowledge - it only invokes whatever hook the caller supplies, preserving the directive's "extensible without rewriting its runner" property (confirmed: none of the 10 new scenarios required any runner code change beyond this one new optional hook parameter, which is itself data-driven).

**New hard invariant**: `memory_recall_matches_stored_content` (`nova-chat-evaluation-criteria.ts`) - a genuinely deterministic, mechanically-checkable property (does `search_nova_memories`'s returned content actually match what was really seeded), not a qualitative judgement.

**Separate, explicitly-disclaimed heuristic signals** (directive: "Regex or phrase-matching checks must not be represented as proof of clinical or safeguarding quality"): a NEW `nova-chat-heuristic-signals.ts` module, a bucket entirely separate from the real hard invariants, with three weak phrase/length heuristics (`generic_response_signal`, `uncertainty_acknowledgment_signal`, `repeated_offer_signal`), each carrying an explicit "WEAK SIGNAL ONLY" disclaimer in its own result `note`, applied only where a scenario opts in via `heuristicSignalChecks`. These are reported in a new `heuristicSignals` field on every turn result, visually and structurally distinct from `hardInvariants` - a report reader cannot mistake one bucket for the other.

**Mocked vs real responses remain clearly distinguishable**: every offline scenario's `offlineModelResponse` is explicitly scripted data (unchanged convention from Phase 6A); the live-model path is the only one that can ever carry a real response, and the report's own `mode` field (`offline` vs `live_gemini`) names which one produced any given result.

## 5. Nova Live voice evaluation infrastructure (directive §5)

Built `nova-voice-scenario-library.ts` (6 named scenarios: `V01`-`V06`, categorised `interruption_handling` / `session_termination` / `permission_boundary`) and `nova-voice-evaluation-runner.test.ts`, which drives the REAL, unmodified `handleNovaLiveConnection` (server.ts) against a mocked `ai.live.connect` - the exact mocking pattern `nova-live-websocket.test.ts` (QA Batch 2) already established, reused rather than duplicated.

- **Disabled by default / cannot send real communications**: there is no live-Gemini-Live mode anywhere in this harness or this codebase at all (unlike text chat) - `ai.live.connect` is unconditionally mocked, a deliberate scope decision (a real bidirectional audio WebSocket to Google's endpoint cannot be safely bounded the way one HTTP call can, within this batch) rather than a runtime gate that could be misconfigured.
- **Uses only synthetic scenarios, has explicit limits**: all 6 scenarios are synthetic; the harness reuses the real handler's own existing duration/idle/memory-write-cap limits (`NOVA_LIVE_MAX_SESSION_MS`, `NOVA_LIVE_IDLE_TIMEOUT_MS`, `MAX_VOICE_MEMORY_WRITES`), never introduces new unbounded ones.
- **Tests interruption handling, session termination and permission boundaries** (the directive's own three required categories):
  - `V01` (interruption): asserts `serverContent.interrupted` is relayed to the client as `{interrupted:true}` - previously **untested anywhere** in this codebase.
  - `V02` (session termination via idle timeout): asserts the session ends and bills real elapsed minutes after `NOVA_LIVE_IDLE_TIMEOUT_MS` with no activity - distinct from, and previously **untested** alongside, the existing max-duration test.
  - `V05` (permission boundary): asserts `offer_guardian_support` never relays a Guardian offer to the VOICE client while `GUARDIAN_SUPPORT_INVITATION_ENABLED` is off - previously **untested for the voice path specifically** (only text chat's equivalent existed).
  - `V03`/`V04`/`V06` are cross-referenced, not duplicated, to their existing coverage in `nova-live-websocket.test.ts` (max-duration termination, clean client-close termination, and the memory-write cap under a burst).
- **Reports what was actually tested versus mocked**: an `afterAll` hook writes `test-results/nova-intelligence-eval/voice-offline-run-latest.json`, explicitly labelled `mode: 'offline_mocked_only'`, listing which scenarios ran in THIS file versus which are cross-referenced to existing coverage, and asserting (failing the suite if not) that all 6 registered scenarios are accounted for one way or the other.

No unrestricted real voice evaluation was enabled or attempted.

## 6. NHEI knowledge-review preparation (directive §6)

Read all 13 existing knowledge entries in full from source (`nhei-knowledge-content-library.ts` entries #1-9, `nhei-knowledge-content-drafts.ts` entries #10-13). Entries #1-9 were already analysed in Phase 6A; this phase completed the detailed analysis for **entries #10-13** (SHIP, BLAME, R³, Context and Agency), previously flagged "not reviewed in this pass":

| Entry | Key finding this phase |
|---|---|
| #10 SHIP Framework | Low-medium risk; explicitly disclaims clinical staging; flagged a real consent-adjacent dependency (any live pairing with a user's Adaptive Behaviour history must go through that system's own consent gate). |
| #11 BLAME Method | Low-medium content risk; flagged the acronym itself ("BLAME") as a separate tone/connotation risk worth escalating as a product/copy question, independent of the content's own accuracy. |
| #12 R³ | Low risk; notably careful about not overclaiming implementation status; flagged a maintenance risk (this entry would go stale if R³ is ever actually built as a real feature with different mechanics). |
| #13 Context and Agency | Medium risk - genuinely closest of the 13 to a real psychological/sociological construct (locus of control); flagged as needing a qualified human's tone judgement specifically, plus a real dependency on the live NHEI Context and Agency engine's output never being conflated with this static entry's text. |

**None of the 13 entries were approved, activated, or certified** - every entry remains `approvalStatus: 'draft'` in source; no `reviewerId`/`lastReviewedAt` was set; the import mechanism (`nhei-knowledge-import-service.ts`) was not invoked.

`docs/NHEI_KNOWLEDGE_REVIEWER_CHECKLIST.md` was updated in place with this analysis (replacing "not reviewed in this pass" for #10-13) and extended with a new **"Reviewer package contents"** section naming exactly where each required piece lives: the actual entries (source files), evaluation criteria (`validateKnowledgeEntry` + this document's own table columns), synthetic adversarial scenarios (`NHEI_ADVERSARIAL_FIXTURES` + this phase's own `S25`/`S34`), and unresolved risks (the table's own risk columns + `docs/NHEI_RELEASE_BLOCKERS.md` item 1).

## 7. Protecting the existing app (directive §7)

Verified by diff, not assertion - this phase's full changeset touches zero lines of `firestore.rules`, zero feature-flag DEFAULT values, and zero files from security PR #140:

- Phase 5N account isolation: `nova-chat-scenario-cross-account-isolation.test.ts` (Phase 6A) re-passed unmodified, 3/3.
- Consent-gated memory access: unchanged logic; the new `S30` scenario and the new `memory_recall_matches_stored_content` invariant exercise it more thoroughly, never weaken it.
- Server-side action permissions: `executeOfferGuardianSupport`/`executeOfferPracticalAssistance`/`executeProposeRecoveryAction` unchanged - still propose/offer-only, independent of this phase's new instrumentation wrapping them.
- Disabled advanced NHEI flags, disabled Guardian outbound, disabled agentic-journey defaults: all re-confirmed still at their pre-existing default-off state (`NOVA_AGENTIC_JOURNEY_ENABLED`, `GUARDIAN_SUPPORT_INVITATION_ENABLED`, `NHEI_EDUCATIONAL_MODE_ENABLED`).
- No production feature activation, real external messaging, live calendar modification, or new paid subscription tier was introduced - §8's commercial report is explicitly an inputs inventory, not a pricing decision or billing system.

## 8. Commercial reporting (directive §8)

`docs/NOVA_PHASE6B_COMMERCIAL_COST_INPUTS_REPORT.md` - a developer-only inputs inventory for three commercial-modelling candidates (Essential £5.99, Continuity £24.99, Executive £59.99 - explicitly labelled as modelling candidates, not approved prices), distinguishing for every input: measured usage, estimated cost, unavailable information, and assumptions needing real customer evidence (principally: no real paying customers exist on any tier yet, since there is no live checkout - any usage/cost figure is based on this environment's synthetic testing, never real customer behaviour). No per-tier profitability was invented; no pricing page was created or linked.

## 9. Full regression testing (directive §9)

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| ESLint, all changed/new files | ✅ Zero errors (45 pre-existing warnings in `server.ts`, confirmed by line-number inspection to be unrelated catch-block patterns this phase did not introduce or touch) |
| Full Vitest suite (`npm test`) | ✅ 4680/4680 passed (334 files) — up from Phase 6A's 4650, the +30 being this phase's own new/expanded tests |
| Component tests | ✅ 90/90 passed |
| Firestore security-rules tests (`test-rules.cjs`, real local emulator) | ✅ All passed (firestore.rules itself untouched this phase) |
| Firestore emulator integration tests (`npm run test:emulator`) | ✅ 21/21 passed |
| Offline intelligence scenarios (25 original + 10 new) | ✅ 35/35 passed |
| Cross-account memory regressions | ✅ 3/3 passed |
| New usage/cost tests (`nova-chat-usage-instrumentation.route.test.ts`) | ✅ 11/11 passed |
| New live-model budget control tests (`nova-chat-live-model-budget.test.ts`) | ✅ 6/6 passed |
| New voice-harness offline tests (`nova-voice-evaluation-runner.test.ts`) | ✅ passed (V01/V02/V05 + report-writing assertion) |
| Live-model evaluation entry point | ✅ 1/1 passed — correctly BLOCKED, zero real API calls |
| Real-app Playwright suite (desktop+mobile) | ✅ 19/19 passed |
| Dev-preview Playwright suite (desktop+mobile) | ✅ 66/66 passed |

**One real investigation worth recording**: an initial run that launched both Playwright suites concurrently in the background showed 4 real-app failures and 3 preview-suite failures (overlay-click timing and `browserContext.close: ENOENT` trace-artifact errors). Per the directive's explicit instruction not to dismiss a failure as pre-existing without evidence, this was investigated rather than waved away: `git stash` reverted every Phase 6B file to the Phase 6A baseline, and the exact same 4 real-app tests were re-run in that reverted state - all 4 **still failed identically** when run concurrently with the other suite. Both suites were then re-run sequentially (not concurrently) with Phase 6B's changes restored: **19/19 and 66/66, all passed**. This confirms the failures were caused by resource contention between two simultaneous Playwright/webServer processes on this machine, not by any Phase 6B code change - a real, evidenced conclusion, not an assumption.

No regression was found anywhere; no failure was dismissed without investigation.

## 10. Status of all 13 NHEI knowledge entries

All 13 remain `approvalStatus: 'draft'`. Entries #1-9 were fully analysed in Phase 6A; entries #10-13 were fully analysed this phase (§6 above). None has been imported into Firestore, approved, rejected, or certified by an independent reviewer.

## 11. Unresolved safeguarding issues

1. No independent specialist review of any of the 13 knowledge entries has occurred - the reviewer package (§6) is ready, but review itself has not happened.
2. No real Gemini text or voice evaluation has ever been run against this app (see §0) - the infrastructure to do so safely now exists (`npm run test:nova-live-eval`, strengthened budget controls this phase), and needs an authorised operator with real credentials.
3. Email sending has no usage counter (unlike SMS and Nova text/voice) - a genuine, disclosed cost-instrumentation gap.
4. The pre-existing duplicate-React-key console warning remains unfixed (characterised as benign/cosmetic in Phase 5N/5M, unrelated to this phase's scope).
5. BLAME's acronym-level tone risk (§6, entry #11) is a product/copy question this phase surfaced but did not resolve.

## 12. Remaining external specialist-review requirements

- A named, independent, qualified reviewer must act on all 13 knowledge entries through the real `POST /api/admin/nhei-knowledge/entries/:entryId/review` route - entries #13 (Context and Agency) and #11 (BLAME) specifically need a human's tone/connotation judgement this phase's engineering read cannot substitute for.
- A real Gemini text/voice evaluation, run by an authorised operator with real credentials under the now-strengthened budget controls, reviewed by a human before any claim is made about real conversational quality.

## 13. Precise readiness verdict for controlled, authorised real Gemini testing

**Ready, pending explicit authorisation and real credentials.** The infrastructure (`npm run test:nova-live-eval`) now has: explicit opt-in, a hard scenario-count cap, a real provider-enforced response-length cap, a conservative pre-request budget reservation, a post-call budget true-up, a bounded timeout, and a bounded (default-zero) retry count - every control the directive asked for either implemented as a real enforcement or, where that was not technically possible (exact pre-request dollar cost), implemented as the strongest available conservative substitute, with that limitation explicitly disclosed (§3). No code change in this phase makes any paid call; none was made. The remaining blocker to running it for real is organisational (an authorised operator supplying real credentials and setting the budget), not technical.

**This phase does not claim to prove Nova's actual conversational intelligence** - every scenario this phase added runs in offline/mocked mode under the default suite; the live-model path remains NOT RUN in this environment. **This phase does not claim independent safeguarding completion** - the knowledge-entry analysis in §6 is an internal engineering read, explicitly not a substitute for the named human reviewer §12 still requires.
