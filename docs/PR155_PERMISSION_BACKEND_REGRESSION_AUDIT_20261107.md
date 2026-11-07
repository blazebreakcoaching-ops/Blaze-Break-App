# PR #155 — Permission & backend regression audit
7 November 2026. Source inspection and targeted fixes, NOT a production security sign-off.

## Confirmed findings corrected
1. **Granular permission bypass.** requirePermission accepted any legacy admin:true or platform_admin:true as full access, even with an explicit narrow role. Now the owner's bootstrap identity and truly role-less legacy admins are the only compatibility exceptions; explicit roles use getPermissionsForRole().
2. **Stale platform-owner boolean.** requirePlatformOwner accepted platformOwner:true alongside an explicit narrower role. Only role-less legacy identities may rely on that boolean. General account role reassignment already clears legacy booleans and revokes sessions.
3. **Unscoped privileged writes.** Incident create/update now require safety.manage; legal document publishing requires settings.manage; calendar-protection pilot eligibility requires platform-owner status. Incident/legal permission denials now return 403 rather than misleading 500.
4. **Source tests drift.** Updated audit regression tests after introduction of bounded audit recovery. Added explicit role-matrix regression cases for legacy admin flags and a separate route boundary source test.

## Audit method
Enumerated 62 app.<method>('/api/admin/...') route registrations in server.ts and inspected gate usage. Earlier batches also added token revocation, paged audit evidence, Firestore profile counts and opportunistic audit replay. This is not a complete audit of non-admin paths, indirect service authorization, organisational routes, third-party calls or Firebase security rules.

## Outstanding critical gates
- **Run tests** in a real checkout: TypeScript, Vitest including admin-users.route.test.ts, Firebase Auth emulator, Firestore emulator, browser and accessibility checks. Existing test mocks do not simulate every revoked-token or partial failure condition.
- **Legacy role-less admin compatibility** remains intentionally broad. Inventory/migrate role-less accounts and remove this exception once verified.
- Remaining requireAdmin-only routes need a feature-by-feature read/write permission review. Do not mechanically replace them; some use downstream specialist guards.
- Role modification across Auth claims, Firestore admin_users and revocation is non-atomic. Test partial failures and interrupted requests before a release approval.
- Audit outbox shares Firestore availability; a complete outage still loses durable queued evidence. Alerts and an independent durable event path remain unimplemented.
- Verify that previously issued tokens fail after revocation on staging; ensure role downgrades and owner safeguards cannot be bypassed from other routes.
- Deploy the new Firestore audit composite index to staging before testing individual account audit histories.
- Verify audit metadata retention, log redaction, owner-only repair endpoints, and compliance evidence with an appropriate reviewer.
- Review Summary count and true Auth-account metrics separately.

## Release state
Draft PR #155 only. All commits use [skip ci]. No merge, deployment, GitHub Actions, emulator, live Firebase or automatic test run took place in this batch. Source-level checks passed; runtime security is unverified.
