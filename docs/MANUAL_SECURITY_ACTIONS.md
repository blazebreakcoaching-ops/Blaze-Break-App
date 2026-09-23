# Manual security actions — GCP Console / human-only checklist

Everything on this list requires access this session doesn't have
(GCP Console, `gcloud` with real project credentials, GitHub repository
Settings, or a Google account's own security settings) — none of it can
be verified or performed from inside the codebase. Each item links to
the document with the full reasoning; this file is the checklist form,
meant to be worked through and checked off, not read for explanation.

- [ ] **Grant `roles/iam.serviceAccountTokenCreator` (self-bound) to the
      Cloud Run runtime service account.** Required for password-reset
      and email-verification link generation. Exact command in
      `docs/DEPLOY.md` §3. Without it, those two features fail loudly
      (a distinct logged line) but do fail — check Cloud Logging for
      `[AUTH] ... likely missing roles/iam.serviceAccountTokenCreator` to
      confirm whether this is already needed.
- [ ] **Confirm the runtime service account's IAM roles match
      `docs/DEPLOY.md` §3 exactly** — `roles/datastore.user`,
      `roles/firebaseauth.admin`, `roles/iam.serviceAccountTokenCreator`
      (above), and `roles/aiplatform.user` only if the Vertex AI Nova
      path is actually used. Check for anything broader (e.g. a leftover
      `roles/owner` or `roles/editor` from initial project setup) via
      `gcloud projects get-iam-policy <project> --flatten="bindings[].members"
      --filter="bindings.members:<service-account-email>"`.
- [ ] **Set `MFA_ENCRYPTION_KEY` and `SSO_CONFIG_ENCRYPTION_KEY`** in
      Secret Manager, mounted as env vars on the Cloud Run service
      (`docs/DEPLOY.md` §2). Generate with `openssl rand -base64 32` and
      `openssl rand -hex 32` respectively. Without the first, no user can
      enable 2FA; without the second, no org can store an inline SSO
      client secret.
- [ ] **Confirm `NODE_ENV=production` is actually set on every real
      production Cloud Run deployment.** This single variable gates the
      strict CSP, **App Check enforcement**, and static frontend serving
      (`docs/DEPLOY.md` §1) — if it's ever unset on a deploy meant to be
      production, all three silently weaken or break. If a staging
      environment exists, confirm *its* `NODE_ENV` setting is a
      deliberate choice (matching production's security posture if it
      handles anything resembling real data, or clearly not
      production-equivalent if it's meant to be permissive) — see the
      open "environment separation" question in
      `docs/OUTSTANDING_SECURITY_ITEMS.md`.
- [ ] **Enable 2FA on the Google account itself** behind
      `teampublication@gmail.com` / `teampublication@googlemail.com` —
      the hardcoded platform-owner identity throughout `server.ts`
      (`requireAdmin`/`requirePlatformOwner` both special-case it
      directly). This app's own 2FA feature protects a Blaze Break
      account; it does nothing for the underlying Google account that
      has ultimate control over this GCP project, this Firebase project,
      and every admin action in the app.
- [ ] **Enable GitHub secret scanning + push protection** on the
      repository (Settings → Code security). Blocks a credential from
      ever being committed in the first place. `docs/DEPLOY.md` §6
      already recommends this; confirm it's actually on, don't assume.
- [ ] **Confirm Firestore backup/PITR status** on the named Enterprise-
      edition database this app uses
      (`ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc`, per
      `firebase.json`). See `docs/BACKUP_AND_RECOVERY.md` for what to
      check and how, and for the recommendation once you know the
      current state.
- [ ] **Decide and document the data retention window(s)** — see
      `docs/DATA_RETENTION.md` for the real options and their tradeoffs.
      This is a product/legal decision, not a technical one; this
      checklist item is "make the decision and update that document,"
      not "pick a specific number here."
- [ ] **Set up a Cloud Monitoring log-based alert** on the new
      security-relevant log lines this hardening pass added — a spike in
      `[RATE LIMIT] ... exceeded` or `[MFA] Failed verification attempt`
      is worth a human being notified about, not just logged. See
      `docs/INCIDENT_RESPONSE.md` §5.
- [ ] **When the product's scale/funding justifies it:** budget a
      professional penetration test and consider Google Cloud Armor
      (WAF) in front of the service — both already flagged in
      `docs/DEPLOY.md` §6 and `docs/OUTSTANDING_SECURITY_ITEMS.md`, not
      urgent today, worth revisiting as usage grows.

## Sign-in hardening & social auth (see `docs/AUTH_HARDENING_AND_SOCIAL_LOGIN.md`)

- [ ] **Register an Azure AD app for Microsoft sign-in:**
  1. Go to **https://portal.azure.com** → search **"App registrations"** →
     **New registration**.
  2. Name it (e.g. "Blaze Break"), leave "Supported account types" at its
     default (or choose "Accounts in any organizational directory and
     personal Microsoft accounts" for the broadest sign-in coverage),
     and for **Redirect URI** choose **Web** and enter the OAuth
     redirect URI Firebase Console shows in the next step (format:
     `https://<project-id>.firebaseapp.com/__/auth/handler`).
  3. After creating it, copy the **Application (client) ID** from the
     app's Overview page.
  4. Go to **Certificates & secrets** → **New client secret** → copy the
     **Value** immediately (shown once).
  5. In **Firebase Console → Authentication → Sign-in method → Add new
     provider → Microsoft**, paste the Application (client) ID and the
     client secret, then **Save**.
- [ ] **Register a Meta for Developers app for Facebook sign-in:**
  1. Go to **https://developers.facebook.com/apps** → **Create App** →
     choose a use case that includes "Facebook Login" (e.g. "Consumer" or
     "Other" → "Authenticate and request data from users with Facebook
     Login").
  2. Once created, go to the app's **Facebook Login → Settings** and add
     the OAuth redirect URI Firebase Console shows (format:
     `https://<project-id>.firebaseapp.com/__/auth/handler`) under
     **Valid OAuth Redirect URIs**.
  3. Go to **App Settings → Basic** and copy the **App ID** and **App
     Secret** (click "Show" and re-enter your Meta password).
  4. In **Firebase Console → Authentication → Sign-in method → Add new
     provider → Facebook**, paste the App ID and App Secret, then
     **Save**.
  5. Note: a newly-created Meta app starts in "Development Mode," which
     only allows sign-in from accounts with a role on the app (Admin/
     Developer/Tester) — submit it for **App Review** (requesting the
     `email` and `public_profile` permissions) before real users can sign
     in with Facebook.
- [ ] **Check/set Firebase Password Policy:** Firebase Console →
      Authentication → Settings → Password Policy. Check what's
      currently configured first (this session couldn't verify Console
      state). Recommended, to match `src/lib/password-strength.ts`:
      Enforcement mode "Require," minimum length **10**, and require at
      least (uppercase, lowercase, numeric, non-alphanumeric) — Firebase
      lets you require each category independently rather than "N of 4,"
      so requiring all four is the closest match and is stricter than
      this app's own client-side check, which is fine (Console is the
      real enforcement point; the client check just can't be laxer than
      it without confusing users who pass the UI check then fail at
      Firebase).
- [ ] **Check/enable App Check enforcement for Authentication:**
      Firebase Console → App Check → APIs tab → Authentication →
      **Enforce**. App Check is already initialized client-side
      (`src/lib/firebase.ts`) and Firebase Auth automatically attaches
      tokens once it's initialized — this Console toggle is the only
      remaining step, and this session couldn't verify whether it's
      currently on.
- [ ] **Deploy the new `functions/` Cloud Functions** (`beforeSignIn`/
      `beforeCreate`) — see `docs/DEPLOY.md` §9 for the exact commands.
      On first deploy, Firebase will prompt to register them as the
      active blocking functions for those events (or do it manually via
      Authentication → Settings → Blocking functions) — until that
      registration exists, the functions are deployed but never actually
      called.

## What this checklist deliberately does not include

Application-level fixes (code, Firestore rules, tests) are not manual
actions — they're already done and described in
`docs/SECURITY_HARDENING.md`. This file is specifically the subset of
outstanding work that literally cannot be done by editing this
repository, because it lives in GCP/GitHub configuration or requires a
decision this document can't make for you.
