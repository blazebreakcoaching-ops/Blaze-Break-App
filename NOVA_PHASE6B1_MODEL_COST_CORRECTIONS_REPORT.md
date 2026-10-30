# Phase 6B.1 — Final Model & Cost Accuracy Corrections — Delivery Report

## 0. Scope and SHAs

- **Starting SHA**: `948e3dc` — Phase 6B's own final commit on `claude/nhei-phase-1`, confirmed via `git log` as the actual tip of both the local checkout and `origin/claude/nhei-phase-1` before this phase began (on top of Phase 6A's `4d634f9`, matching Phase 6B's own acceptance report).
- **Ending SHA**: the commit this report ships in, on the same branch, pushed with `git push -u origin claude/nhei-phase-1`.
- **No merge, no deploy** occurred. This phase is a correction pass on Phase 6B's own work, not a new architectural phase, per the directive's own instruction.

Phase 6B's implementation was spot-checked against `NOVA_PHASE6B_INTELLIGENCE_VALIDATION_ACCEPTANCE_REPORT.md` before any change was made: the report's claimed SHAs (`4d634f9` → `948e3dc`), its description of the `usage_counters`-based cost instrumentation, the live-model evaluation budget mechanism, and the scenario-evaluation framework were all confirmed present and matching in the actual code (`server.ts`, `ai-model-price-registry.ts`, `nova-chat-live-model-evaluation-runner.ts`). No discrepancy was found between that report and the code it describes.

## 1. Priority 2 — Gemini model configuration

**The directive's factual claim could not be confirmed, and was contradicted by what search found.** Before writing any code, a live web search was run for:

- "Gemini 3.5 Flash deprecated Gemini 3.6 Flash API"
- "Gemini 3.8 Flash model API Google AI"

Results:

- **No source was found stating gemini-3.5-flash is deprecated or auto-routed to gemini-3.6-flash.** Google's own docs instead describe gemini-3.6-flash as a **previous-generation** release still available for production use, and list gemini-3.5-flash as a current **migration target** — the reverse of the directive's framing, not a confirmation of it.
- **gemini-3.8-flash appears to be real** — third-party sources agree on the model id and a ~September 2026 release — but its official availability is itself disputed between those sources (one proxy page states Google has not yet published official specs for it at all), and pricing figures conflict ($0.75/$3.75 vs $0.375/$1.88 per million input/output tokens).

Per this project's standing rule never to report something as confirmed unless it actually was, **none of this was treated as verified fact, and the default model was NOT changed.**

