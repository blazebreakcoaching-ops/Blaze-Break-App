# Nova Live Voice Evaluation Procedure (Phase 6D Priority 4)

This document defines the procedure a future, explicitly-authorised phase must follow to run a real, controlled, isolated Gemini Live provider test. **No real audio session has been opened as part of producing this document.** The only code this phase adds is a gate (`nova-live-voice-evaluation-gate.ts`) that a future harness must check before ever calling `ai.live.connect` for evaluation purposes — mirroring the two-gate pattern `nova-chat-live-model-evaluation-runner.ts` already establishes for text. `nova-voice-evaluation-runner.test.ts`'s existing claim ("no live-credential mode exists for voice at all") remains true: this gate is not imported by that file, by `server.ts`, or by any other production or test path today.

## 1. Maximum test duration and budget

- **Per-session duration ceiling:** `MAX_LIVE_VOICE_EVAL_SESSION_MS = 90_000` (90 seconds) — far below the real production `NOVA_LIVE_MAX_SESSION_MS` ceiling (15 minutes), since this is a scripted compatibility check against synthetic audio, not a real conversation.
- **Total budget ceiling:** `MAX_LIVE_VOICE_EVAL_BUDGET_USD = 0.10` — checked before and after every real call, mirroring the text runner's pre-call reservation / post-call true-up pattern (`nova-chat-live-model-evaluation-runner.ts`'s `budgetedInvoker`). A future harness must reuse that same reservation logic, not invent a new one.
- **Scenario count ceiling:** a future harness should cap itself to a small, fixed number of scripted exchanges per session (e.g. 3–5 short turns), the same "deliberately small default, raise explicitly for a larger authorised run" philosophy the text runner's `maxScenarios` uses.

## 2. Synthetic audio inputs

