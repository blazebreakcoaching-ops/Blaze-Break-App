# PR #155 — People and Plans tables moved to Auth-directory pages
7 November 2026 · DRAFT · NOT DEPLOYED OR QA APPROVED

## Source changes
- The reusable AdminPeopleDirectory now reports the current Auth-backed account page to AdminDashboard through onAccountsChange.
- People Directory table and the Plans & Entitlements table use directoryPageUsers, not the first 100 Firestore records returned by legacy GET /api/admin/users.
- Each tab includes the Firebase paginated browser, exact-email/UID lookup and the existing account management drawer. Current-page filters are deliberately labelled as such; no false platform-wide totals.
- Roles offered in the client filter reflect the current Firebase page.
- Plans tab warns that its access timeline comes from a separately capped audit-log query and is not an exhaustive history. Do not interpret zero results as absence of changes.
- On administrator identity change, selected account, pending confirmation and directoryPageUsers are cleared; child directory remounts with the signed-in UID.
- Source regression checks added to admin-directory-management.test.ts.

## Still open, not to be conflated with completion
- The Overview people card and legacy internal loadAllData still rely on the 100-document Firestore route. They are not full tenant totals; the separate summary metrics need reconciliation.
- Firebase Auth-only accounts have no full Firestore user profile; account actions may require a verified setup path.
- Audit history is capped, with no per-account cursor pagination, so Plan Timeline is only a partial list.
- Plan/user filters remain local to the displayed directory page. Global filter/search other than exact email/UID requires a separately designed indexed backend.
- Source-only checks do not prove TypeScript build, Vitest, emulator permission tests, browser accessibility, Firebase Auth token revocation or staging acceptance.
- A full shared-browser account-switch and concurrent mutation/browser QA pass is still required.

No GitHub Actions, merge, deployment, Firebase writes or production changes performed. Source commits carry [skip ci]. The current draft branch is not approved for release.
