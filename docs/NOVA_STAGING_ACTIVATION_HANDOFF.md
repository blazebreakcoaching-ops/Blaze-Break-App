# Nova Agentic Journey — controlled staging activation handoff

**2026-11-01. Source-only operating procedure; not permission to deploy.**

## Evidence and scope

Cloud Code's 2026-11-01 verification report records a clean offline engineering gate at `724052bd9057adfc257e89b67b7a79a06bc59ff9`: 4,769 Vitest tests, 91 component tests, 21 emulator tests, 66 preview browser tests and 21 real-app browser tests passed. The latter uses real App.tsx + Auth/Firestore **emulators**, with Nova's chat API mocked. GitHub confirms the reported commit and the verifier fixes; test logs reside in Cloud Code's working environment and are not re-executable through the GitHub connector.

**IMPORTANT:** Later GitHub commits modified `src/lib/useNovaAgenticJourneyEnabled.ts` to reset the flag at sign-out/account changes and reject stale prior-account responses, adding a new test suite. The report above does **not** cover those later commits. Fresh tests are required at the latest head, starting with:
```bash
npx vitest run --config vitest.components.config.ts src/lib/useNovaAgenticJourneyEnabled.test.tsx
npm run verify:release:offline -- --all
```

## Scope ready for staging review

The flag-gated, **non-NHEI** Nova Agentic Journey already connects these components through the actual App: Before Words (temporary session-scoped context), Invisible Load, proactive suggestions, Calendar Protection **proposal/review only**, Task Deferral **proposal/review only**, and ordinary Nova chat continuity.

The server is authoritative: `GET /api/nova/journey-config` exposes a boolean using `NOVA_AGENTIC_JOURNEY_ENABLED`, and the practical-assistance tool enforces the flag server-side. The UI defaults off and now resets off on auth changes.

Calendar writes are **hard-disabled in source**, and Task Deferral has no real external writer. Do not lift either restriction as part of this roll-out. Do not change NHEI personal/longitudinal features or safeguarding approvals.

## Staging project boundary — verify before running any command

`.firebaserc` currently maps `default` AND `production` to `gen-lang-client-0537893432`, and `staging` to `blaze-break-staging`. **Never use implicit `default` for staging tasks.**

`firebase.json` declares Firestore database `ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc`. Do not assume the named database exists in the staging project: a source alias is not evidence of a provisioned cloud resource. The emulator uses the Standard edition, which does not prove full Enterprise database parity.

Cloud Code reported **no GCP/Firebase credentials**. Use a project-scoped, short-lived identity granted by the project owner for **read-only** checks; do not request downloaded long-lived service-account keys. If no approved credentials exist, record `NOT RUN` and do not attempt cloud mutations.

## Read-only inspection sequence, only after secure access exists

1. Confirm the active identity and project before every query:
   `gcloud auth list`; `gcloud config get-value project`; `gcloud projects describe blaze-break-staging`.
2. Inspect staging Cloud Run service without changing it:
   `gcloud run services describe blaze-break --project=blaze-break-staging --region=europe-west2 --format=json`.
   Check the deployed revision, image/digest, latest-ready state and explicit `NOVA_AGENTIC_JOURNEY_ENABLED` value. Redact any other environment values/secret references from reports.
3. Confirm the staging Firestore databases and the exact named database's existence using the approved read-only identity and `--project=blaze-break-staging` on every relevant CLI command.
4. Confirm staging users/knowledge review status using only safe metadata and authorised access. Do not export private user records.
5. Inspect existing network ingress, App Check, Firebase Auth, OAuth redirect allowlists, and the staged app URL. A Cloud Run service existing in one project does not prove Firebase Hosting/Auth/client config targets that same project.

## Staging test protocol — separate explicit approval

If the project owner authorises a non-NHEI staging pilot, independently confirm the staging resources, deploy target and rollout plan first. A repository merge into `main` automatically triggers a **production** Cloud Run + Firestore workflow and is NOT the approved staging mechanism.

In a correctly isolated staging environment, with synthetic test accounts and an explicitly approved deployment procedure, enable only `NOVA_AGENTIC_JOURNEY_ENABLED=true` **on that staging service**. Verify the server's authenticated `/api/nova/journey-config` output through the real app; check ordinary Nova remains available if the flag is absent/off or the request fails.

Exercise the entire app: authenticated entry, Before Words skip and handoff, Invisible Load Back/Start-over, proactive suggestion/decline/edit, calendar proposal without provider write, task deferral without external provider write, memory consent boundaries and logout/relogin with in-flight config requests. Use test data; record request/response **metadata**, not chat content.

Ensure rollback is documented and tested: turn the staging flag OFF or revert the specific staging revision, then verify plain Nova loads. No user-facing production activation until separate acceptance and specialist review gates have been satisfied.

## Feedback loop to ChatGPT

Report the exact commit tested, each command's exit code, test counts, staging project and revision IDs, **actual** configuration values of non-sensitive flags, the type of Firebase/GCP authentication used (never secrets), observed real-application behaviours, and a distinct PASS/FAIL/NOT RUN result for every step. List changed files and GitHub SHAs. If cloud access is missing, state it once and proceed with source/fixture tests; never imply staging was exercised.

**Current status: staging activation NOT VERIFIED / NOT AUTHORISED by this runbook.**
