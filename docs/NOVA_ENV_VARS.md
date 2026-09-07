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

## Recommended order, if/when any of this gets turned on for real

1. Confirm Vertex's ADC actually works in the real deployment
   environment before relying on it for anything.
2. Get real, billed API access for whichever of Claude/OpenAI is
   actually wanted, plus OpenAI's DPA signed if that one's in play.
3. Test each newly-enabled path with one real conversation somewhere
   that isn't production first.
4. Keep `NOVA_TOOLS_ENABLED` in mind as the emergency lever, not
   something that needs setting up in advance.
