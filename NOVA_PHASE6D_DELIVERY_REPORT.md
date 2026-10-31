# Phase 6D Delivery Report — Real Nova Evaluation, Voice Migration Validation & Final Quality Evidence

## 1. Starting and ending SHAs

- **Starting point named by the directive:** `16819a2ba018283aeb35c89febf987918e762fde`.
- **Actual verified remote branch head at the start of this phase** (per the directive's own "after verifying the current remote branch head"): `7975f9d3c62a4389d02abc6d1466edb4d404121b` — one commit ahead of the named SHA (Phase 6C's own delivery-report commit, added after Phase 6C's code work). Confirmed local/remote agreement via `git fetch` before starting.
- **Ending SHA (pushed):** `df9de712bbedc6d63ffbfdd54c0c241906843f58`.
- Three commits this phase, all pushed to `claude/nhei-phase-1`: `ef0d350` (Priority 1), `662a54d` (Priority 2), `df9de71` (Priority 4). No merge, no deploy.

## 2. Browser-test stability results

Two real, previously-reproduced causes of intermittent failure were fixed at the source, not worked around:

- **Vite HMR port collision:** `playwright.realapp.config.ts` runs two concurrent `tsx server.ts` processes; each one's Vite dev middleware opened its own HMR WebSocket server on the same default port (24678), logging `"WebSocket server error: Port 24678 is already in use"`. `server.ts`'s `setupVite()` now accepts an optional `VITE_HMR_PORT`; the real-app config assigns a distinct port to each webServer. Omitted anywhere else (ordinary `npm run dev`, production), behaviour is unchanged.
- **External avatar dependency:** every anonymous/newly-registered test identity has no `photoURL`, so real `App.tsx` makes a genuine `ui-avatars.com` request (`src/lib/sync.tsx`) this sandbox's network policy can block. Added `tests/e2e/test-helpers.ts`'s `mockAvatarRequests()`, wired into all three real-app spec files, fulfilling that one request with a deterministic local PNG. `sync.tsx` itself is untouched.

**Full-suite results (not isolated reruns):**
- Real-app suite (`npm run test:e2e:realapp`): **21/21 passed**, run twice in full, back to back. Neither run logged the port-collision error or any avatar-related failure.
- Preview suite (`npx playwright test`): **66/66 passed**, run immediately after the real-app suite's second run.
- Both suites were run sequentially (never concurrently with each other), as instructed.

## 3. Gemini Live compatibility findings and fixes

Research this phase (search-index corroboration only — `ai.google.dev`, including the exact URL the directive named, remains unreachable from this sandbox: `WebFetch -> ENOTFOUND`, re-confirmed by direct attempt) reached what present as cached snapshots of Google's actual `gemini-3.8-live` migration-notes text and surfaced concrete, checkable differences beyond Phase 6C's findings:

| Finding | Reported behaviour on `gemini-3.8-live` | This app's current Live config |
|---|---|---|
| `thinking_level` | Not accepted at all | Never sent on the Live path — compatible |
| Affective dialogue | Removed from the API entirely | Never configured — compatible |
| Proactive audio | **Permanently enabled**; explicit `proactive_audio:false` returns a hard error | Never configured — compatible *today*, but this is the one finding that could silently break a **future**, unrelated change |
| Async function calling | NON_BLOCKING is now the default | Tool dispatch already awaits and relays asynchronously — compatible |
| Audio I/O | 16-bit PCM in at 16kHz / out at 24kHz; audio-only response modality | Matches existing `CAPTURE_SAMPLE_RATE`/`PLAYBACK_SAMPLE_RATE` and `Modality.AUDIO`-only config exactly |

Per the directive's explicit instruction, compatibility was **verified against the actual config object**, not assumed from the model-string swap: `nova-live-gemini-3-8-live-migration.test.ts` runs the real, unmodified `handleNovaLiveConnection` against a mocked `ai.live.connect` with `GEMINI_LIVE_MODEL_OVERRIDE=gemini-3.8-live` set, and asserts the real config sent to the SDK contains none of the unsupported/breaking fields above, that audio stays the sole response modality with transcription enabled, that async tool-call dispatch still resolves and relays correctly, and that interruption relay still works. **`gemini-3.1-flash-live-preview` remains the production default — nothing was enabled.**

## 4. Complete automated test results

| Suite | Result |
|---|---|
| TypeScript (`npm run lint`) | Clean, 0 errors |
| Full Vitest suite (`npm test`) | **338 files / 4724 tests passed** (up from 336/4713 — two new test files added this phase) |
| Component tests | **11 files / 90 tests passed** |
| Firebase security rules + emulator tests | **2 files / 21 tests passed** |
| Real-app Playwright suite | **21/21 passed**, ×2 full runs |
| Preview Playwright suite | **66/66 passed** |
| Voice-migration-compatibility + voice-eval-gate + offline-intelligence tests (subset re-confirmation) | **46/46 passed** |

No new regression was introduced; nothing was weakened to make a test pass.

## 5. Real Gemini calls made: **NO**

Verified directly: `GEMINI_API_KEY` is **not set** anywhere in this environment (`env.GEMINI_API_KEY` empty; no `.env` entry). No separate, explicit operator approval with a supplied credential accompanied this directive. Per the directive's own instruction ("No paid API call is authorised by this assignment alone... do not execute live calls"), **no live call was attempted for either text or voice**.

Evidence: `npm run test:nova-live-eval` was run to produce the gating proof, not a real call — it writes `test-results/nova-intelligence-eval/live-run-latest.json` with `"mode": "blocked"`-equivalent content: `modelId: null`, `usage: null`, `estimatedCostUsd: null`, and the note *"NOVA_LIVE_CHAT_EVAL is not set to \"1\"..."* — confirming the real gate correctly refused to run. The equivalent voice-side gate (`nova-live-voice-evaluation-gate.ts`, new this phase) was likewise confirmed blocked against this environment's real `process.env` (`nova-live-voice-evaluation-gate.test.ts`'s own "this environment ... is correctly blocked right now" test).

