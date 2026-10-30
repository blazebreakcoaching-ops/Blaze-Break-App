# Phase 6C Delivery Report — Fix Agentic Journey, Prepare Gemini Live Migration, Complete Release Gates

## 1. Starting and ending SHAs

- **Starting SHA** (last pushed commit on `claude/nhei-phase-1` before this phase): `306af490f823c77c2c48adae2fe2119590be1bb2`
- **Ending SHA** (pushed): `16819a2ba018283aeb35c89febf987918e762fde`
- Two commits this phase, both pushed to `claude/nhei-phase-1`:
  - `2f30fb3` — Priority 2 fix (real-app emulator project-ID mismatch)
  - `16819a2` — Priority 3/4 (Gemini Live migration prep + pricing re-confirmation)
- No merge, no deploy. Security PR #140 and all existing feature flags preserved (verified by diff — see §7).

## 2. Root causes of both failing browser tests

Both named failures in `real-app-flag-gating.spec.ts` (missing `getByLabel('Journey stage')`, missing Invisible Load step under `NOVA_AGENTIC_JOURNEY_ENABLED=true`) had the **same root cause**, and it was not in application code.

The local Firestore/Auth emulators had been started with a project ID that didn't match `.firebaserc`'s configured default project (`gen-lang-client-0537893432`). Every ID token the mismatched-project emulator minted carried a wrong `aud` claim, so the Admin SDK's `verifyIdToken` rejected **every** authenticated request — including `/api/nova/journey-config` — with a generic `401`. `useNovaAgenticJourneyEnabled` is deliberately fail-closed on any fetch failure, so a broken fetch and a genuinely-off flag were indistinguishable from the UI's perspective. Only the flag-ON test could ever expose this, because the flag-OFF tests get the "correct-looking" result regardless of which of the two causes is real.

Independently verified correct and **not modified**: `NovaAgenticJourney.tsx`'s `StageBar`, `useNovaAgenticJourneyEnabled.ts`, `App.tsx`'s mount branch, the `/api/nova/journey-config` route, `novaAgenticJourneyEnabled()` in `nova-tools.ts`, `secureApiFetch`'s retry logic, and the test file itself. No test assertion was weakened or removed.

This exact test-environment misconfiguration had been introduced by me across this session's prior phases (6B.1 and its final-corrections pass) — reported honestly rather than glossed over.

## 3. Fixes implemented

- Added `test:e2e:realapp` to `package.json`, which always resolves the emulator project via `.firebaserc`'s `default` alias (`firebase emulators:exec --only firestore,auth --project default ...`) instead of relying on whoever starts the emulators to pass the correct id by hand. This eliminates the whole class of aud-mismatch failures for every future run, not just this one.
- Added `firebase-tools` as a real `devDependency` to support it.
- No application code changed for this fix — confirmed correct already.

**Verification:** both target tests pass. Confirmed across **three independent full-suite runs** of `npm run test:e2e:realapp` during this phase (plus the original fix-verification run), and via a standalone debug script that captured the `/api/nova/journey-config` request/response directly before and after the fix.

### Third test surfaced during full-suite verification (not a directive target)

Two *additional* tests outside the two named failures intermittently failed during full-suite runs, each time with a different symptom, and each time passing cleanly within seconds when re-run in isolation:
- `real-app-account-continuity.spec.ts`'s registration/onboarding test — traced to `src/lib/sync.tsx`'s real `ui-avatars.com` fallback-avatar request, which this sandbox's network egress policy blocks (41 blocked connections observed in one run, including this host and several Chromium-internal hosts).
- `real-app-nova-journey.spec.ts`'s "suggest_feature(communicate)" and "Secure Account mode" tests — failed once in a 3-way-concurrent full-suite run (modal-intercepts-click timeout; a mocked response never rendering), then passed cleanly in **8.6s and 4.1s** respectively when re-run in isolation. The isolated run's own log shows `WebSocket server error: Port 24678 is already in use` — the exact Vite HMR port collision this project's own Phase 6B already documented as a false-failure cause of running multiple `tsx server.ts` webServer instances concurrently in this sandbox.

Per the directive's own instruction, these were reproduced and explained rather than dismissed: both are environment/resource-contention flakiness under concurrent browser+webServer load in this sandbox, not regressions caused by anything in this phase's diff (which touches only `ai-model-registry.ts`, `ai-model-price-registry.ts`, their tests, and `package.json`/`package-lock.json` — none of which touch `sync.tsx`, `NovaChat.tsx`, or the Secure Account mode logic). They are **not** among the two directive-named failures and are documented here as a known, non-blocking, environment-caused limitation of this sandbox specifically.

## 4. Gemini Live migration readiness

