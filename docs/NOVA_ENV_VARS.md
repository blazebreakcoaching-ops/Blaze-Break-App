# Nova chat: environment variables

What each one does, its default, and when you'd actually touch it.
Scoped to the Nova provider/tool system built this session — not a
full deployment guide.

## The provider you're on today

**`GEMINI_API_KEY`** — already existed. The one real, live, paid
credential. Nova chat runs entirely on this unless you explicitly
switch providers below. If this is missing or still the placeholder
value, Nova chat returns a 401 rather than failing silently.

## Switching providers

**`NOVA_CHAT_PROVIDER`** — controls which backend handles Nova chat.
Unset (default): Gemini Developer API, exactly as today.
`claude`: routes to Anthropic, only if `ANTHROPIC_API_KEY` is also set
and valid — otherwise silently falls back to Gemini.
`vertex`: routes to Gemini via Vertex AI instead of the Developer API
— same models, different access path with UK/EU data residency. Only
activates if the Vertex client initialized successfully (see below).

Any other value, or a misconfigured target provider, falls straight
through to Gemini. This can't take Nova chat down by itself.

**`ANTHROPIC_API_KEY`** — needed only if `NOVA_CHAT_PROVIDER=claude`.
Not currently set to anything real — the personal Claude.ai
subscription in use can't be used here; this needs a real Anthropic
API account with billing attached. Until then, this path is built but
inert.

**`OPENAI_API_KEY`** — not yet consumed by anything. The client is
initialized if this is set, but no feature currently calls it — this
was plumbing added ahead of a summarization feature that hasn't been
scoped yet. Needs a real OpenAI API account (not a ChatGPT
subscription) with billing and a signed DPA before it's meaningful to
set.

**`VERTEX_LOCATION`** — which Google Cloud region Vertex AI processes
in. Defaults to `europe-west2` (London) if unset. Only relevant when
`NOVA_CHAT_PROVIDER=vertex`.

Vertex AI doesn't use an API key at all — it authenticates via
Application Default Credentials (the standard Google Cloud auth flow).
It reuses the same GCP project this app already runs under via
Firebase, so no new project is needed. Whether ADC "just works"
depends on where this server is actually deployed:
- **On Google Cloud infrastructure** (Cloud Run, Cloud Functions, GCE)
  — usually automatic, as long as the runtime service account has the
  "Vertex AI User" IAM role.
- **Anywhere else** — needs `GOOGLE_APPLICATION_CREDENTIALS` pointing
  at a service account key file.

This was never tested against a live call in the sandbox this was
built in — confirm this actually authenticates before pointing real
traffic at it.

## Incident response

**`NOVA_TOOLS_ENABLED`** — set to exactly `false` to disable tool use
across every provider (search memory, propose recovery actions,
remember_about_user) while keeping plain chat running. Anything else
— unset, empty, a typo — leaves tools on, matching how the app already
behaved before this switch existed. This is independent of
`NOVA_CHAT_PROVIDER`; it doesn't matter which model is handling chat,
this turns tool use off regardless.

The one tool this matters most for: `remember_about_user` writes
directly to a user's permanent memory record. If it ever starts
behaving unexpectedly in production, this is the fastest lever —
one env var, no code change, no provider switch.

## Live voice cost controls (added with the commercial-hardening pass)

**`NOVA_LIVE_VOICE_ENABLED`** — set to exactly `false` to disable Live
voice specifically, independent of every other Gemini feature. The
socket refuses with a friendly "continue by text" message instead of a
raw error. Anything else (unset, empty, a typo) leaves it on. This is
the fastest lever for a Live-voice-specific cost incident — unsetting
`GEMINI_API_KEY` would also kill Nova chat, diagnose, and every other
Gemini path at once, which this switch avoids.

**`NOVA_LIVE_MAX_SESSION_MS`** — the hard session ceiling. Defaults to
15 minutes (`900000`). A session is force-ended once this elapses,
regardless of activity.

**`NOVA_LIVE_IDLE_TIMEOUT_MS`** — defaults to 90 seconds
(`90000`). Distinct from the session ceiling: resets on every real
activity (audio in from the client, or any message relayed from
Gemini) and ends the session if nothing happens for this long, so a
connection left open with a muted mic or a backgrounded app doesn't run
the full session length regardless of actual use.

See `docs/AI_COST_CONTROL.md` for the full Live voice cost-control
picture, including the `nova_voice` capability quota (1 session/day
Free, 20/day Premium) that's checked before either of these timers
starts.

## SMS cost controls (added with the commercial-hardening pass)

**`SMS_ENABLED`** — set to exactly `false` to disable all Twilio SMS,
including guardian alerts. This is the global provider-outage/incident
switch, not a routine cost lever — see `docs/NOTIFICATION_ARCHITECTURE.md`
for why guardian alerts are otherwise exempt from every other SMS cost
guardrail.

**`SMS_MANUAL_SEND_ENABLED`** — set to exactly `false` to disable only
`POST /api/twilio/send` (the authenticated, low-traffic manual-send
route), leaving guardian alerts and ally nudges unaffected.

`NUDGE_SCHEDULER_ENABLED` already existed (from the prior product-safety
hardening pass) and governs the ally-nudge scheduler specifically,
defaulting **off** — the one switch in this codebase that defaults off
on purpose.

## Recommended order, if/when any of this gets turned on for real

1. Confirm Vertex's ADC actually works in the real deployment
   environment before relying on it for anything.
2. Get real, billed API access for whichever of Claude/OpenAI is
   actually wanted, plus OpenAI's DPA signed if that one's in play.
3. Test each newly-enabled path with one real conversation somewhere
   that isn't production first.
4. Keep `NOVA_TOOLS_ENABLED` in mind as the emergency lever, not
   something that needs setting up in advance.
