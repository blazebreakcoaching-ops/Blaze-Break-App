# PR #155 — Command Centre account-detail privacy hardening
Date: 7 November 2026
Status: SOURCE-FIXED / TESTS AUTHORED BUT NOT EXECUTED / NO-GO

## Confirmed issue
The existing GET /api/admin/users/:uid route, guarded only by users.read, returned the entire unfiltered Firestore users/{uid} profile and users/{uid}/recovery/fingerprint document. This allowed an administrative identity lookup to disclose potentially sensitive personal recovery content. No current AdminDashboard call was identified that depends on the old detail response.

## Changes on draft branch
- Removed recovery fingerprint reads and all unfiltered profile/fingerprint fields from the endpoint response.
- Kept Firebase Authentication operational identity fields (UID, email and verification, display name, created/last sign-in, disabled status).
- Added only the company's organisationId, explicitly selected from Firestore when present.
- Corrected forbidden POST /api/admin/users/:uid/role operations from misleading HTTP 500 to 403.
- Updated admin-users.route.test.ts: negative assertions that profile/fingerprint/private content are not returned; missing organisation metadata handling; denied role mutation HTTP 403.

## Verification evidence and outstanding gates
Source-response inspection confirms no profile/fingerprint keys in the emitted JSON and no recovery document read in this route. GitHub commits use [skip ci] to avoid triggering Actions. The route tests have NOT been executed; no full typecheck, Firebase emulator, staging/browser QA or production deployment has been performed.

Other privileged endpoints may still expose sensitive fields and require a separate privacy inventory. In particular, review exports, company reporting, administrative read routes, logs and analytics for individual wellbeing data; do not infer that tightening this one endpoint establishes system-wide tenant privacy.

Command Centre backlog continues: full paginated Firebase Auth + Firestore reconciled directory (existing 100 Firestore-row cap still applies), server-side exact-email/UID lookup, access-action governance, sign-in event history, executive homepage and five-workspace component split. Organisation still requires role-matrix, legacy permission and true backend/staging tests.

DO NOT merge or deploy PR #155 without current-head acceptance and explicit approval.