**What was built instead:**
- `GEMINI_TEXT_MODEL` and `GEMINI_LIVE_MODEL` (`ai-model-registry.ts`) are now resolved from `GEMINI_TEXT_MODEL_OVERRIDE` / `GEMINI_LIVE_MODEL_OVERRIDE` environment variables, constrained to a small in-file allowlist (`gemini-3.5-flash` / `gemini-3.6-flash` / `gemini-3.8-flash` for text; the existing live-preview model for voice). An override naming a model outside the allowlist is ignored (logs a warning, falls back to the documented default) — a typo or an unverified id can never reach a real API call.
- **Defaults are unchanged**: `gemini-3.5-flash` / `gemini-3.1-flash-live-preview`, exactly as Phase 6B left them.
- The real `/api/nova/chat` route now captures `GenerateContentResponse.modelVersion` (confirmed field name from the installed `@google/genai` SDK's own type definitions, not guessed) into a new `servingModelId` field on the chat response and cost-usage reporting path, so a configured model and an actual serving model can be told apart **when the provider's response actually exposes that information** — today, with mocked/offline tests, this is always `null`, correctly, since no mock supplies it.

## 2. Priority 3 — Token-cost accounting

Audited `server.ts`'s `usageMetadata` capture against the **installed** `@google/genai` SDK's own `GenerateContentResponseUsageMetadata` type (not assumed) and made these corrections:

- **Thinking tokens are now captured and billed.** `thoughtsTokenCount` is summed across every round of a multi-round tool-call turn, same as `promptTokenCount`/`candidatesTokenCount` already were. `estimateNovaTextCostFromMeasuredTokens` (`cost-estimates.ts`) now folds thinking tokens into the billable output-token count before pricing — grounded in the SDK's own documented formula (`totalTokenCount` = prompt + candidates + tool-use + thoughts).
- **Cached and tool-use tokens are captured, with the correct accounting treatment for each.** `cachedContentTokenCount` is surfaced as an informational count only — it is a *subset* of prompt tokens typically billed at a discount, and no verified cache-discount rate exists in the price registry, so it is never folded into a cost total at either the full or a guessed discounted rate (this is stated explicitly in the admin cost-usage response's own `unavailable` notes, not left implicit). `toolUsePromptTokenCount` is captured defensively and added into `totalTokens`, though it is expected to stay at 0 in this codebase's manual (non-SDK-automatic) tool-call loop.
- **Double-counting was audited, not assumed safe.** Summing each `sendMessage()` call's own `usageMetadata` across a multi-round turn is correct, not double-counting, because each call is a separate real provider round-trip and Gemini's chat-session `usageMetadata` reports that one call's own usage, not a running session-cumulative total. A new regression test (`nova-chat-usage-instrumentation.route.test.ts`) asserts this explicitly with two rounds carrying distinct, substantial thinking/cached/tool-use token values (400+600 thinking tokens, etc.) and checks the sum lands on neither the first call's value, the last call's value, nor a doubled value.
- **"Unavailable" is now a real, distinct state from "zero."** A new `usageMetadataAvailable` boolean on the chat response, and a new `novaTextUsageUnavailableCount` Firestore/admin-report counter, track turns where the model/mock returned no `usageMetadata` object at all. These turns are **never** written into `novaTextPromptTokens`/`novaTextOutputTokens` as a fabricated 0, and the admin `/api/admin/cost-usage` response states explicitly that `novaTextUsageUnavailableCount` turns are excluded from `novaTextTokenCostUsd`, not evidence that they cost nothing.
- Regression coverage: 3 new/updated tests in `nova-chat-usage-instrumentation.route.test.ts` (substantial synthetic thinking-token usage, the unavailable-vs-zero distinction, Firestore-doc-level assertions for the new counters).

## 3. Priority 4 — Price registry sustainability

`ai-model-price-registry.ts` was restructured from one flat rate per model to an array of **dated rate windows** (`effectiveFrom`/`effectiveUntil`), with `getModelPriceEntry`/`estimateModelCostUsd` picking the window covering a given date (defaulting to "now" — existing callers that never passed a date keep resolving exactly as before).

- `gemini-3.5-flash` and `gemini-3.1-flash-live-preview` each now have an explicit row covering January 2027 onward, not just the October–December 2026 window — but **carried forward unchanged**, since the live search found no documented source for either model's rate actually changing after 2026. This is stated in the row's own `sourceNote` as "carried forward unverified," not silently presented as a refreshed figure.
- `gemini-3.8-flash` was added with two windows: a promotional-rate window through 2026-12-31 (the one concrete, dated figure the search actually found, from third-party sources — not confirmed against Google's own pricing page) and a post-promotional window using the **higher** of two conflicting third-party figures, deliberately cost-conservative rather than optimistic.
- `gemini-3.6-flash` was deliberately given **no** price entry — the search found no concrete per-token rate for it anywhere, so `estimateModelCostUsd('gemini-3.6-flash', ...)` correctly returns `null` ("unavailable") rather than a fabricated number. It remains selectable via `GEMINI_TEXT_MODEL_OVERRIDE` (Priority 2) should it ever need to be used before a rate is found — it would just cost-estimate as `null`, which is the honest outcome.
- Every figure is still explicitly `isEstimate: true` with a `sourceNote`; none is presented as a provider invoice.
- New dedicated test file: `ai-model-price-registry.test.ts` (7 tests) — window selection by date, the deliberate `gemini-3.6-flash` null case, the default-to-today behaviour, and the gemini-3.8-flash dual-window case.

## 4. Priority 5 — Live-evaluation quality protection

Audited the live-model evaluation runner's token controls against the **installed** `@google/genai` SDK types:

- **Finding**: `maxOutputTokens` bounds thinking tokens and visible output tokens **together**, not separately, for a thinking-capable model (confirmed by the SDK's own `totalTokenCount` formula, which sums thoughts tokens into the same total as candidates tokens). This means the harness's small default cap (512) combined with a high thinking level could make a model spend its entire budget "thinking" and return an empty visible reply — a harness configuration effect, not a sign the model is unintelligent.
- Added a new, bounded, documented `thinkingLevel` config option (`NovaChatLiveEvalConfig.thinkingLevel`, one of the SDK's own four values: `MINIMAL`/`LOW`/`MEDIUM`/`HIGH`), threaded through to the real `/api/nova/chat` route's new `ChatRequestSchema.thinkingLevel` field and the real Gemini `generationConfig.thinkingConfig.thinkingLevel`. Omitted by default — no behaviour change for any existing caller.
- Added truncation detection: the route now surfaces `finishReason` (from the SDK's `Candidate.finishReason`); the live-eval runner counts a call as "truncated by the token cap" only when `finishReason === 'MAX_TOKENS'` **and** the visible response is empty, and reports this count (`truncatedByTokenCapCount`) plus an explicit "TEST-HARNESS LIMITATION (not a quality finding)" note — never conflated with a genuine conversational-quality failure.
- **Re-confirmed, not changed**: both gates (`NOVA_LIVE_CHAT_EVAL=1` and a real, non-placeholder `GEMINI_API_KEY`) are still required independently before any real call can happen. Ran `nova-chat-live-model-evaluation.live-eval.test.ts` directly with both gates closed in this environment (`NOVA_LIVE_CHAT_EVAL` unset, no `GEMINI_API_KEY`) — it passed, reporting `status: 'blocked'`, confirming no real call was made.
- New regression coverage: 3 tests in `nova-chat-live-model-budget.test.ts` for `thinkingLevel` pass-through and truncation detection, using only the fake invoker (no real call).

## 5. Priority 6 — Validation and regression results

All runs below were sequential, not concurrent, per the lesson from Phase 6B's own false-failure incident.

| Suite | Result |
|---|---|
| `npx tsc --noEmit` (full project typecheck) | ✅ clean |
| `npm test` (default suite — cost accounting, live-eval budget, full conversation-scenario offline suite, privacy, safety, every other `*.test.ts`) | ✅ **335 files / 4,695 tests passed**, 0 failed |
| `npm run test:nova-live-eval` (both gates closed) | ✅ 1/1 passed — correctly reports `blocked`, **no real Gemini call made** |
| `npm run test:emulator` | 2 files, 21 tests **skipped** — no live Firestore emulator binary is running in this sandbox; this is a pre-existing environment limitation, not something this phase introduced or could resolve, and no emulator-dependent code was touched this phase |
| `npm run test:components` | ✅ 11 files / 90 tests passed |
| Playwright browser suite (`npm run test:e2e`) | **Not run.** This phase touched zero frontend/UI files — only backend `.ts` logic (model registry, price registry, cost estimation, the chat route's usage capture, the live-eval runner) and their own unit/route tests. The full non-UI regression suite above (4,695 tests, including every `*.route.test.ts` that drives the real `/api/nova/chat` and `/api/admin/cost-usage` routes via supertest) is green. Running the full Playwright suite was judged disproportionate to the actual change surface; flagging this explicitly rather than silently skipping it. |

**Verified un-activated, by diff, not by assertion**: this phase's diff touches exactly `ai-model-registry.ts`, `ai-model-price-registry.ts`, `cost-estimates.ts`, `server.ts` (chat route usage capture + admin cost-usage route only), `nova-chat-live-model-evaluation-runner.ts`, `nova-chat-scenario-runner.ts` (one additive type field), and five test files. No line in this diff touches NHEI activation, Guardian/agentic-action execution, production messaging (Twilio/Brevo send paths), or premium-subscription billing. `git diff --stat` for this phase: 10 files changed, 653 insertions, 86 deletions, all within the above list.

**No paid Gemini API call occurred at any point in this phase.** No `GEMINI_API_KEY` other than the test-mode placeholder was present in this environment at any time; `NOVA_LIVE_CHAT_EVAL` was never set to `1`; the live-eval test run above confirms the blocked path was taken.

**No merge or production deployment occurred.** All work is committed to `claude/nhei-phase-1` only.

## 6. Model and pricing assumptions — what was actually verified vs. carried over unverified

| Claim | Status |
|---|---|
| gemini-3.5-flash deprecated 2026-10-08, auto-routed to gemini-3.6-flash | **Not confirmed.** Live search found no supporting source and found contradicting information (gemini-3.6-flash described as previous-generation; gemini-3.5-flash as a migration target). Default model unchanged. |
| gemini-3.8-flash exists and is API-available | **Partially supported** by third-party sources (model id, release timing, token limits agree) but **officially unconfirmed** — one source states Google's own docs don't yet list it. |
| gemini-3.8-flash pricing: $0.75/$3.75 per million tokens through 2026-12-31 | **Third-party-sourced, not confirmed against Google's own pricing page.** Used as the promotional-window estimate; a conflicting lower figure from one aggregator was not used (conservative choice). |
| gemini-3.8-flash post-2026 pricing | **Disputed between third-party sources**; the higher of two conflicting figures was kept as a conservative placeholder. |
| gemini-3.6-flash pricing (any rate) | **Not found anywhere** — deliberately left unpriced rather than guessed. |
| gemini-3.5-flash / gemini-3.1-flash-live-preview rates changing in January 2027 | **No evidence found either way** — the existing Oct-2026 rate was carried forward unchanged into the new Jan-2027 window, flagged as unverified for that period specifically. |
| `@google/genai` SDK field names (`thoughtsTokenCount`, `cachedContentTokenCount`, `toolUsePromptTokenCount`, `modelVersion`, `Candidate.finishReason`, `ThinkingConfig.thinkingLevel`) | **Confirmed directly against the installed SDK's own `.d.ts` type definitions** (`node_modules/@google/genai/dist/genai.d.ts`), not assumed from memory. |
| `maxOutputTokens` bounding thinking tokens together with visible output for thinking-capable models | Grounded in the installed SDK's own documented `totalTokenCount` formula (sum of prompt + candidates + tool-use + thoughts tokens) — not independently live-verified against a real model response, since no paid call was authorised this phase. |

## 7. Remaining release blockers

- Every item already listed as unresolved in the Phase 6B acceptance report (external specialist safeguarding review, the 13 NHEI knowledge entries' pending human review, etc.) remains unresolved and untouched by this phase.
- The Gemini model-deprecation claim in the original directive remains **unconfirmed either way** — if there is a real, authoritative source for it (a Google changelog entry, a developer console deprecation notice) that this environment's web search could not reach, it should be supplied directly rather than re-asserted, so the registry's allowlist and the price registry's `gemini-3.6-flash` gap can be closed with a real citation instead of guesswork.
- `gemini-3.6-flash` has no price entry — if it is ever selected via `GEMINI_TEXT_MODEL_OVERRIDE`, cost estimation for it will silently (and correctly) return `null` until a real rate is sourced and added.
- The Playwright browser suite was not run this phase (see Priority 6 table) — recommended before any future phase that touches frontend files, not required by this one.

---

*No merge, deploy, or paid model call occurred. No NHEI, Guardian, agentic-action, production-messaging, or premium-billing feature was activated.*
