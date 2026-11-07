# PR #155 — Command Centre audit history and outcome provenance
7 November 2026 • Draft branch only • NOT RELEASE VERIFIED

## Changes completed in source
- GET /api/admin/audit-logs now returns 50 events per request with a Firestore document-snapshot cursor and nextCursor. Invalid/missing cursors are rejected. The old response's logs array remains available for compatibility.
- New AdminAuditHistory UI replaces the formerly capped 100-event Audit tab and provides Next/Previous navigation, page-only categories, loading/error/retry, date, actor, target and explicit outcome indicators.
- The public admin audit API now selects operational fields and a small allowlist of harmless primitive metadata instead of spreading the entire stored audit document, including IP/user-agent fields, into the browser.
- Existing logAdminAction accepts an optional structured outcome. Three operations that have already successfully written state — update_user_role, grant_entitlement and suspend/unsuspend — explicitly write outcome=succeeded. All older/unannotated events display unknown, not success.
- Source contract tests were added in admin-audit-pagination.test.ts. They are NOT a true test-suite result.

## Important outstanding risks
- An audit write can fail after the privileged operation succeeds. The writer currently logs the failure to Cloud Run diagnostics but the Firestore ledger can be incomplete. A durable outbox/repair and alert workflow is still required for comprehensive guarantees.
- No complete evidence of audit events for failed/rejected operations is present. The new UI does not claim it captures failures.
- The Plans & Entitlements inline per-account timeline still derives from the independently capped initial audit records. A dedicated server-side per-user paginated timeline is necessary; do not call that timeline complete.
- The legacy loadAllData fetch is still capped, though the Audit tab now uses its own endpoint pagination. The Overview users count also needs truthful global metrics.
- No database index changes, Firestore data migrations, GitHub Actions, merges or deployments were performed.
- Actual full repository compilation, Vitest, Firebase emulator permission testing, pagination on real Firestore, UI browser testing, account-switch testing and staging acceptance are all outstanding. Explicit owner approval is required before any release.

## Readiness
SOURCE-IMPLEMENTED, QA UNRUN, NO-GO for merge or production deploy.
