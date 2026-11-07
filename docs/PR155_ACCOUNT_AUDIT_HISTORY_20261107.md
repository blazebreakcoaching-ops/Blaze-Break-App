# PR #155 — Per-account audit timeline and audit-write visibility
7 November 2026. Draft-only, no merge/deployment.

## Implemented in source
- New GET /api/admin/accounts/:uid/audit-history, guarded by App Check, Firebase authentication and audit.read.
- Firestore query filters by targetUid *before* pagination, descending by createdAt; each page is 25 records with cursor and has-more response. A cursor targeting another account is rejected.
- New composite index for admin_audit_logs(targetUid ASC, createdAt DESC) is **declared in source only**. It has NOT been deployed to Firebase, so the endpoint cannot be assumed to work in staging/production.
- AdminAccountAuditHistory shows actor, action, date, outcome, limited operational metadata, empty/error/retry, and Next/Previous pages for an individual account. The Plans & Entitlements screen now loads this timeline on demand instead of using the initial 100 general audit events.
- logAdminAction now returns whether Firestore persisted the event. Account role changes, plan changes and suspend/reactivate API responses include auditRecorded without changing the success flag for an already-completed mutation. AdminDashboard shows an explicit error if the action succeeded but the audit event did not persist.
- Source regression checks were authored in admin-account-audit-history.test.ts.

## Strict limits and unresolved security gates
- No durable outbox, replay mechanism, dead-letter queue or alert integration exists. Missing audit writes remain missing from Firestore; Cloud Run logs may provide recovery evidence but are not a verified durable ledger. Do NOT claim comprehensive or immutable audit coverage.
- The new account timeline covers events with a targetUid. Legacy events lacking targetUid or Firestore events never persisted will not appear. The route does not prove a complete sign-in history, user activity history or compliance archive.
- The existing audit writer still stores IP/user-agent in server-side audit documents, although the returned API schema excludes them. Review necessity, retention and access controls separately.
- Verify index deployment in **staging**, Firestore query performance and document-level access. Audit.read grants platform-level operational access only; ensure role revocation immediately applies to already signed-in sessions.
- Full TypeScript, Vitest, React/browser, emulator and staging suites were NOT run here. Source-level assertions only; no green-release claim.
- No GitHub Actions, PR merge, staging/production deployment or live Firebase database change performed. All commits carry [skip ci].

## Next batch
1. Add reliable audit failure alerting and an idempotent outbox/recovery design, with genuine Firestore emulator failure tests.
2. Review revoked platform admin tokens, fresh MFA and permission matrices for every sensitive endpoint.
3. Fix truthful executive Overview counts and remove the remaining legacy 100-record API dependence.
