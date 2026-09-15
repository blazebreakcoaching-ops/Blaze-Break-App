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
direct client access. Deploy them whenever they change:

```
firebase deploy --only firestore:rules
```

They are deny-by-default with per-collection field validation, restricting
direct client reads of `mood_pulses`/`body_checkins`/`climate_survey_responses`
to their own owner. The minimum-cohort ("k-anonymity") threshold itself is
enforced in application code (`server.ts`, via the Admin SDK), not in these
rules - see `docs/PRODUCT_SAFETY_PRIVACY.md` for that boundary. Server-only
collections are written exclusively via the Admin SDK and correctly have no
client rule.

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
