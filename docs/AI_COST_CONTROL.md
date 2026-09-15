# AI Cost Control

How Nova's AI usage is kept economically sustainable. See
`docs/API_PROVIDER_MAP.md` for every provider Blaze Break calls and
`docs/FREE_PREMIUM_ENTITLEMENTS.md` for the Free/Premium capability quotas
referenced throughout this document.

## Provider call sites

All server-side (no AI provider SDK is called from `src/`). The default
path is Gemini (`@google/genai`); `NOVA_CHAT_PROVIDER=claude` or
`=vertex` route Nova's main chat to Anthropic or Vertex AI instead
(`docs/NOVA_ENV_VARS.md`). `openai` is a configured-but-unused dependency
— nothing in the codebase calls it. Do not treat it as a live cost driver.

| Route | Model (default) | Purpose |
|---|---|---|
| `POST /api/nova/chat` | `gemini-3.5-flash` (or Claude/Vertex) | Main Nova text coaching |
| `POST /api/nova/diagnose` | `gemini-3.5-flash` | Optional AI narrative on the check-in |
| `POST /api/nova/speech` | `gemini-3.1-flash-tts-preview` | One-shot text-to-speech |
| `POST /api/nova/voice-journal` | `gemini-3.5-flash` | Audio-in journal transcription/analysis |
| `POST /api/nova/one-less-thing` | `gemini-3.5-flash` | Triage suggestion |
| WS `/api/nova/live` | `gemini-3.1-flash-live-preview` | Live voice (speech-to-speech) |

## Gemini Live voice — the highest-risk single surface

Per-minute, both directions, so an open connection has a real ongoing
cost even in silence. Lifecycle controls:

- **Kill switch**: `NOVA_LIVE_VOICE_ENABLED` (default on; set to exactly
  `'false'` to disable). Independent of `NOVA_TOOLS_ENABLED` and of
  unsetting `GEMINI_API_KEY` (which would also take down every other
  Gemini-backed Nova feature at once) — this is the one lever for "turn
  off Live voice specifically, right now, no redeploy." When off, the
  socket refuses with "Voice coaching is temporarily unavailable.
  Continue with Nova by text for now." rather than a raw error.
- **Capability quota**: gated by `nova_voice` (1 session/day Free, 20/day
  Premium) before the upstream Gemini connection is even opened.
- **Hard session ceiling**: `NOVA_LIVE_MAX_SESSION_MS`, default 15
  minutes. Configurable via env var rather than hardcoded.
- **Idle timeout**: `NOVA_LIVE_IDLE_TIMEOUT_MS`, default 90 seconds — new
  in this work. Distinct from the session ceiling: a connection left open
  with no audio flowing in either direction (mic muted, app backgrounded,
  a half-dead network) is reset on every real activity event (an
  inbound audio chunk from the client, or any message relayed from
  Gemini) and ends the session if nothing happens for the configured
  window, rather than running the full session length regardless of
  actual use.
- **Per-session memory-write cap**: unchanged, `MAX_VOICE_MEMORY_WRITES = 5`.

### Deliberately not done in this pass

- **Context-window compression / sliding-window** for Live sessions
  specifically: within one Live session, Gemini Live holds full session
  context upstream with no app-level trimming beyond the session-length
  cap itself. Google's Live API context-compression features would need
  to be evaluated against the current SDK version before adopting — noted
  as a real, scoped follow-up rather than implemented speculatively (see
  `docs/OUTSTANDING_TASKS.md`).
- **Raw audio persistence**: audited and confirmed — voice-journal audio
  is processed and discarded (never written to Storage/Firestore), and
  Live voice audio is streamed frame-by-frame and never persisted either.
  No change needed here; already correct.
- **Duplicate transcription pipeline**: audited and confirmed — Live voice
  uses Gemini's own native input/output transcription for on-screen
  captions, relayed as text but never persisted; there is no second,
  separate STT call running alongside the speech-to-speech stream.

## Context cost control (the largest fix in this pass)

`getNovaContextAndMetadata()` builds the "what does Nova already know
about this person" text injected into every chat message and every Live
voice session's system instruction. Before this work, every one of its ~8
per-collection reads (check-ins, energy budgets, mood pulses, body
check-ins, wins, boundary scripts, goals, saved memories) was an unbounded
`.get()` — re-scanning a user's **entire** history on every single
message. Cost grew linearly with account age and re-read the same data on
every turn of a conversation; this was the single largest Firestore cost
driver found in the audit.

