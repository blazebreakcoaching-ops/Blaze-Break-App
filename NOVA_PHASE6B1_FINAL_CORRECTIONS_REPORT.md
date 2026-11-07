# Blaze Break — Final Model Corrections Before Real Gemini Testing — Delivery Report

## 0. Scope and SHAs

- **Starting SHA**: `64e4346` — Phase 6B.1's actual final commit on `claude/nhei-phase-1` (the SHA its own report omitted). Confirmed via `git log` as the tip of both the local checkout and `origin/claude/nhei-phase-1` before this correction pass began.
- **Ending SHA**: the commit this report ships in, on the same branch, pushed with `git push -u origin claude/nhei-phase-1`.
- **No merge, no deploy.** This is a correction pass on Phase 6B.1's own work, not a new architectural phase.

Phase 6B.1's implementation was checked against its own report: cost instrumentation, the dated price-registry mechanism, and the live-eval runner's budget logic were all confirmed present and matching. The one real gap the report itself had: it never recorded its own ending SHA in text (only "the commit this report ships in") — corrected above.

## 1. Model registry corrections (Priority 2)

**New research changed the conclusion from Phase 6B.1's own pass.** The four official URLs supplied in this directive could not be fetched directly — `WebFetch` to `ai.google.dev` fails with `ENOTFOUND` in this sandbox (the host is outside its allowed network domains) — so nothing here is a primary-source page read by this file's author. Several independent web searches were run instead, and this time they converged, across multiple independent third-party sources, on specific, consistent, dated figures that repeatedly cited the same apparent official page titles/URLs (`ai.google.dev/gemini-api/docs/deprecations`, `.../docs/models/gemini-3.5-flash`, `.../docs/pricing`, `docs.cloud.google.com/.../gemini-3-8-flash`). That is meaningfully stronger evidence than the single, contradictory search Phase 6B.1 ran — but it is still search-index corroboration, not a page this author rendered and read, and that distinction is preserved in code comments and below.

