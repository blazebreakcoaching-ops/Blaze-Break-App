# Setting Up Real Integrations (Slack, Jira, Asana, Calendly, Monday.com)

Google Workspace is already live — it goes through Firebase Auth and needs no
setup here. The five services below each need their own OAuth app registered
on that provider's developer portal before "Connect" will work for your users.

For every service, the **redirect URI** you register must be exactly:

```
{APP_URL}/api/integrations/callback/{service}
```

Where `{APP_URL}` is your deployed app's base URL (the same value as the
`APP_URL` env var — e.g. `https://blaze-break.example.com`), and `{service}` is
one of: `slack`, `jira`, `asana`, `calendly`, `monday`.

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
  four are unaffected.

## What this doesn't include yet

This gets accounts *connected* — it does not implement anything that actually
*uses* the tokens (e.g. reading Jira sprint data, posting Slack DND status,
pulling Asana tasks). That's separate, per-service work built on top of the
stored access token once a connection exists. Also not included: automatic
token refresh before expiry (each provider's refresh flow differs slightly —
worth building once you see which integrations get used).
