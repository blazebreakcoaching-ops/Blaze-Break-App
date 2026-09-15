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
| `APP_CHECK_DOMAIN` | your live domain (no scheme) | Added to the CORS allowlist as `https://<domain>`. Without it, the browser origin for your real domain isn't trusted. |
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

**Firebase Admin & Vertex AI use Application Default Credentials** — no key
file. On Cloud Run this is the service account attached to the service; grant
it the roles below. Do not ship a service-account JSON.

---

## 3. Runtime service-account IAM roles

Grant the Cloud Run runtime service account:

- `roles/datastore.user` — Firestore read/write.
- `roles/firebaseauth.admin` — verify ID/App Check tokens, delete accounts.
- `roles/aiplatform.user` — the Vertex AI Nova path (only if `NOVA_CHAT_PROVIDER=vertex`).

---

## 4. Firestore security rules

The rules live in `firestore.rules` and are the last line of defence for
direct client access. Deploy them (and indexes, which changed together
in the same commit) whenever either changes:

```
firebase deploy --only firestore:rules,firestore:indexes
```

They are deny-by-default with per-collection field validation and a
k-anonymity gate on org aggregates. Server-only collections — including
`entitlements/status` (Free/Premium tier) and `usage_counters` (capability
quota tracking, see `docs/FREE_PREMIUM_ENTITLEMENTS.md`) — are written
exclusively via the Admin SDK and correctly have no client write rule.

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
