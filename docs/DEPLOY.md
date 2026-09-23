# Deploying Blaze Break

Blaze Break is a single Node process that serves both the built frontend
(`dist/`) and the Express API (`server.ts`), plus a WebSocket for Nova's live
voice. It runs on Google Cloud Run today (see the `*.run.app` origins in
`server.ts`). This document covers what "going live" actually requires.

> The app is NOT a static site and NOT a plain AI Studio app — it needs a real
> Node backend (Twilio, WebSockets, `node-cron`, Firebase Admin, Vertex). AI
> Studio can't run that; Cloud Run (or equivalent) is the runtime.

---

## 1. The non-negotiable production settings

These are the settings that, if missed, silently weaken security or break the
app. Set them on the Cloud Run service (or any host).

| Setting | Value | Why it matters |
|---|---|---|
| `NODE_ENV` | `production` | **Critical.** The strict CSP (helmet), **App Check enforcement**, and static-file serving of the built frontend ALL gate on `NODE_ENV === "production"`. If it's unset, App Check turns off, security headers vanish, and the frontend won't be served. |
| `PORT` | injected by host | The server now reads `process.env.PORT` (Cloud Run injects `8080`). No action needed beyond letting the host set it. |
| `APP_CHECK_DOMAIN` | your live domain(s), no scheme, comma-separated for more than one | Each is added to the CORS allowlist as `https://<domain>`. Without it, the browser origin for your real domain isn't trusted. A custom domain plus its `www.` subdomain need both listed, e.g. `blazebreak.app,www.blazebreak.app` - the original `*.run.app` URL stays trusted regardless, since it's a separate hardcoded entry. |
| Request timeout | **≥ 900s** | Nova voice sessions are capped at 15 min; Cloud Run's default 5-min timeout would cut calls off. |
| Session affinity | **on** | Keeps a live-voice WebSocket pinned to one instance. |

Local dev (`NODE_ENV` unset) keeps `localhost` CORS origins and the Vite dev
server; production drops both. That split is intentional.

---

## 2. Secrets — via Secret Manager, never baked into the image

Store these in Google Secret Manager and mount them as env vars on the service
(`gcloud run deploy ... --set-secrets`). See `docs/NOVA_ENV_VARS.md` for what
each one does.

Required / commonly needed:

- `GEMINI_API_KEY` — Nova chat, diagnose, speech, and live voice.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — guardian
  alerts and outbound SMS. Without these, messaging degrades gracefully (it
  reports "not configured" rather than crashing).
- `APP_CHECK_DOMAIN` — see the table above.

Optional (feature-flagged provider/integration paths):

- `NOVA_CHAT_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VERTEX_LOCATION`,
  `NOVA_TOOLS_ENABLED` — alternative Nova providers/behaviour.
- `BREVO_API_KEY`, web-push VAPID keys — email/push, if used.
- `MFA_ENCRYPTION_KEY` — required before any user can enable the opt-in
  2FA toggle (`openssl rand -base64 32`). Enrollment fails loudly, not
  silently, if unset. See `docs/SECURITY_ARCHITECTURE.md`.
- `SSO_CONFIG_ENCRYPTION_KEY` — required before an org can store an
  inline SSO client secret (`openssl rand -hex 32`); without it the
  server only accepts a `secretRef` pointing elsewhere. See
  `docs/SSO_INTEGRATION_PLAN.md`.

**Firebase Admin & Vertex AI use Application Default Credentials** — no key
file. On Cloud Run this is the service account attached to the service; grant
it the roles below. Do not ship a service-account JSON.

---

## 3. Runtime service-account IAM roles

Grant the Cloud Run runtime service account:

- `roles/datastore.user` — Firestore read/write.
- `roles/firebaseauth.admin` — verify ID/App Check tokens, delete accounts.
- `roles/aiplatform.user` — the Vertex AI Nova path (only if `NOVA_CHAT_PROVIDER=vertex`).
- `roles/iam.serviceAccountTokenCreator`, **granted to the runtime service
  account on itself** (self-bound) — required for password-reset and
  email-verification link generation (`generatePasswordResetLink`/
  `generateEmailVerificationLink`, both used in `server.ts`). Application
  Default Credentials via the metadata server don't implicitly grant
  `iam.serviceAccounts.signBlob`, which those two Admin SDK calls need to
  sign the link. Without this grant, the feature fails loudly (a
  distinct, logged `[AUTH] ... failed — likely missing
  roles/iam.serviceAccountTokenCreator` line) rather than silently, but a
  missing password-reset flow in production is still a real, disruptive
  gap. Grant it with:
  ```
  gcloud iam service-accounts add-iam-policy-binding \
    RUNTIME_SERVICE_ACCOUNT_EMAIL \
    --member="serviceAccount:RUNTIME_SERVICE_ACCOUNT_EMAIL" \
    --role="roles/iam.serviceAccountTokenCreator"
  ```