Fixed by bounding every read to the most recent documents, ordered by
each collection's existing required `createdAt`/`updatedAt` field:
`NOVA_CONTEXT_RECENT_LIMIT = 60` for check-ins/budgets/pulses/etc., 5 for
saved memories (unchanged — already capped, just moved from an unbounded
fetch + in-memory sort/slice to an `orderBy().limit()` query). This is
also a genuinely *better* input for Nova, not just cheaper — "what's going
on with this person recently" is more relevant coaching context than an
unbounded multi-year history. Where a count is shown in the summary text
(e.g. "Number of logged check-ins: 60+"), it's honestly labelled once the
cap is hit rather than implying that's someone's full lifetime total.

**Not done in this pass**: converting these per-collection summaries into
write-time aggregate counters (the more thorough fix section 12/13 of the
hardening brief gestures at) — that touches every write path for
check-ins/energy budgets/etc. across the whole app and is a materially
bigger, riskier change than bounding the reads. Bounding reads gets the
overwhelming majority of the cost benefit; the aggregate-counter rewrite
is real future work, not done here to avoid touching working flows
without a full, careful pass (see `docs/OUTSTANDING_TASKS.md`).

## Model routing

Nova already only escalates to Gemini's more capable models for the
conversational/coaching surfaces; classification-shaped tasks (triage in
`one-less-thing`, diagnose's structured scoring) already use the fast
model tier (`gemini-3.5-flash`) rather than anything heavier. No separate
low/standard/complex router was built in this pass beyond what already
existed — the provider/model selection is currently a fixed per-route
choice, not a dynamically escalating one. A genuine complexity-based
router (e.g. escalating only when a conversation signals real difficulty)
is a real future enhancement, not implemented here (see
`docs/OUTSTANDING_TASKS.md`).

## Rate limiting

Every AI-calling route now has a dedicated `express-rate-limit` limiter
(previously several relied only on the generic 100-req/15-min-per-IP
`apiLimiter`): `novaChatLimiter` (60/15min), `novaDiagnoseLimiter`
(15/15min), `novaVoiceJournalLimiter` (15/15min), alongside the
pre-existing `speechLimiter` and `oneLessThingLimiter`. The Live voice
WebSocket handshake (`/api/nova/live`) sits outside Express middleware
entirely (a raw `WebSocketServer` upgrade) and so isn't covered by
`express-rate-limit` — its abuse protection is the `nova_voice` daily
capability quota (1 session/day Free) checked before the upstream
connection opens, which is the meaningful ceiling for a feature that's
naturally low-frequency (nobody legitimately starts many Live sessions
per minute). A dedicated handshake-level limiter was considered and
deliberately not added — it would be additional complexity for a
scenario the quota already covers.

## Budgets, alerts, and protection mode

Per-user/per-tier **quotas** exist today (the capability system above).
Per-provider/global **spend budgets with alert thresholds** (50/75/90/100%)
and an automated "protection mode" (switch to cheaper models, defer
non-critical work, throttle) do **not** exist yet — this needs the
provider-cost-estimate visibility (`GET /api/admin/cost-usage`, see the
"Cost monitoring" section below) to mature into actual configured
thresholds with a real alerting destination (email/Slack/etc.), which
wasn't built in this pass. See `docs/OUTSTANDING_TASKS.md`.

## Cost monitoring (visibility)

`GET /api/admin/cost-usage` (admin-only) aggregates the
`usage_counters` this work started writing across all users, over a
7-day lookback, and reports:

- Raw counts: Nova text messages, Nova voice sessions, diagnose AI calls, SMS segments.
- An estimated USD cost per category and in total, using the documented
  per-unit rates in `cost-estimates.ts` (`DEFAULT_COST_RATES`).

This is **explicitly labelled an estimate** (`isEstimate: true` in the
response) built from captured usage counts, not a live read of actual
Gemini/Twilio invoices — neither provider is wired up here with a
queryable, cheap, real-time cost API. The rates are rough, editable
constants sourced from each provider's public list pricing at the time
they were written; update them periodically rather than treating them as
exact. `evaluateBudgetAlert()` in the same file computes which alert
threshold (50/75/90/100%) a given spend/budget ratio has crossed, ready to
be wired to a real configured monthly budget and a real alert destination
when that's built (see `docs/OUTSTANDING_TASKS.md` — the calculation
exists and is tested; the "check it on a schedule and actually alert
someone" plumbing does not).

## Cost targets

The £0.25–£0.50/Free-user, £0.50–£1.00/typical-Premium-user,
£2–£3/heavy-Premium-user internal targets from the hardening brief are
**not proven by production telemetry** — no production traffic has run
against this yet. What this work does establish: the mechanisms that make
those targets *achievable* (bounded context reads, Live voice
idle/session/quota limits, per-tier quotas, SMS guardrails) are now in
place, and `GET /api/admin/cost-usage` gives a real, if estimated, way to
check actual usage against them once there's traffic to measure.
