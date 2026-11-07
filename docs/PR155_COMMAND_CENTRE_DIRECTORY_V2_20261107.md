# Command Centre — Firebase People Directory, batch 2
7 November 2026 • Draft PR #155 • SOURCE IMPLEMENTED, NOT RELEASE VERIFIED

## Confirmed former limitation
GET /api/admin/users loads at most 100 Firestore users. It misses Firebase Auth-only accounts and cannot provide reliable searches or counts across all users.

## New, separate directory
- GET /api/admin/directory (App Check + authenticated user + users.read permission).
- Firebase Auth listUsers(50, cursor); responds with nextCursor and total:null (no invented global totals).
- Exact email or UID lookup via Firebase Auth, including users beyond any page.
- Firestore profile and entitlement reads limited to the returned Auth accounts, 50 maximum per page; returns operational account metadata only.
- Signals missing Firestore profile. Private journals, recovery fingerprints, Nova content, wellbeing entries and raw profiles never enter the response.
- New AdminPeopleDirectory React panel on Command Centre > People, above the unchanged legacy management controls. Provides next/previous page, exact lookup and explicit page-only counts.

## Compatibility / intentionally unfinished
- Existing /api/admin/users and legacy account management, entitlements and overview remain unchanged, using their original 100-Firestore-doc first page. They are clearly labelled as limited and MUST NOT be presented as system-wide totals.
- No fuzzy/substring global search; exact Auth email/UID is supported. No complete reconciliation of orphaned Firestore-only records; they remain discoverable only in the legacy page and are not confused with valid Auth users.
- No global count, server-side filtering by plan/role, sorting, audit-backed sign-in history, admin account-level actions within the new browser or proper integration of management drawer into v2. These are next batches.
- New test file admin-directory.route.test.ts covers 105-account 3-page traversal, missing profile, privacy, exact email, unknown identity, access denial and invalid input.

## Evidence / blockers
Ten source assertions passed by rereading current GitHub files. The authored tests have NOT been run via Vitest, typecheck, Firebase emulator or browser. GitHub Actions remain untriggered; no production or staging deployment, merge or Firebase mutation.

Review screen behaviour and Auth/Firestore SDK typing with a real project checkout before merge. Explicit manual release approval and end-to-end staging acceptance remain required. Do not use this commit as evidence of a green release.
