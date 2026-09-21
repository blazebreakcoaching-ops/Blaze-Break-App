# Vendor / subprocessor register

A confirmed gap before this document existed — `docs/INTEGRATIONS_SETUP.md`
covers *how to configure* the OAuth-based third-party integrations, but
nowhere in this repository listed every external service this app
actually sends data to. This is that list. It only includes services
this codebase's own code actually calls — nothing speculative, and
nothing removed from consideration just because it isn't wired up yet
(those are marked as such explicitly).

For each vendor: what it's used for, what data reaches it, and why it
was chosen where that's on record. This is not a legal data-processing-
agreement register (that's a separate, real artifact the business needs
if it doesn't already have one for each vendor below) — it's the
engineering-accurate map of where data actually flows.

## Core infrastructure

### Google Cloud Platform / Firebase

- **Used for:** Application hosting (Cloud Run), the primary database
  (Firestore — this project's own named Enterprise-edition instance, see
  `docs/DEPLOY.md` §4), authentication (Firebase Auth), bot/abuse
  protection (Firebase App Check via reCAPTCHA Enterprise), secrets
  (Secret Manager).
- **Data reaching it:** Everything — this is the platform the entire app
  runs on and stores all first-party data in. There is no data this app
  holds that GCP doesn't also hold.
- **Why:** The project originated as a Google AI Studio applet;
  Cloud Run/Firebase is the natural, already-integrated production
  runtime for that origin (see `docs/DEPLOY.md`'s own opening note).

### Google Gemini API

- **Used for:** Nova's default AI provider — chat, check-in analysis,
  resentment analysis, executive report commentary, live voice, and
  every other Nova-branded AI feature, unless `NOVA_CHAT_PROVIDER`
  routes a specific feature elsewhere (see below).
- **Data reaching it:** Whatever context is built into each specific
  prompt — this varies by feature but can include recent check-in/mood/
  energy signals, Nova conversation history, and (only where the user
  has explicitly opted in via their own Privacy Centre) saved Nova
  memories. See `docs/DATA_POLICY.md` for what this app does and does
  not control about how Google uses this data on its end.
- **Why:** Primary/default Nova provider; see `docs/API_PROVIDER_MAP.md`
  for the full provider-selection logic.

### Anthropic Claude API

- **Used for:** An alternative Nova chat provider, active only when
  `NOVA_CHAT_PROVIDER=claude` **and** `ANTHROPIC_API_KEY` is set — falls
  straight through to Gemini if either condition isn't met, so a
  misconfiguration here can't take Nova down.
- **Data reaching it:** Same shape of Nova chat context as the Gemini
  path, when active.
- **Why:** See `docs/API_PROVIDER_MAP.md`.

### Google Vertex AI

- **Used for:** A third possible Nova chat provider path
  (`NOVA_CHAT_PROVIDER=vertex`), routed through GCP's enterprise AI
  platform rather than the consumer Gemini Developer API directly.
  Requires the `roles/aiplatform.user` IAM grant (`docs/DEPLOY.md` §3).
- **Data reaching it:** Same shape of Nova chat context as the other
  providers, when active.
- **Why:** See `docs/API_PROVIDER_MAP.md`.

### OpenAI

- **Listed in `.env.example` (`OPENAI_API_KEY`) but not currently
  wired to any feature** — no code path in this repository actually
  calls it yet. Included here so it isn't missed if/when a real consumer
  is built, not because data currently flows to it.

## Communications

### Twilio

- **Used for:** Outbound SMS — Guardian support-circle alerts and other
  messaging features (`server.ts`, `guardian-alert.ts`). Degrades
  gracefully (reports "not configured") if credentials are absent rather
  than crashing.
- **Data reaching it:** A phone number and the alert message text —
  Guardian alert messages are built from a template plus the alerting
  user's first name and situation category, never raw Nova conversation
  content. See `docs/GUARDIAN_SUPPORT_SPEC.md`.
- **Why:** Not documented in this repository as an explicit decision;
  it's the incumbent SMS provider this codebase was built against.

### Brevo

- **Used for:** Every transactional email this app sends — password
  reset, email verification, password-changed/2FA-changed security
  notices, and (server-side) the admin-facing feedback-submission
  notification.
- **Data reaching it:** The recipient's email address and the email
  content (which, for security notices, never includes the actual
  secret/code/reset link value beyond what the link itself carries).
- **Why:** Existing integration this project was built with; also used
  in place of Firebase's own default mailer specifically so every
  transactional email in the app goes through one consistent pipeline.

### Web Push (VAPID)

- **Used for:** Browser push notifications (e.g. recovery-score-drop
  nudges reaching someone when the app isn't open).
- **Data reaching it:** This is a standards-based browser protocol, not
  a third-party vendor holding user data in the way the others on this
  list are — the push payload is encrypted end-to-end to the browser's
  push service (Chrome/Firefox/etc. each run their own push relay
  infrastructure, not something this app chooses). No separate DPA
  applies the way it would for a vendor with its own data-processing
  relationship.

## Enterprise OAuth integrations (org-initiated, per organisation)

These five are opt-in **per organisation** — an org's own admin connects
them, and each requires that org registering its own OAuth app on the
provider's developer portal (`docs/INTEGRATIONS_SETUP.md` has the exact
setup steps). Data only flows to a given provider for orgs that have
explicitly connected it.

| Provider | Used for | Data reaching it |
|---|---|---|
| **Slack** | Workload/activity signals feeding org-level aggregate wellbeing dashboards | OAuth token exchange; read-only workspace activity signals, aggregated before ever reaching a human-readable dashboard (k-anonymity gated — see `docs/PRODUCT_SAFETY_PRIVACY.md` §5) |
| **Jira (Atlassian)** | Same category of workload signal, from ticket/sprint activity | OAuth token exchange; read-only project activity signals |
| **Asana** | Same category | OAuth token exchange; read-only task activity signals |
| **Calendly** | Meeting-load signal | OAuth token exchange; read-only scheduling activity |
| **Monday.com** | Same category | OAuth token exchange; read-only board activity signals |

All five: the OAuth `state` parameter is HMAC-signed
(`OAUTH_STATE_SECRET`) for CSRF protection, tokens are stored per-user
(under the connecting individual's own `users/{uid}/integration_tokens`,
server-write-only Firestore collection — not org-keyed, so there is no
`organisations/{orgId}/integration_tokens` to look in for org-scoped
token management; revoking or rotating a connection is per the connecting
user's own account), and
every aggregate figure computed from this data is gated behind the org's
own `privacyThreshold` (k-anonymity floor of 3, default 5) before it's
ever shown to anyone — see `docs/PRODUCT_SAFETY_PRIVACY.md` §5 and
`docs/ENTERPRISE_SEARCH.md`.

## What this register does not cover

- **Payment processors** — none exist. No Stripe/Apple/Google Pay/other
  billing integration is wired up anywhere in this codebase (see
  `docs/FREE_PREMIUM_ENTITLEMENTS.md`); "payments" is out of scope for
  this whole register because there's genuinely nothing to list.
- **Analytics/tracking vendors** — none found in this codebase (no
  Google Analytics, Mixpanel, Segment, Sentry, or similar third-party
  SDK). If one is added later, it belongs on this list.
- **Sub-processors of the vendors above** (e.g. whatever infrastructure
  Twilio or Brevo themselves run on) — out of scope; each vendor's own
  published subprocessor list covers that.

## Keeping this current

Add a new entry here the moment a new external service starts receiving
real user data — not after the fact. If a vendor above is ever removed
from the codebase, move its entry to a dated "no longer used" section
rather than deleting it outright, so there's a record of what used to be
true.