Real user recordings, and any genuine customer audio, must never be used. The future harness must synthesize deterministic 16-bit PCM audio at `CAPTURE_SAMPLE_RATE` (16kHz, matching `useNovaLiveVoice.ts` and the real client's own capture format) entirely in code — e.g. a generated sine-wave tone for a pure wire-format/transport check, and a small set of short, pre-written, non-sensitive synthetic phrases (e.g. "I have a lot on my plate this week") rendered via any offline/local TTS or a simple generated waveform, never a recording of a real person. Each input file/buffer should be checked into the repository (or generated on the fly from a fixed script) so the exact bytes sent are reviewable and reproducible — never recorded ad hoc during the test run itself.

## 3. Expected interruption and turn-taking behaviour

Script at minimum these cases, each with a concrete pass/fail assertion:

1. **Ordinary turn completion** — send one synthetic utterance, wait for the model's audio response, assert a `serverContent.turnComplete` message arrives and the relay sends `{turnComplete: true}` to the (fake, then real) client, matching `handleNovaLiveConnection`'s existing relay logic.
2. **Barge-in / interruption** — send a second synthetic utterance's audio chunks *before* the first turn completes, and assert the real session reports `serverContent.interrupted`, relayed as `{interrupted: true}` — the same assertion `nova-live-gemini-3-8-live-migration.test.ts`'s mocked test already makes, now against a real connection.
3. **Async tool-call scheduling** — trigger a synthetic utterance that should invoke a Nova tool (e.g. phrasing that should cause `offer_practical_assistance`), and confirm the tool-call/tool-response round trip completes and the relay still delivers it correctly under `gemini-3.8-live`'s NON_BLOCKING default scheduling (research finding, Priority 2) — i.e. the relay must not assume the model pauses speaking while a tool call is in flight.
4. **Idle timeout** — after the scripted exchanges finish, send nothing further and confirm the existing idle-timeout path (`NOVA_LIVE_IDLE_TIMEOUT_MS`) still ends the session and bills real elapsed minutes, exactly as `nova-live-websocket.test.ts`'s mocked idle-timeout test already proves for the mocked path.
5. **Max-duration termination** — if the harness's own 90-second ceiling is reached first, confirm the harness itself closes the connection (never relying on the production 15-minute ceiling to do it) and records a real elapsed-time measurement regardless of which side closed first.

## 4. The explicit real-provider execution gate

Implemented in `nova-live-voice-evaluation-gate.ts`, `checkLiveVoiceEvalGate()`:

- **Gate 1 — `NOVA_LIVE_VOICE_EVAL=1`.** Must be set explicitly; its absence blocks the run regardless of whether credentials happen to be configured (mirrors the text runner's own `NOVA_LIVE_CHAT_EVAL` flag).
- **Gate 2 — a real, non-placeholder `GEMINI_API_KEY`.** Checked independently of Gate 1.
- **Both gates must pass.** A future harness must call `checkLiveVoiceEvalGate()` first and, if `allowed` is `false`, write a "NOT RUN" report (mirroring `nova-chat-live-model-evaluation.live-eval.test.ts`'s own blocked-path report) and exit without ever calling `ai.live.connect`. No simulated or mocked result may be substituted and reported as if this gate had passed.
- **This phase's own state:** `checkLiveVoiceEvalGate()` was run against this environment's real `process.env` during this phase (see `nova-live-voice-evaluation-gate.test.ts`'s own "this environment ... is correctly blocked right now" test) and correctly reported blocked — no `GEMINI_API_KEY` is configured in this sandbox at all, and `NOVA_LIVE_VOICE_EVAL` was never set.

## 5. How to measure the actual serving model and cost

This is a genuine, verified gap in the Gemini Live protocol itself, not a gap in this app's code: inspecting the installed `@google/genai` SDK's own type declarations directly (`node_modules/@google/genai/dist/genai.d.ts`), neither `LiveServerMessage` nor `LiveServerSetupComplete` exposes any serving-model-identity field — `LiveServerSetupComplete` carries only `sessionId` and an optional voice-consent signature. This is unlike the single-shot text path, where `GenerateContentResponse.modelVersion` (already read by `server.ts`'s text route, Phase 6B.1) gives a real, server-confirmed serving model per call.

Consequently:
- **Usage/tokens:** `LiveServerMessage.usageMetadata` (type-confirmed: `promptTokenCount`, `responseTokenCount`, `thoughtsTokenCount`, `totalTokenCount`, etc.) IS available per message and must be summed across the session by the future harness — `handleNovaLiveConnection` does not currently capture or relay this field at all, so the harness must read it directly from its own mocked-turned-real `onmessage` callback, not from anything the production relay already forwards to the client.
- **Cost estimate:** price the summed usage via the existing `ai-model-price-registry.ts`'s `estimateModelCostUsd(modelId, promptTokens, outputTokens)`, using the **requested** model id (`gemini-3.8-live`) — explicitly labelled in the report as the requested id, not a protocol-confirmed one, since the Live API never echoes one back.
- **True serving model / true cost confirmation:** the only authoritative source is Google Cloud's own Billing export / API usage console, checked after the test run completes — the report must say this explicitly rather than implying the in-session estimate is a confirmed bill.

## 6. How to verify tool calls cannot send external communications

This is an existing architectural guarantee, true today for both text and voice, independent of which model serves the session: every tool in `NOVA_TOOLS` is dispatched through `executeNovaTool`, whose own implementations (`executeOfferGuardianSupport`, `executeOfferPracticalAssistance`, `executeProposeRecoveryAction`, `search_nova_memories`, `remember_about_user`, `suggest_feature`) are propose/offer/search-only — none of them places a real call, sends a real message, or writes to a real calendar. For the real voice test specifically, the future harness must add an explicit **allowlist assertion**: capture every `toolCall.functionCalls[].name` the real session actually invokes during the run, and fail the test (not just log a warning) if any name appears that is not in the known propose/offer/search-only set — this catches a future, accidental addition of a genuinely side-effecting tool before a real evaluation run could ever exercise it for real. `GUARDIAN_SUPPORT_INVITATION_ENABLED` and `NOVA_AGENTIC_JOURNEY_ENABLED` must also be confirmed `false`/unset for the evaluation account, exactly as `nova-voice-evaluation-runner.test.ts`'s existing V05 scenario already proves for the mocked path.

## 7. What this phase deliberately did not build

No code in this phase opens a real `ai.live.connect` session, under any model. Building the actual harness that calls the real SDK (even gated) is explicitly out of scope until an operator sets both gates deliberately — at which point the harness should be built by extending `nova-voice-evaluation-runner.test.ts`'s own mocking pattern with a second, credential-gated file (mirroring how `nova-chat-live-model-evaluation.live-eval.test.ts` sits alongside the always-mocked `nova-chat-scenario-runner.offline.test.ts`), not by modifying the existing always-mocked file in place.
