# Calendar Pilot — Google Cloud Setup Checklist (Founder Action Required)

This is a step-by-step guide for the one-time Google Cloud configuration a real, restricted Calendar Protection pilot needs. **No credential of any kind has been created, invented, or exposed anywhere in this codebase or this environment** — every step below is something only a founder/admin with access to the real Google Cloud project can do. Nothing here is a code change.

This covers `google_calendar_actions` only — the server-side OAuth connection Nova's Calendar Protection feature would use (`server.ts`'s `OAUTH_PROVIDERS.google_calendar_actions`). It is separate from the pre-existing client-side "Google Workspace" sign-in (`signInWithGoogleCalendar`), which already works today and needs no new setup.

## 1. Create the OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select (or create) the project this app will run under.
2. Go to **APIs & Services → Credentials**.
3. Click **Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Name it something identifiable, e.g. "Blaze Break — Calendar Protection (production)" (and a separate one for staging, if you run one — see §6).
6. Click **Create**. Google shows you a **Client ID** and **Client Secret** — keep this page open or copy both values now; you'll need them in §4.

## 2. Enable the Calendar API

1. Still in Cloud Console, go to **APIs & Services → Library**.
2. Search for **Google Calendar API** and click **Enable**, if it isn't already.

## 3. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. **User type:** choose **External** unless every pilot account is a Google Workspace account inside your own organisation's domain, in which case **Internal** is simpler and skips verification entirely (§6).
3. Fill in the app name, support email, and developer contact email.
4. **Scopes:** add `https://www.googleapis.com/auth/calendar.events`, `openid`, and `email` — these are exactly the three scopes this codebase's `google_calendar_actions` provider requests (`server.ts`, `OAUTH_PROVIDERS.google_calendar_actions.scope`). Do not add any broader Calendar scope (e.g. plain `calendar`) — the app never asks for or needs calendar-list/settings access.
5. Save.

## 4. Set credentials securely

The server reads these two environment variables (`server.ts`, `OAUTH_PROVIDERS.google_calendar_actions.clientIdEnv`/`clientSecretEnv`) — set them in your real deployment's secret/environment configuration, **never committed to the repository**:

```
GOOGLE_CALENDAR_ACTIONS_CLIENT_ID=<the Client ID from §1>
GOOGLE_CALENDAR_ACTIONS_CLIENT_SECRET=<the Client Secret from §1>
```

Also confirm these two existing, already-required secrets are set in the same environment (needed by the OAuth flow generally, not new for this feature):

```
OAUTH_STATE_SECRET=<any long random string — already required by every other OAuth integration this app has>
APP_URL=<the real, public base URL of your deployment, e.g. https://app.blazebreak.com — no trailing slash>
```

If `APP_URL` is missing, the server refuses to build a redirect URI at all (`getOAuthRedirectUri` throws) — so this must be set correctly before §5 can work.

## 5. Register the redirect URI

Back in Cloud Console, on the OAuth client you created in §1, under **Authorized redirect URIs**, add exactly:

```
<APP_URL>/api/integrations/callback/google_calendar_actions
```

— substituting your real `APP_URL` from §4. This is the generic OAuth callback route this codebase already has (`server.ts`'s `/api/integrations/callback/:service`); nothing new needs to be built, only this one URL registered.

## 6. Determine whether Google verification is required

This is the step most likely to take real lead time, and the directive specifically asks you to decide it — this phase does not decide it for you.

- **`calendar.events` is a "sensitive" scope under Google's review policy** (not "restricted," which would require a third-party security audit — just the standard sensitive-scope review). Google will show an "unverified app" warning to any user who isn't an approved test user, and will eventually require app verification before the app can be used by more than a small number of accounts.
- **If every pilot account is a Google Workspace account in your own domain and you chose "Internal" in §3:** no verification is needed at all. This is the fastest path if it fits your pilot.
- **If pilot accounts are personal Gmail accounts, or "External" was chosen in §3:** you have two options:
  - **Add each pilot account as a Test User** (OAuth consent screen → Test users). Test users can use the app with the sensitive scope immediately, no verification needed, **but Google caps this at 100 users and test-user tokens can expire after 7 days of inactivity** — both are fine for a small, deliberately restricted pilot (this phase's own admin-only pilot-eligibility gate already limits accounts one at a time), but will not scale to a public launch.
  - **Submit for verification** if you intend to go beyond test users. Expect this to take from several days to a few weeks, and Google may ask for a demo video and a justification for the scope. Start this early if a verified production launch (not just a pilot) is the actual goal.

**Recommendation for a small, founder-authorised pilot specifically:** use Test Users (§6, option A) — it needs no verification wait, and this phase's pilot-eligibility gate (`nova-calendar-pilot-eligibility.ts`) already restricts real access to named accounts one at a time, which is the same shape as Google's own Test User list. Move to full verification only when planning a wider rollout.

## 7. What is NOT part of this checklist

- **Flipping `CALENDAR_PROTECTION_EXECUTION_ENABLED` to `true`** — a separate, deliberate code change (currently hardcoded `false` in `nova-calendar-protection-service.ts`) that this phase does not make and does not recommend making until the above is configured and tested.
- **Granting any specific account pilot eligibility** — done per-account, after the above, via the admin-only `POST /api/admin/users/:uid/calendar-protection-pilot-eligibility` route this phase added (Phase 5J, directive §4).
- **A live, supervised end-to-end test** (propose → approve → execute → verify the real event → undo → verify removal) before any pilot user is exposed — strongly recommended as the last step before go-live, not performed by this codebase automatically.
