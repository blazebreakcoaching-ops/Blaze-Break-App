# PR #155 — Command Centre People Directory account controls
7 November 2026 • Source implementation only • Release NO-GO

## Completed in draft
- New Auth-backed paginated directory now provides a **Manage** button for each row, including accounts beyond the first 100 Firestore user documents and Auth-only accounts.
- Reuses the existing consolidated AdminDashboard account drawer for role/claims, manual plan grants and suspension; no duplicate privileged write endpoints introduced.
- Exposes the operational account fields needed by the existing drawer (plan, effective entitlement, last sign-in, account status).
- After successful role/plan/suspend writes, refreshes the selected account via exact UID lookup and increments the directory reload revision to update the visible page/search result.
- Clears selected account and pending confirmations when the signed-in platform-admin UID changes, so a shared browser cannot carry the last administrator's open controls into the next signed-in session. The directory is also keyed to the current UID.
- Clarified that updating an Auth claim does not prove immediate invalidation of previously issued bearer tokens.
- Added source contract tests in admin-directory-management.test.ts and an accessible empty-directory announcement.

## Remaining limitations
- The legacy roster below the new directory and Plans & Entitlements table still use the first 100 Firestore user records; labels already warn about this. The new directory allows management of any Auth account but does not yet replace all legacy tables.
- Privileged management operations need independent server-side enforcement, recent-MFA/claim-revocation verification, token freshness and full role-matrix tests.
- Global counts, plan filtering across all accounts, paged admin audit trails and full sign-in history are not yet available.
- A successful mutation followed by a failed account-data refresh leaves a stale drawer until a manual reload; the original action's success must not be misrepresented as failure.
- Signed-out/role-switched browser QA, keyboard focus, stale asynchronous responses and page navigation need real test execution.

## Evidence
GitHub source re-read confirmed 8 integration/privacy assertions; they are NOT TypeScript, Vitest, Firebase emulator or browser runs. No Actions, merge, staging/production deployment or live Firestore write requested. All commits include [skip ci]. Keep PR #155 draft.
