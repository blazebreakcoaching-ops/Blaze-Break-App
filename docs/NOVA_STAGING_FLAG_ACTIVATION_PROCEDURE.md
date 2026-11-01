# Nova Agentic Journey — staging flag activation & rollback procedure

**2026-11-01. Prepared by Cloud Code. This is a documented procedure, not an executed action.**
No command in this file has been run against any real GCP/Firebase project. Nothing here
authorises activation — it exists so that, once the project owner explicitly authorises a
staging pilot (see `docs/NOVA_STAGING_ACTIVATION_HANDOFF.md`), the exact steps are already
reviewed instead of being improvised under time pressure.

## Preconditions (all must be true before step 1 runs)

1. The project owner has explicitly authorised a staging pilot of the non-NHEI Agentic
   Journey, in writing, separately from this document.
2. The `blaze-break-staging` GCP/Firebase project has been confirmed to actually exist and
   be provisioned — per `docs/DEPLOY.md`'s "One-time staging setup" section. Its presence as
   an alias in `.firebaserc` is **not** that confirmation; `gcloud projects describe
   blaze-break-staging` must succeed.
3. A Cloud Run service is already deployed to that project (`gcloud run services describe
   blaze-break-staging --project=blaze-break-staging --region=europe-west2` succeeds) running
   a commit SHA that has passed `npm run verify:release:offline -- --all` with a
   `ENGINEERING_CHECKS_PASS__NOT_DEPLOYMENT_APPROVAL` verdict.
4. A synthetic test cohort (test accounts, not real users) has been identified for the pilot.
5. Whoever runs this holds only the least-privilege staging role needed (see
   `docs/NOVA_STAGING_ACTIVATION_HANDOFF.md`'s IAM section) — never a production-scoped or
   long-lived service-account key.

If any precondition is unmet, stop and report `NOT RUN` for that precondition rather than
proceeding partially.

## Step 1 — confirm current state before changing anything

```bash
gcloud config get-value project   # must print blaze-break-staging, never the default alias
gcloud run services describe blaze-break-staging --project=blaze-break-staging \
  --region=europe-west2 --format=json > /tmp/staging-before.json
```
Record, before any change: the current revision name, image digest, and the current value
of `NOVA_AGENTIC_JOURNEY_ENABLED` (expected: absent or `false`). This revision name is what
step 4's rollback targets.

## Step 2 — activate the flag on staging only

```bash
gcloud run services update blaze-break-staging \
  --project=blaze-break-staging --region=europe-west2 \
  --update-env-vars=NOVA_AGENTIC_JOURNEY_ENABLED=true
```
Cloud Run revisions are immutable: this creates a **new** revision with the flag on and
routes 100% of traffic to it. It does not touch any other environment variable or secret,
and it never touches the `production`/`default` project
(`gen-lang-client-0537893432`) — confirm the `--project` flag on every command in this
procedure before running it; omitting it is the single most likely way to hit production by
mistake, since `default` already points there.

## Step 3 — verify through the real app, not the CLI alone

1. `curl -I https://<the staging Cloud Run URL>/api/nova/journey-config` with no
   Authorization header must return `401` (matches `authenticateFirebaseUser`'s real
   behaviour, confirmed in this phase's own real-app test).
2. Sign in as a synthetic test account through the real staging URL and confirm the
   authenticated response is `{"agenticJourneyEnabled": true}`.
3. Confirm ordinary Nova chat still works for an account that signs in while the flag
   request is in flight or fails (the client hook fails closed to plain `NovaChat` — this
   phase's `useNovaAgenticJourneyEnabled.test.tsx` and the real-app sign-out/account-switch
   test both cover this at the code level; this step confirms it once more against the real
   staging deployment specifically).
4. Walk the pilot scope exactly as `NOVA_STAGING_ACTIVATION_HANDOFF.md` §"Staging test
   protocol" describes: Before Words skip, Invisible Load add/Back/Start-over, a proactive
   suggestion accepted and declined, a Calendar Protection proposal through to its honest
   "nothing was actually sent" outcome, a Task Deferral proposal through to its honest
   simulation-only outcome, and logout/relogin with an in-flight config request. Record
   request/response metadata only — never chat content.

## Step 4 — rollback (either trigger below)

- **Planned rollback / pilot concluded:**
  ```bash
  gcloud run services update blaze-break-staging \
    --project=blaze-break-staging --region=europe-west2 \
    --update-env-vars=NOVA_AGENTIC_JOURNEY_ENABLED=false
  ```
- **Emergency rollback (something is wrong with the new revision itself, not just the
  flag):** route traffic back to the exact pre-activation revision recorded in step 1,
  without waiting for a new deploy:
  ```bash
  gcloud run services update-traffic blaze-break-staging \
    --project=blaze-break-staging --region=europe-west2 \
    --to-revisions=<REVISION_NAME_FROM_STEP_1>=100
  ```
- Either way, re-run step 3.1–3.3 against staging afterward to confirm the flag is
  genuinely off again and plain `NovaChat` is what a fresh sign-in gets — rollback is not
  considered complete until that's verified, not merely commanded.

## What this procedure deliberately does not do

- It never runs `gcloud run deploy` with `--source=.` against staging (that would deploy
  whatever is in the working tree, not a reviewed, tagged commit) — only
  `services update`/`update-traffic` against an already-deployed revision.
- It never touches `CALENDAR_PROTECTION_EXECUTION_ENABLED`, any NHEI flag, or any secret.
- It never merges to `main` or runs anything against the `production`/`default` project.
- It is not, by itself, authorisation to run step 2. That authorisation is a separate,
  explicit decision by the project owner, recorded outside this file.