**Audited** the complete Nova Live integration (`server.ts`'s `handleNovaLiveConnection`, `useNovaLiveVoice.ts`):
- **Model identifiers/config**: centralized in `ai-model-registry.ts`; `gemini-3.8-live` added as a selectable evaluation candidate via `GEMINI_LIVE_MODEL_OVERRIDE`, same allowlist-override mechanism as every other model. **Default unchanged** — `gemini-3.1-flash-live-preview` remains active in production.
- **Audio I/O**: 16-bit PCM in at 16kHz / out at 24kHz, confirmed to match this app's existing `CAPTURE_SAMPLE_RATE`/`PLAYBACK_SAMPLE_RATE` constants exactly. No client-side audio pipeline change implied by this migration.
- **WebSocket session lifecycle, interruptions, reconnection**: query-param auth, quota checks (per-session + monthly minutes), idle/max-duration timeouts, graceful `endSession`, `serverContent.interrupted` barge-in relay — all protocol-level and model-agnostic; reported migration note says moving to `gemini-3.8-live` "mostly means changing the model string." Reconnection is manual (user re-triggers `start()`), a deliberate existing design choice, not changed.
- **Function calling/tool permissions**: same `NOVA_TOOLS` set and `executeNovaTool` dispatch used by text chat; async function-calling is reported as supported (and improved) on `gemini-3.8-live`.
- **Usage/cost accounting**: billed by real measured `nova_voice_minutes`, not tokens — model-independent. Added a `gemini-3.8-live` price-registry entry (placeholder, matching the existing Live model's rate) so an override never silently cost-estimates to `null`.
- **Provider compatibility differences found**: `thinking_level` reported unsupported for `gemini-3.8-live` (irrelevant here — the Live connect call never sets `thinkingConfig`); affective dialogue reported removed on one official-looking page but still listed as a feature on another — an unresolved discrepancy, recorded rather than silently resolved either way; a new `BidiGenerateContentContextUpdate` capability exists but this app doesn't need it.
- **Consent/privacy**: unchanged — gated by the browser's native `getUserMedia` microphone-permission prompt, independent of which model receives the audio.

**Important honesty finding**: this phase's own directive stated Google's official schedule lists `gemini-3.1-flash-live-preview` for shutdown on **17 November 2026** with `gemini-3.8-live` as its replacement. That specific claim **could not be corroborated** — `ai.google.dev` is unreachable from this sandbox (confirmed again this phase), and the only reachable cached snapshot of Google's deprecations page for this model shows **"No shutdown date announced."** Only one uncorroborated third-party tracker named `gemini-3.8-live` as the replacement. `gemini-3.8-live` itself does appear to be a real, documented GA model (multiple independent-looking official page titles agree on this), but **do not treat 17 November 2026 as a confirmed date** anywhere downstream of this report.

**Not activated in production. No real compatibility test was run** — the voice evaluation harness (`nova-voice-evaluation-runner.test.ts`) has no live-credential mode at all for Live/voice, by deliberate Phase 6B design; it is structurally incapable of a real connection regardless of environment variables.

## 5. Full test results

| Suite | Result |
|---|---|
| TypeScript (`npm run lint`) | Clean, 0 errors |
| Full Vitest suite (`npm test`) | **336 files / 4713 tests passed** |
| Component tests (`npm run test:components`) | **11 files / 90 tests passed** |
| Firebase security rules + emulator tests (`npm run test:emulator`) | **2 files / 21 tests passed** |
| Real-app Playwright (flag ON/OFF + account continuity) | 21/21 on isolated re-confirmation of every previously-flaky test; both directive-named tests pass on every run; see §3 for the two environment-flake tests |
| Preview Playwright (`npx playwright test`) | **66/66 passed** |
| Offline intelligence evals, memory/privacy/consent, Gemini usage/cost, voice WebSocket eval | All covered as ordinary `*.test.ts` files inside the 4713-test Vitest run above (`nova-chat-scenario-runner.offline.test.ts`, `nhei-consent*.test.ts`, `nova-chat-usage-instrumentation.route.test.ts`, `nova-live-websocket.test.ts`, `nova-voice-evaluation-runner.test.ts`) — all passed |

No failure in this phase's final state was dismissed without being reproduced and explained (see §3).

## 6. Did real Gemini calls occur?

**No.** No paid or real Gemini request was made anywhere in this phase:
- The text live-eval runner requires both `NOVA_LIVE_CHAT_EVAL=1` and a real `GEMINI_API_KEY` — neither was set.
- The voice evaluation harness has no live-credential mode at all (structural, not flag-gated).
- All registry/pricing work this phase was pure code/documentation — no model was invoked.

## 7. Outstanding independent safeguarding requirements

Unchanged from prior phases — no new safeguarding gap was introduced or closed this phase. Confirmed by diff that this phase's entire change surface is `ai-model-registry.ts`, `ai-model-price-registry.ts`, their test files, `package.json`, and `package-lock.json`. None of the following were touched, and all remain disabled/unactivated exactly as before:
- Advanced NHEI functionality
- Guardian outreach
- Unattended agentic actions
- Production calendar writes
- New paid subscription tiers
- The Gemini Live migration itself (selectable for evaluation only; not active)

No funding-plan figures or pricing assumptions were changed — the pricing registry changes this phase are a new, inactive model's placeholder entry plus a same-day independent re-confirmation note on two already-recorded figures (no numbers changed).

## 8. Readiness for an explicitly authorised real-model evaluation

- **Text** (`gemini-3.6-flash` / `gemini-3.8-flash`): the existing live-eval runner already satisfies every one of directive §5's six requirements (explicit model selection via `GEMINI_TEXT_MODEL_OVERRIDE`, real serving-model recording, real usage/cost capture, truncation detection, spend/timeout/retry limits, allowlisted-synthetic-scenarios-only) — confirmed by re-reading `nova-chat-live-model-evaluation-runner.ts` this phase, no code change needed. **Ready**, pending an operator explicitly setting `NOVA_LIVE_CHAT_EVAL=1` plus a real API key and running `npm run test:nova-live-eval`.
- **Voice/Live** (`gemini-3.8-live`): now selectable via `GEMINI_LIVE_MODEL_OVERRIDE`, but **not ready for a real evaluation** — no live-credential test mode exists for voice at all (a deliberate, documented Phase 6B scope decision). Building one would be new work requiring its own safety review before any real bidirectional audio session to Google's endpoint is attempted; this phase deliberately did not build it, consistent with "do not activate the replacement model in production without real compatibility testing and approval" and "do not make paid Gemini requests without explicit authorisation."