On that evidence:
- **gemini-3.5-flash**: reported deprecated (Google's 2026-10-08 release notes), with requests auto-routed to gemini-3.6-flash.
- **gemini-3.6-flash**: reported as the direct, currently-supported replacement.
- **gemini-3.8-flash**: reported as a newer, officially-supported stable text model.

**What changed in code** (`ai-model-registry.ts`):
- Added `GEMINI_MODEL_STATUS`, a record distinguishing `deprecated` (gemini-3.5-flash, gemini-2.0-flash) from `supported_replacement` (gemini-3.6-flash) and `supported_evaluation_candidate` (gemini-3.8-flash), each with a human-readable note and, where known, the model's supported thinking levels.
- Added `getSupportedThinkingLevels(modelId)` for the Priority 3 validation below.
- **`GEMINI_TEXT_MODEL`'s default was NOT changed** — it still resolves to `gemini-3.5-flash` unless `GEMINI_TEXT_MODEL_OVERRIDE` is explicitly set, per the directive's own instruction: "Do not switch the production default model without testing and authorisation." The stronger evidence above changes the registry's *documentation* of status, not the *default* model selection.
- Model IDs were cross-checked against the installed `@google/genai` SDK (`node_modules/@google/genai/dist/genai.d.ts`, v2.4.0) for the fields this phase depends on (see Priority 3/5) — the SDK itself does not enumerate valid model-id strings (they're opaque strings passed to the API), so "verify against the SDK" here means confirming the *generationConfig/usageMetadata/finishReason* shapes this phase relies on are real, which they are.
- Cost calculations now use the actual serving model where available — see Priority 2/4 below (`servingModelId` capture, `novaTextTokenCostUsdAccumulated`).

## 2. Thinking-level/model compatibility (Priority 3)

A search specifically for gemini-3.8-flash's thinking-level support converged across multiple sources (including what present as Google Cloud's own Gemini-3.8-flash docs) on: **MINIMAL is rejected with a provider validation error; LOW, MEDIUM (default), and HIGH are the only supported values.**

- `ai-model-registry.ts`: `GEMINI_MODEL_STATUS['gemini-3.8-flash'].supportedThinkingLevels = ['LOW', 'MEDIUM', 'HIGH']`.
- `server.ts`'s `/api/nova/chat` route now validates `thinkingLevel` against the *configured* model (`GEMINI_TEXT_MODEL`) before any model call: if the level isn't in that model's supported set, the request is **rejected with HTTP 400** naming the model and the valid levels — never silently normalised to a different level, never sent to the provider to find out. Response-length (`maxOutputTokens`) and existing cost controls are untouched.
- New test file `nova-chat-thinking-level-validation.route.test.ts` (4 tests) sets `GEMINI_TEXT_MODEL_OVERRIDE=gemini-3.8-flash` before import (isolated from every other test file's assumption of the default model) and proves: MINIMAL is rejected with 400 and names the model/valid levels; the real call is never attempted; LOW/MEDIUM/HIGH are each accepted and forwarded unchanged to the real `generationConfig.thinkingConfig.thinkingLevel`; omitting the field entirely is unaffected.
- New tests in `ai-model-registry.test.ts` cover `getSupportedThinkingLevels` directly (3.8-flash restricted, 3.5/3.6-flash unrestricted, unknown model returns null).

## 3. Cost-accounting accuracy (Priority 4)

Re-checked and corrected against this pass's new research:

- **Thinking tokens in billable output** — unchanged from Phase 6B.1, re-verified still correct (`estimateNovaTextCostFromMeasuredTokens` folds `thoughtsTokenCount` into the priced output total).
- **Tool-call round trips not double-counted** — unchanged from Phase 6B.1, re-verified still correct (each `sendMessage()` call's own `usageMetadata` is summed once; see that phase's regression test).
- **Cached input tokens, now accounted for conservatively and clearly** (this pass's correction): `ai-model-price-registry.ts` gained a `cachedInputUsdPer1kTokens` field and a new `estimatePotentialCacheDiscountUsd()` function. The *conservative* headline cost (`estimateModelCostUsd`) is **never** discounted — it continues pricing the full prompt-token total (cached tokens included) at the standard input rate. `estimatePotentialCacheDiscountUsd` separately and explicitly states how much *lower* the real bill could be if the documented cache discount applies, returned as its own field (`potentialCacheDiscountUsd`) on both `MeasuredCostField` and the admin `/api/admin/cost-usage` response — never silently subtracted.
- **Missing metadata never becomes fictitious zero-cost usage** — unchanged from Phase 6B.1, re-verified still correct (`usageMetadataAvailable`/`novaTextUsageUnavailableCount`).
- **Token pricing corresponds to the correct model and effective date** — corrected this pass. Two fixes:
  1. `gemini-3.6-flash` now has a real, dated price entry (it had none before): $0.75/$3.75 per million input/output tokens through 2026-12-31, doubling to $1.50/$7.50 from 2027-01-01, with cached-input rates of $0.075/M and $0.15/M respectively — multiple independent sources converged on this exact figure and the Jan-2027 change.
  2. `gemini-3.8-flash`'s post-2027 window was corrected from Phase 6B.1's placeholder (which had guessed the rate stayed flat at $0.75/$3.75) to the same $1.50/$7.50 doubling multiple sources report for 3.6/3.7/3.8 Flash collectively — a more specific, better-corroborated figure superseding the earlier guess.
  3. **Cost calculations now use the actual serving model where available**: `server.ts`'s chat route computes each turn's real cost at write-time using `servingModelId` (from the real `GenerateContentResponse.modelVersion`, when the provider/mock supplies one) rather than always assuming the currently-configured model, and accumulates it into a new `novaTextTokenCostUsdAccumulated` counter. The admin view surfaces this real, serving-model-aware total *alongside* (not instead of) the existing configured-model-only estimate, since older data predates this fix.
- **Estimated costs stay distinguishable from invoices** — unchanged; every figure is still `isEstimate: true` with a `sourceNote`, and the new report/code comments repeat the "search-index corroboration, not a primary-source read" caveat throughout rather than presenting any figure as confirmed against Google's own page.
- Uses the existing `usage_counters` architecture throughout — no second billing system was introduced.

New/updated test coverage: `ai-model-price-registry.test.ts` gained 4 tests (gemini-3.6-flash's two windows, gemini-3.8-flash's corrected post-2027 window, the cache-discount function's null-when-unknown and computed-when-known cases, and proof the conservative estimate is never pre-discounted). `nova-chat-usage-instrumentation.route.test.ts` gained 2 tests proving `servingModelId` is captured from a mocked `modelVersion` field and that the accumulated cost is priced against *that* model (not the configured one) when present, with a fallback test for when it's absent.

## 4. Validation and regression results (Priority 5)

All suites run sequentially (never concurrently), per the standing lesson from Phase 6B's false-failure incident.

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm test` (default suite) | ✅ **336 files / 4,710 tests passed**, 0 failed |
| `npm run test:nova-live-eval` (both gates closed) | ✅ 1/1 passed — reports `blocked`, **no real Gemini call made** |
| `npm run test:emulator` (real Firestore emulator, started for this run via `firebase-tools emulators:exec --only firestore`) | ✅ **21/21 passed** — Phase 6B.1 reported these as *skipped* (no emulator running); this pass actually started the emulator and ran them for real |
| `npm run test:components` | ✅ 11 files / 90 tests passed |
| Preview Playwright (`playwright.config.ts`) | ✅ **66/66 passed** |
| Real-app Playwright (`playwright.realapp.config.ts`, run under real Firestore+Auth emulators via `emulators:exec --only firestore,auth`) | **19/21 passed.** 2 failures, both in the `realapp-flag-on` project (`real-app-flag-gating.spec.ts`, `NOVA_AGENTIC_JOURNEY_ENABLED=true` isolated test configuration) — see below. |

Phase 6B.1 explicitly skipped the emulator and browser suites; this pass ran all of them for real, closing that gap.

**On the 2 real-app failures**: both are in `real-app-flag-gating.spec.ts`'s flag-ON isolated test project (`getByLabel('Journey stage')` / the Invisible Load step never render). This was investigated, not just dismissed:
- Re-ran this spec file alone, three separate times (once inside the full suite, twice in isolation with `--grep`) — **it fails identically and reproducibly every time**, including against the unmodified Phase 6B.1 commit before this pass changed anything.
- This pass's diff touches only `ai-model-registry.ts`, `ai-model-price-registry.ts`, `cost-estimates.ts`, `server.ts`'s chat-route/admin-route usage-and-cost logic, and test files — it does not touch `NovaAgenticJourney.tsx`, the flag-gating code, or anything in the agentic-journey rendering path.
- Two other tests that looked like new failures mid-run (`real-app-nova-journey.spec.ts`'s `suggest_feature` tests, in the flag-OFF default project) were re-run in isolation and **passed cleanly** — that was transient resource contention from running many emulator/browser processes back-to-back in this sandbox (a Vite HMR port collision was visible in the logs), not a real failure, and is not reported as one.
- **Conclusion**: the 2 flag-on failures are a genuine, pre-existing, reproducible gap in the `NOVA_AGENTIC_JOURNEY_ENABLED=true` isolated test path, unrelated to this pass's model/cost diff. Investigating or fixing it is out of scope for this correction pass (it touches agentic-journey feature code, and the directive restricts this pass to targeted model/cost corrections) — reported here as a release blocker rather than silently fixed or silently dropped.

**Verified by diff, not by assertion**: this pass's `git diff --stat` — 7 files changed (`ai-model-registry.ts`, `ai-model-price-registry.ts`, `cost-estimates.ts`, `server.ts`, 3 test files) plus one new test file, 396 insertions / 67 deletions. No line touches NHEI activation, Guardian/agentic execution, production messaging, premium-subscription billing/checkout, or any file under a security-labelled PR. **No paid Gemini API call occurred**: no real `GEMINI_API_KEY` was present at any point; `NOVA_LIVE_CHAT_EVAL` was never set to `1`; the live-eval test confirms the blocked path. **No production deployment occurred.**

## 5. Verified model identities and official price sources

| Claim | Status this pass |
|---|---|
| gemini-3.5-flash deprecated 2026-10-08, auto-routed to gemini-3.6-flash | **Corroborated** across multiple independent search results citing what present as Google's own deprecations/model pages — not a direct primary-source fetch (`WebFetch` to `ai.google.dev` fails in this sandbox: `ENOTFOUND`, host outside allowed network domains). |
| gemini-3.6-flash is the supported replacement | Same corroboration level as above. |
| gemini-3.8-flash is an officially-supported stable text model | Corroborated by multiple sources including what present as Google Cloud's own Gemini-3.8-flash documentation and the Gemini API "what's new" page; still not a direct fetch. |
| gemini-3.8-flash: MINIMAL thinking level unsupported; LOW/MEDIUM(default)/HIGH supported | Corroborated by multiple independent sources agreeing on the same specific restriction, including what present as Google Cloud's own docs stating MINIMAL returns a validation error. |
| gemini-3.6-flash / gemini-3.8-flash standard rate: $0.75/$3.75 per million input/output tokens through 2026-12-31; doubles to $1.50/$7.50 from 2027-01-01; cached-input $0.075/M → $0.15/M | Corroborated by several independent third-party sources agreeing on the exact figures and the January 2027 change (one source states it checked Google's own pricing page directly) — not independently confirmed against `ai.google.dev/gemini-api/docs/pricing` by this author in this environment. |
| `@google/genai` SDK fields relied on (`modelVersion`, `Candidate.finishReason`, `thoughtsTokenCount`, `cachedContentTokenCount`, `toolUsePromptTokenCount`, `ThinkingConfig.thinkingLevel`) | **Confirmed directly** against the installed SDK's own type definitions (`node_modules/@google/genai/dist/genai.d.ts`), not search-derived. |

Every figure above that is search-derived (not SDK-derived) is stated in code as an estimate with its sourcing caveat, per this project's standing rule never to report something as confirmed unless it actually was.

## 6. Remaining release blockers

- **The 2 pre-existing real-app Playwright failures in the flag-on agentic-journey test path** (§4) — unrelated to this pass, not fixed (out of scope), needs its own investigation before `NOVA_AGENTIC_JOURNEY_ENABLED` is ever considered for real use.
- **No figure in this report was read directly from `ai.google.dev` or `docs.cloud.google.com`** — `WebFetch` to those hosts fails in this sandbox. If network access to `ai.google.dev` is enabled for this session (or the real pages are supplied directly), every price/status figure here should be re-verified against the primary source before being treated as final for a real financial or migration decision.
- Every blocker already listed in Phase 6B/6B.1's own reports (external specialist safeguarding review, the 13 NHEI knowledge entries' pending human review, etc.) remains unresolved and untouched.
- `gemini-3.6-flash`/`gemini-3.8-flash` prices are still marked `isEstimate: true` — they are usable for internal budgeting, not for invoicing or contractual commitments.

## 7. Is a controlled real Gemini text evaluation ready for explicit authorisation?

**Mechanically, yes — the safety gates and controls are in place and were re-verified, not merely re-asserted:**
- Both independent gates (`NOVA_LIVE_CHAT_EVAL=1` + a real, non-placeholder `GEMINI_API_KEY`) are unchanged and were just re-confirmed closed in this environment (the live-eval test ran and reported `blocked`).
- The hard per-run USD ceiling, per-call timeout, bounded retries, and the new per-model thinking-level validation (this pass) are all in place and tested with a fake invoker (no real call).
- Every agentic tool remains propose/offer/search-only at the server-tool-execution layer, independent of which model answers.

**What is NOT yet true, and should be resolved first:**
- No figure in §5/§6 has been confirmed against Google's own primary-source pages in this environment — a controlled evaluation against gemini-3.6-flash or gemini-3.8-flash would be budgeted against third-party-corroborated, not primary-source-verified, pricing.
- `GEMINI_TEXT_MODEL` is still `gemini-3.5-flash` by default; evaluating a different model requires deliberately setting `GEMINI_TEXT_MODEL_OVERRIDE` for that run, which is supported but has not itself been exercised against a real API in this pass (no paid call was authorised).

**Recommendation**: a controlled, small, explicitly-authorised real-Gemini text evaluation (existing `maxTotalUsd`/`maxScenarios` budget caps, `GEMINI_TEXT_MODEL_OVERRIDE` left unset to test the current default, or set to `gemini-3.6-flash`/`gemini-3.8-flash` to test a candidate) is mechanically ready to run the moment a human explicitly sets `NOVA_LIVE_CHAT_EVAL=1` and a real `GEMINI_API_KEY` and authorises the spend — this report does not do that itself, per the directive's own restriction, and no such call occurred in producing it.

---

*No merge, deploy, or paid model call occurred. No NHEI, Guardian, agentic-action, production-messaging, or premium-billing feature was activated. No change was made to Security PR #140 or any other file outside the scope listed in §4.*
