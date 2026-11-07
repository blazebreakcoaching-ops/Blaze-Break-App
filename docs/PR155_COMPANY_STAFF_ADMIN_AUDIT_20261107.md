# PR #155 — Company & Staff Administration Source Audit (7 November 2026)

Status: **NO-GO — source findings require fixes and end-to-end verification.**
Scope: Blaze Break platform AdminDashboard, customer OrgDashboard, admin organisation provisioning, join/invite/leave/member lifecycle, role and security boundaries, seat counting, and representative existing route tests.
Reviewed source head: `d8600f381ebaebedf4570bb158ab539dd1aac6b1` (PR #155 draft). This is a targeted source audit, **not** a complete 521-file review. No test suite, emulator, live email, browser, staging, or production tests ran in this review.

## Confirmed source issues (P0; address before company beta)

1. **Suspension does not revoke organisation permissions.** `server.ts` `getOrgMemberRole` reads the granular member role without checking `members/{uid}.status`, and `requireOrgRole`/`requireOrgPermission` depend on it. The suspend endpoint sets status='suspended' but the same role can continue authorising org API requests. Fix fail-closed status resolution; audit all org routes and direct access; add API/emulator tests proving suspended users lose access and regain it only on reactivation. Consider treatment of legacy records without a status and of suspended owners carefully.
2. **Join-by-code bypasses seat limits.** `POST /api/org/join` does not run `checkSeatLimit`, while `POST /api/org/:orgId/invite` does. A valid shared code can join additional members beyond `billing.seatCount`. Add atomic seat enforcement on join, including simultaneous joins, and avoid double-counting a pending invitation for the joining email.
3. **Member removal/leave leaves privileged assignment references behind.** `POST /api/org/leave` and `POST /api/org/:orgId/members/:memberUid/remove` clean member lists and role docs, but do not remove the UID from `org.teamManagers` and `org.hrViewerUids` (nor fully reconcile membership/team-derived indexes). A former employee rejoining with the same UID could inherit manager/HR visibility unexpectedly. Clean all assignment references atomically and add remove/leave/rejoin tests.
4. **Platform provisioning can reassign an already enrolled user.** `POST /api/admin/orgs` looks up `initialAdminEmail` and overwrites `users/{uid}.organisationId` without checking existing org membership, while leaving the old org's `memberUids`/role records intact. Reject reassignment or implement an explicitly audited transfer transaction; cover two-company cases.
5. **Invite cancellation is not access revocation.** `POST /api/org/:orgId/invites/:email/cancel` deletes a pending invitation, but joining uses a shared `joinCode` alone and does not consult invitation records. Therefore a previously emailed code remains usable after cancelling that email invitation. Either clearly label cancellation as only stopping a pending reminder or use per-invite revocable tokens; for a secure invitation-based flow, validate cancellation at redemption.

## Additional source concerns (P1)

- Platform `POST /api/admin/orgs` only validates `orgId`; its `name` and `privacyThreshold` are not validated to the standard applied by `POST /api/org/:orgId/settings`. Validate trim/length and finite integer 3–100 before writes.
- Platform `AdminDashboard` currently provisions companies and displays a company/member listing; actual invitations, member roles, team designations and removals live in the **customer OrgDashboard**. Check that the first real assigned org owner can access that UI and that the intended platform-support workflow is clearly documented.
- `OrgDashboard` uses a 6-character shared join code and invite email delivery via Brevo; require real delivery, repeat/duplicate, cancellation and wrong-org tests. Avoid calling email delivery successful because a pending invitation was stored.
- Company feature areas beyond basic provisioning also include billing/seat management, SSO, connectors, devices, HR/team dashboards, audits and data policy; existing tests are present but have not been executed at this candidate SHA.

## Existing test coverage present in repository (not executed)

`admin-orgs.route.test.ts`, `org-me.route.test.ts`, `org-members.route.test.ts`, `org-billing.route.test.ts`, `org-rbac.route.test.ts`, `org-team-management.route.test.ts`, `admin-permission-enforcement.route.test.ts` and others. Test files demonstrate intent, not a passing current release.

## Company acceptance sequence (must run with staging test accounts only)

1. Platform admin creates a valid company; verifies a first owner and read-only support visibility. Reject invalid company fields and cross-company reassignment.
2. Owner signs in and opens customer organisation dashboard; updates basic settings; invites 1, 2, 50 and repeated emails, checks actual delivery and pending counts.
3. Employee joins via code/invite; verify wrong/expired/cancelled invite behaviour, seat limits, duplicate accounts and concurrent joins; ensure two companies stay isolated.
4. Owner assigns member/admin/security_admin, team manager and HR viewer; verify all role boundaries and privacy thresholds. Confirm neither employer nor platform admin can access individual wellbeing/chat.
5. Suspend a member; verify **all** org endpoints and sensitive aggregations reject them. Reactivate and verify restoration.
6. Remove or let employee leave; check member docs, user link, devices, team management and HR viewer lists, and rejoin without privilege inheritance.
7. Check billing plan, seat count, failed email, Firestore outage, MFA/App Check, duplicate requests, audit log, mobile form usability and rollback.
8. Run current-head offline tests, Firebase Auth/Firestore emulator and browser tests. Record test command, SHA, logs and failures. Repeat after fixes. No GitHub Actions, production merge or deploy without owner approval.

Owner action required now: **none**. Code risk remediation and staging validation remain the engineering priority.