## 6. Real-model response evidence

**None exists.** No authorised calls occurred (see §5), so there is nothing here to report. **No automated or mocked result from this or any prior phase should be treated as independent safeguarding approval** — every "intelligence" or "evaluation" test to date, in this phase and every prior one, has run against a mocked `@google/genai` client or the always-mocked voice harness. That remains true after this phase.

## 7. Actual or estimated API costs

- **Actual (billed) cost this phase: $0.00.** No real request reached Google's API.
- **Estimated cost of a future authorised run** (not incurred): the existing text live-eval runner enforces a `$0.05` default total-spend ceiling (`maxTotalUsd`); the new voice-evaluation gate defines a `$0.10` ceiling (`MAX_LIVE_VOICE_EVAL_BUDGET_USD`) for a future scripted compatibility session, both pre-call-reserved and post-call true-up checked.
- **Pricing-figure distinction maintained:** `ai-model-price-registry.ts`'s rates remain explicitly labelled `isEstimate: true`, dated, and sourced from third-party corroboration, never Google's own pricing page directly (still unreachable). No change to the figures Phase 6B.1/6C recorded for Essential/Continuity/Executive-relevant cost modelling.

## 8. Remaining independent specialist-review requirements

Unchanged from every prior phase's own honest statement, and not advanced by this phase's work (which was infrastructure/compatibility-preparation, not a quality or safety evaluation):
- No real conversational-quality evaluation of Nova's actual responses has ever been performed in this project — every scenario run to date is against a scripted mock.
- Independent clinical/safeguarding review of the non-clinical-boundary and crisis-disclosure scenarios remains outstanding (see Phase 3C/6A's own safeguarding-dependency lists, unchanged).
- A real Gemini Live compatibility test (even the scripted, budget-capped one this phase's procedure document defines) has never been run.
- Legal/privacy review of the consent and data-retention model remains a standing, unclosed item from prior phases.

## 9. Is Nova ready for a controlled external pilot?

**No — and automated tests passing is explicitly not the basis for that answer.** The single, decisive reason: **this project has never once observed how the real Gemini model actually behaves in this application** — not its tone, not its judgment on the eight categories the directive itself lists (overwhelmed-user understanding, practical recommendations, multi-turn consistency, uncertainty, consent/memory boundaries, refusal of unapproved actions, respecting corrections, non-clinical boundaries), nothing. Every pass/fail result in this report is either a TypeScript check, a mocked unit/integration test, or a Playwright test against a scripted fake response. That is real and valuable evidence that the *plumbing* works — auth, routing, flag-gating, the Live relay's protocol handling, cost-accounting scaffolding — but it is not evidence that *Nova's actual judgment* is sound, and a pilot with real external users is a bet on exactly that judgment.

The concrete, sequenced path to a real answer: (1) an operator explicitly authorises and supplies a real, budget-capped `GEMINI_API_KEY`; (2) the existing 34-scenario-eligible text framework is run for real, for the first time, against that key; (3) the results are read and judged by a human, not treated as passed/failed by assertion alone; (4) only then does "ready for a controlled pilot" become an answerable question rather than an assumption.
