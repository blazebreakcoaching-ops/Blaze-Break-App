# PR #155 — Audit recovery, admin revocation and truthful Overview
7 November 2026 • draft branch • SOURCE CHANGES ONLY

## Implemented
### Audit persistence
- logAdminAction now assigns one stable Firestore event document ID and tries the primary audit write twice.
- On primary failure, it attempts to save the same event ID and full event into admin_audit_recovery. A double write failure is emitted as a high-priority AUDIT LOSS RISK error in Cloud Run logs.
- Platform-owner-only POST /api/admin/audit-recovery/replay replays a maximum of 25 queued events, checks for an existing audit event first and deletes queue entries only after successful primary persistence.
- Existing admin role, entitlement and suspension responses still surface auditRecorded=false so the admin UI warns when the primary record was not written.
- This includes **manual owner replay and an opportunistic automatic retry** of at most three queued events after later successful audit writes. No cron, alert subscription, guaranteed externally durable outbox, or scheduled retry has been deployed. The fallback collection shares the same Firestore dependency and will also fail during a full outage. The API is not fully compliance-grade audit evidence.
- Manual replay requires an authorised platform-owner account and a real production/staging service deployment. No replay was executed.

### Admin role/session governance
- Admin creation, role change, removal, application-level role change and suspension/reactivation now invoke Firebase Auth revokeRefreshTokens immediately after changing their Auth state.
- Existing authenticateFirebaseUser already calls verifyIdToken(token, true); revocation is intended to invalidate previously issued sessions, not merely future refreshed tokens.
- The general account-role endpoint also checks last-platform-owner protection on downgrades and clears legacy admin/platform_owner boolean claims when assigning a non-platform role.
- Note: partial failures can occur between the claim write, revocation, Firestore update and audit record. The routes are NOT yet transactional. End-to-end tests must verify no stale privilege, session reauthentication and last-owner protection; revocation failures are especially sensitive.

### Executive Overview counts
- GET /api/admin/summary now uses Firestore count() aggregation over all users documents instead of .limit(100).get().
- Summary explicitly returns usersCountSource=firestore_profiles. The Executive Overview card is relabelled Firestore Profiles, shows Unavailable on failed/unsupported count and states that Auth-only accounts are excluded.
- This is an **exact Firestore profile count**, not the total number of Firebase Auth accounts or paying customers. Separate customer, anonymous, and subscription counts remain future work.
- In-memory fake Firestore now provides count() aggregation support for subsequent tests.

## Verification
Source inspection checked exact count, UI label, five revocation call sites, queue and owner-only replay, stable event IDs, source test presence and fake aggregation. Source assertions passed; actual Vitest/TS compilation/browser/Firebase emulator/index validation were NOT executed, and no GitHub Actions were triggered.

## Release gate
- Deploy/prerequisite check: Firestore admin_audit_logs(targetUid,createdAt) index from prior batch is declared in source but NOT deployed.
- Check Firestore rules and admin role matrix, test revocation on existing sessions, test recovery under primary-write failure, and verify manual replay is safe on actual Firestore.
- Review sensitivity and retention of audit recovery entries, especially IP and user agent; add monitoring/alerting and an externally durable outbox before compliance-grade guarantees.
- PR #155 remains draft. Nothing merged to main; nothing deployed.