---

## 4. Firestore security rules

The rules live in `firestore.rules` and are the last line of defence for
direct client access. Deploy them (and indexes, which changed together
in the same commit) whenever either changes:

```
firebase deploy --only firestore:rules,firestore:indexes
```

They are deny-by-default with per-collection field validation, restricting
direct client reads of `mood_pulses`/`body_checkins`/`climate_survey_responses`
to their own owner. The minimum-cohort ("k-anonymity") threshold itself is
enforced in application code (`server.ts`, via the Admin SDK), not in these
rules - see `docs/PRODUCT_SAFETY_PRIVACY.md` for that boundary. Server-only
collections — including `entitlements/status` (Free/Premium tier) and
`usage_counters` (capability quota tracking, see
`docs/FREE_PREMIUM_ENTITLEMENTS.md`) — are written exclusively via the
Admin SDK and correctly have no client write rule.

### This project's database is Firestore Enterprise edition

Discovered the hard way during the first real deploy — worth knowing
before you touch `firestore.rules`/`firestore.indexes.json` again:

- **`firebase.json` must name the database explicitly.** This project
  doesn't use the `(default)` Firestore database; it uses a named one
  (`ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc`, set as
  `firestore.database` in `firebase.json`). Without that field, `firebase
  deploy` tries to target/create a `(default)` database instead of the
  real one.
- **`fieldOverrides` in `firestore.indexes.json` cannot be deployed via
  `firebase deploy` on Enterprise edition.** It's simply unsupported by
  the CLI against this database type. `firestore.indexes.json`
  deliberately contains only the one composite index that page of
  Enterprise-edition config *does* accept
  (`audit_logs`: userId + createdAt) — every single-field
  collection-group index this codebase needs is created directly instead:

  ```
  gcloud firestore indexes composite create \
    --collection-group=pulse_status --field-config=field-path=score,order=ascending \
    --query-scope=collection-group --database=ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc

  gcloud firestore indexes composite create \
    --collection-group=pulse_status --field-config=field-path=reportedAt,order=ascending \
    --query-scope=collection-group --database=ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc

  gcloud firestore indexes composite create \
    --collection-group=recovery_ally --field-config=field-path=shareToken,order=ascending \
    --query-scope=collection-group --database=ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc

  gcloud firestore indexes composite create \
    --collection-group=nudge_schedules --field-config=field-path=enabled,order=ascending \
    --query-scope=collection-group --database=ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc

  gcloud firestore indexes composite create \
    --collection-group=usage_counters --field-config=field-path=updatedAt,order=ascending \
    --query-scope=collection-group --database=ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc
  ```

  The last one (`usage_counters.updatedAt`) backs `GET
  /api/admin/cost-usage` — create it once that route is live in
  production; it isn't needed before then. Confirm each with
  `gcloud firestore indexes composite list --database=<id>` — look for
  `STATE: READY`. **If a new collection-group query is added later that
  needs its own single-field index, it goes here, not back into
  `fieldOverrides`.**
- **`firebase firestore:delete --all-collections` silently does nothing
  on this database type** — it reports success (exit 0) without deleting
  anything. Confirmed by direct REST API check. Use
  `gcloud firestore bulk-delete --collection-ids=<name> --database=<id>`
  instead, and verify emptiness afterward rather than trusting the exit
  code.
- **`{service}` is a reserved word in Firestore Rules syntax** and can't
  be used as a wildcard match variable (e.g. `match
  /integration_tokens/{service}` fails to compile) — this codebase uses
  `{serviceName}` instead. Keep that in mind if adding new per-provider
  match blocks.

---

## 5. Build & run

```
npm ci --legacy-peer-deps
npm run build      # Vite frontend -> dist/, esbuild backend -> dist/server.cjs
npm start          # runs dist/server.cjs; serves frontend + API on $PORT
```

A container image should do the same (Node 22 base) and set
`NODE_ENV=production`.

---

## 6. Ongoing security hygiene

- **Dependency updates:** `.github/dependabot.yml` raises weekly grouped PRs and
  immediate security PRs for npm and GitHub Actions. Review and merge them.
- **Known remaining advisories:** `npm audit` currently reports a few *moderate*
  issues, all transitive inside `firebase-admin`'s tree (`@google-cloud/storage`
  → `teeny-request`/`retry-request`). Clearing them needs a major `firebase-admin`
  bump, which is a deliberate, tested change — do it via a Dependabot PR, not
  `npm audit fix --force`. The high-severity `tar`/`ip-address`/`qs` advisories
  are already resolved.
- **Secret scanning:** enable **GitHub secret scanning + push protection** on
  the repository (Settings → Code security). It blocks a credential from ever
  being committed. `.env*` is already gitignored and no secrets are tracked.
