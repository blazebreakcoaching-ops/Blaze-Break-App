# Setting Up Real Integrations (Slack, Jira, Asana, Calendly, Monday.com, Google Calendar Actions)

Google Workspace's existing READ-only calendar signal is already live — it
goes through Firebase Auth client-side and needs no setup here. The six
services below each need their own OAuth app registered on that provider's
developer portal before "Connect" will work for your users.

For every service, the **redirect URI** you register must be exactly:

```
{APP_URL}/api/integrations/callback/{service}
```

Where `{APP_URL}` is your deployed app's base URL (the same value as the
`APP_URL` env var — e.g. `https://blaze-break.example.com`), and `{service}` is
one of: `slack`, `jira`, `asana`, `calendly`, `monday`, `google_calendar_actions`.

Once you have a Client ID + Secret for a service, add them to your environment
(`.env` locally, or your host's secrets panel in production) using the exact
variable names in `.env.example`, then restart the server.

You also need one shared secret, regardless of which services you enable:

```
OAUTH_STATE_SECRET=<any long random string>
```

Generate one with `openssl rand -hex 32`. This signs the OAuth `state`
parameter so a connection request can't be forged or replayed — it's not
provider-specific, set it once.

---

## Slack

1. Go to **https://api.slack.com/apps** → **Create New App** → *From scratch*.
2. Under **OAuth & Permissions**, add this exact Redirect URL:
   `{APP_URL}/api/integrations/callback/slack`
3. This app requests **user token scopes** (not bot scopes), so users connect
   their own account rather than installing a bot into a workspace:
   `dnd:write, dnd:read, users.profile:write, users:read, channels:read, groups:read, im:read, mpim:read, channels:history, groups:history, im:history, mpim:history, chat:write`
   Add these under "User Token Scopes" in the same OAuth & Permissions page.
   The `*:history` and `*:read` scopes exist so Blaze Break can compute a
   message-volume/after-hours signal for the Recovery Score, and `chat:write`
   exists so Boundary Autopilot can send a real Slack message *as the user*
   when they explicitly ask it to (e.g. declining a meeting, setting a
   boundary with a colleague) — this is a real privacy and consent-sensitive
   footprint (reading message history, and sending messages on someone's
   behalf), so make sure both are disclosed clearly wherever you describe
   what connecting Slack does for the user.
   **If anyone already connected Slack under an older, narrower scope set,
   they'll need to disconnect and reconnect** — Slack doesn't retroactively
   grant new scopes to an existing token.
4. Under **Basic Information**, copy the **Client ID** and **Client Secret**
   into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
5. Note: Slack's default installation flow requires each user's workspace
   admin to have allowed the app, or the app needs to be distributed via the
   Slack App Directory for broader use — for a smaller user base, workspace
   members can typically self-install a custom/internal app directly.

## Jira (Atlassian)

1. Go to **https://developer.atlassian.com/console/myapps/** → **Create** →
   *OAuth 2.0 integration*.
2. Under **Authorization**, set the callback URL to:
   `{APP_URL}/api/integrations/callback/jira`
3. Under **Permissions**, add the Jira API with these scopes:
   `read:jira-work`, `read:jira-user`, `offline_access` (the last one is
   required to get a refresh token).
4. Copy the **Client ID** and **Secret** from **Settings** into
   `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET`.
5. Atlassian uses **rotating refresh tokens** — each refresh returns a new
   refresh token that replaces the old one. If you later build the token
   auto-refresh logic, make sure it overwrites the stored refresh token every
   time, not just the access token.

## Asana

1. Go to **https://app.asana.com/0/developer-console** → **Create new app**.
2. Under **OAuth**, set the redirect URL to:
   `{APP_URL}/api/integrations/callback/asana`
3. Copy the **Client ID** and **Client Secret** into `ASANA_CLIENT_ID` /
   `ASANA_CLIENT_SECRET`.
4. Asana doesn't require an explicit scope list for standard API access —
   the default grant covers normal task/project access.

## Calendly

1. Go to **https://developer.calendly.com** → create a developer account →
   create an **OAuth application**.
2. Set the redirect URL to: `{APP_URL}/api/integrations/callback/calendly`
3. Copy the **Client ID** and **Client Secret** (shown only once at creation —
   save them immediately) into `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET`.
4. Calendly access tokens expire after 2 hours; refresh tokens don't expire
   until used, so a refresh flow will eventually be needed for anything beyond
   short-lived connections.

## Monday.com

1. Go to your monday.com account → **Avatar → Developers** → **Create app**.
2. Under the app's **OAuth** tab, set the redirect URL to:
   `{APP_URL}/api/integrations/callback/monday`
3. Copy the **Client ID** and **Client Secret** into `MONDAY_CLIENT_ID` /
   `MONDAY_CLIENT_SECRET`.
4. The app currently requests `me:read boards:read` — extend this in
   `server.ts` (`OAUTH_PROVIDERS.monday.scope`) if you need write access later.

## Google Calendar Actions (Phase 5E, directive §2 — founder action required)

This is a NEW, separate OAuth connection from the existing Firebase-popup
Google sign-in. It exists so Nova Take the Load's Calendar Protection
workflow has a real, server-side, refreshable token to eventually act with —
today, even once connected, nothing in this codebase will use it to write
anything, because `CALENDAR_PROTECTION_EXECUTION_ENABLED` in
`nova-calendar-protection-service.ts` is hardcoded `false` and `server.ts`
imports no connector at all. Setting this up makes the CONNECTION real; it
does not turn on execution.

1. Go to **https://console.cloud.google.com/** and either use the same
   project your existing Firebase project already runs on, or a new one —
   either works, since this is a separate OAuth client from Firebase Auth's.
2. **APIs & Services → Library** → enable the **Google Calendar API** for
   that project (it is not enabled by default).
3. **APIs & Services → OAuth consent screen**: if this project has never
   configured one, you'll need to do that first — choose **External** unless
   every user is inside your own Google Workspace organisation, fill in the
   app name/support email, and add the scope
   `https://www.googleapis.com/auth/calendar.events` (plus `email`, `openid`
   — Google adds these automatically for most flows, but check). **While the
   app is in "Testing" mode, only the test users you explicitly list can
   connect** — add your own account and anyone else testing this before
   requesting verification. **Google's own app verification review is
   required before this can go out to the public** for a scope this
   sensitive (`calendar.events` is a "restricted" or at minimum a
   "sensitive" scope) — this can take days to weeks and may ask for a
   demo video and a privacy policy URL. This step is explicitly the
   founder's own decision and cannot be done from this codebase.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → **Web application**. Add this exact redirect URI:
   `{APP_URL}/api/integrations/callback/google_calendar_actions`
5. Copy the **Client ID** and **Client secret** into
   `GOOGLE_CALENDAR_ACTIONS_CLIENT_ID` / `GOOGLE_CALENDAR_ACTIONS_CLIENT_SECRET`.
6. This flow uses **PKCE** (code_verifier/code_challenge) in addition to the
   client secret — nothing further to configure for this; the server
   generates and stores the verifier itself.
7. **No recurring cost**: the Google Calendar API's standard usage quota
   (as of this writing) is free for the request volumes this feature would
   realistically produce; there is no paid tier requirement to enable the
   API itself. Confirm current quotas/pricing on Google's own console before
   relying on this if usage ever becomes large — this codebase does not
   provision or enable any paid Google Cloud service.

---

## Deploying the Firestore rules

The token-storage rules were added to `firestore.rules` but rules changes
don't deploy themselves — you need to push them:

```
firebase deploy --only firestore:rules
```

Without this step, the rule changes exist only in your repo, not in your live
Firestore project.

## What's already handled for you

- Tokens are stored server-side only, under `users/{uid}/integration_tokens/{service}`,
  which is completely locked from client reads via Firestore rules — the
  frontend only ever sees a redacted `connected: true/false` status.
- The `state` parameter is signed and expires after 10 minutes, preventing
  CSRF and replay attacks on the callback.
- Each service can be enabled independently — if `SLACK_CLIENT_ID` isn't set,
  Slack's card shows "Not Yet Available" instead of erroring, and the other
  services are unaffected.
- A refresh that fails with the OAuth2 `invalid_grant` error (a revoked or
  dead refresh token) now marks that integration disconnected rather than
  silently returning a token guaranteed to keep failing — added Phase 5E.
- `google_calendar_actions` additionally uses PKCE (an S256 code_challenge/
  code_verifier pair, the verifier held server-side in
  `users/{uid}/oauth_pkce/{service}` for the few minutes between redirect
  and callback, never client-visible) and records which Google account
  actually connected (`connectedAccountEmail` on the redacted status doc) —
  neither is needed by, or added to, the other five providers.

## What's also already built

This isn't just account *connection* — the tokens are genuinely used.
`getValidAccessToken(uid, service)` (`server.ts`) transparently refreshes an
access token before it expires (each provider's refresh flow is handled via
the same `OAUTH_PROVIDERS` config entry used for the initial exchange), and
the `/api/signals/*` routes call real provider APIs with it: Jira issue
counts, Asana task load, Monday board load, Calendly meeting load, Slack
message volume. `NovaOverloadShield.tsx` and Boundary Autopilot both consume
this live data today, not stored/stale tokens sitting unused.

`google_calendar_actions` is the one exception to "the tokens are genuinely
used": connecting it stores a real, refreshable token, but nothing calls it
yet. `nova-google-calendar-connector.ts` (Phase 5E) is a real, independently
tested connector built to use it — but it is never imported by `server.ts`,
and the execute route that would eventually use any connector stays hardcoded
disabled regardless. See `docs/NOVA_FULL_VISION_CAPABILITY_REGISTER.md`
workstream L for the full account of what connecting this does, and does not,
enable today.