- **Before scale:** consider Google Cloud Armor (WAF) in front of the service,
  and budget a professional security review — appropriate for an app holding
  mental-health data.

---

## 7. Sandbox-untestable paths (verify on a real deploy)

Some things can't be exercised in CI and should be smoke-tested against a real
environment with real credentials:

- Nova **live voice** end-to-end (mic → Gemini Live → audio back) and the
  cross-call continuity greeting.
- **Guardian alert / Twilio** actually delivering an SMS to a real phone.
- **Vertex AI** path (depends on ADC + IAM being correct on the host).

---

## 8. Connecting a custom domain

The app runs on Cloud Run behind its `*.run.app` URL; a custom domain is
layered on top via a Firebase Hosting rewrite (`firebase.json`'s
`hosting.rewrites` block already points `**` at the `blaze-break` Cloud
Run service) rather than Cloud Run's own domain-mapping feature, since
Firebase Hosting's domain UI is friendlier for DNS setup and comes with
a managed SSL cert and CDN for free. `firebase.json`'s `hosting.public`
deliberately points at an intentionally-empty placeholder directory
(`firebase-hosting-public/`), not `dist/` - if it pointed at `dist/`,
Firebase Hosting would serve its own (potentially stale, deployed on a
different schedule than Cloud Run) copy of the built assets for any
exact-path match, silently reintroducing the same class of "stale
cached build" bug already fixed once for the service worker. With an
empty public dir, literally every request falls through to the `**`
rewrite, so Cloud Run's own `server.ts` - with its already-correct
cache headers - stays the single source of truth.

Once DNS is pointed at Firebase Hosting (via its own guided "Add custom
domain" flow in the Firebase Console), a custom domain needs to be
added in three *more* places or specific features silently break on
that domain while continuing to work fine on the original `*.run.app`
URL:

1. **`APP_CHECK_DOMAIN`** (Cloud Run env var) - add the new domain(s),
   comma-separated alongside anything already there. Without this, the
   browser's `Origin` header for the new domain fails the CORS check on
   every `/api/*` call.
2. **Firebase Console → Authentication → Settings → Authorized domains**
   - add the new domain. Without this, Google sign-in's popup flow
   fails with an "unauthorized domain" error on the new domain
   specifically.
3. **Google Cloud Console → Security → reCAPTCHA Enterprise → the site
   key named by `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` → Edit → Domains**
   - add the new domain. reCAPTCHA Enterprise keys are domain-restricted;
   without this, App Check silently fails to produce a token on the new
   domain, which cascades into every Firestore read/write looking like a
   permissions error there (see the CSP comment in `server.ts` for the
   same failure mode already documented once).

---

## 9. Auth Blocking Functions — a separate Cloud Functions deployment

`functions/` holds Firebase Auth Blocking Functions (`beforeSignIn`,
`beforeCreate` - see `docs/AUTH_HARDENING_AND_SOCIAL_LOGIN.md` for what
they do and why). This is a genuinely separate deployment target from everything
else in this doc: its own `package.json`, its own `node_modules`, its
own build step, deployed via the Firebase CLI, **not** `gcloud run
deploy` and **not** covered by `npm run build`/`npm start` in §5.

```
cd functions
npm install --legacy-peer-deps   # first time / after a dependency change - see the
                                  # npm arborist note below for why --legacy-peer-deps
npm run build                    # tsc -> functions/lib/ (gitignored, not committed)
npm test                         # vitest - pure logic only, no live Firebase needed
cd ..
firebase deploy --only functions
```

- **`npm install` inside `functions/` may fail with `Cannot read
  properties of null (reading 'edgesOut')`** on some npm 10.x versions -
  a known npm/arborist bug resolving vitest's peer-dependency graph, not
  a problem with this codebase. `npm install --legacy-peer-deps` works
  around it.
- **This is this Firebase project's first-ever Cloud Functions
  deployment.** Cloud Functions requires the Blaze (pay-as-you-go) plan
  - almost certainly already active here since Cloud Run itself needs
  it, but if `firebase deploy --only functions` fails with a
  billing-plan error, that's the fix (Firebase Console → upgrade to
  Blaze).
- **Blocking Functions specifically also need one extra one-time step**
  that a normal Cloud Function deploy doesn't: Firebase Console →
  Authentication → Settings → "Blocking functions" (or the CLI prompts
  for this automatically on first deploy) → register `beforeSignIn`/
  `beforeCreate` as the active blocking functions for those events. Until
  that registration exists, the functions are deployed but Firebase
  never actually calls them.
- **Redeploy after ANY change** to `functions/src/**` - unlike the main
  app, there is no single combined deploy command; forgetting
  `firebase deploy --only functions` after a functions/ change leaves
  the old version live indefinitely with no error anywhere to notice by.
