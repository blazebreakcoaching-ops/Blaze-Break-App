# Enterprise organisation roles, RBAC, and audit logging

Part of the Blaze Break Enterprise backend foundation. This is the first of
several enterprise chunks (see the others' own docs in this directory) and
the one every later chunk depends on for access control and audit logging.

## What this is not

This is **not** the platform-staff role system (`platform_owner`,
`platform_admin`, `security_admin`, `support_admin`, `content_admin`,
`coach_admin`, `b2b_admin`, `viewer_admin` — see `requireAdmin`/`requireRole`
in `server.ts`). That system governs Blaze Break's own team managing the
whole platform. This document covers a separate, new layer: roles a
**customer organisation** assigns to its own members to administer its own
Enterprise account. A platform admin has no implicit org-level permissions
here, and an org owner has no platform-level ones.

## The seven roles

Defined in `org-rbac.ts` (`ORG_ROLES`), fully unit-tested in
`org-rbac.test.ts`:

| Role | Can do |
|---|---|
| `owner` | Everything. Sole role that can transfer/revoke ownership. |
| `admin` | Everything operational an owner can do, except granting/revoking `owner` or `security_admin`. |
| `billing_admin` | View/manage billing, read the org's audit log. |
| `security_admin` | Manage SSO, manage roles (except granting/revoking `owner` or `security_admin`), manage the data-use policy, read the audit log. |
| `connector_admin` | View/manage connectors, read the audit log. |
| `member` | Use enterprise search, view their own device status. The default role for anyone who joins via a join code. |
| `viewer` | Read-only across billing, connectors, devices, audit log, and search. Cannot manage anything. |

The full permission matrix (`ORG_ROLE_PERMISSIONS`) and the rules for who
can grant which role (`canAssignRole`) live in `org-rbac.ts` and are
exhaustively tested there — that file is the single source of truth, not
this document.

## How a member's role is resolved

`getOrgMemberRole` (server.ts) reads `organisations/{orgId}/members/{uid}`
first. If that subdocument doesn't exist — an org created, or a member who
joined, before this feature shipped — it falls back to the **legacy**
binary `organisations/{orgId}.adminUids`/`memberUids` arrays:
`adminUids` → resolves to `owner`, `memberUids` → resolves to `member`.

This means **every existing org and member keeps working with zero
migration.** The legacy `/make-admin` and `/revoke-admin` routes still work
exactly as before, and now also write the granular role (`admin`/`member`)
into the `members/` subcollection so the two systems never silently
diverge for an account that has both a legacy array entry and a granular
record.

## Enforcement

- `requireOrgRole(req, orgId, allowedRoles)` — the caller's role must be in
  the given list.
- `requireOrgPermission(req, orgId, permission)` — the caller's role must
  hold the given permission (`org-rbac.ts`'s `ORG_PERMISSIONS`). Prefer
  this for routes better expressed as "needs this capability" than "needs
  to be one of these specific roles."
- `requireOrgAdmin(req, orgId)` — kept for the ~19 existing call sites
  unchanged; now a thin wrapper around `requireOrgRole(..., ['owner',
  'admin'])`.
- `assertNotLastOrgOwner(db, orgId, targetUid)` — blocks demoting or
  removing an org's last remaining owner, mirroring
  `assertNotLastPlatformOwner`'s reasoning for the platform-wide system.

## Routes (all under `/api/org/:orgId/...`)

- `GET /members/roles` — list every member's granular role (`org.audit.read`).
- `POST /members/:memberUid/role` — change a member's role. Body:
  `{ role }`. Granting/revoking `owner` or `security_admin` requires the
  caller to already be `owner`. Blocked from ever leaving the org with
  zero owners.
- `POST /members/:memberUid/suspend` / `/reactivate` — `owner`/`admin`/
  `security_admin`.
- `GET /audit-logs?limit=` — this org's own audit trail, paginated
  (default 50, max 200).

## Audit logging

`logOrgAuditAction(req, orgId, action, targetResourceType,
targetResourceId, before, after)` writes to
`organisations/{orgId}/audit_logs` — **the org's own trail**, never the
platform-wide `admin_audit_logs` collection `logAdminAction` writes to. An
org's admins can read their org's history without any access to, or
visibility into, Blaze Break's platform-staff audit log.

Every entry: `actorUid`, `actorEmail`, `orgId`, `action`,
`targetResourceType`, `targetResourceId`, `before`, `after`, `createdAt`,
`ipAddress`, `userAgent`.

`before`/`after` **must stay structured field diffs** (e.g. `{ role:
'member' }` → `{ role: 'viewer' }'`) — never raw free-text content such as
a full document body or a chat message. This is enforced by convention in
every call site today; if a future feature needs to audit-log something
with real free-text content, redact or summarize it before passing it in
rather than logging it verbatim.

## Data lifecycle

`organisations/{orgId}/members/{uid}` and
`organisations/{orgId}/audit_logs/{id}` are both real Firestore
subcollections nested under the org, not top-level collections queried by
a `userId` field — so neither needs an entry in `user-data-collections.ts`
(the GDPR export/erasure guardrail only scans for the latter). Membership
records are deleted from `members/` whenever a person leaves an org
(`/api/org/leave`), is removed by an admin
(`/api/org/:orgId/members/:memberUid/remove`), or deletes their Blaze
Break account entirely — so a departed member's role record never outlives
their membership.

## Testing

- `org-rbac.test.ts` — the pure permission table and role-assignment
  rules, with no Firestore involved.
- `org-rbac.route.test.ts` — the security boundary at the route level:
  full RBAC matrix per role, cross-org tenant isolation, last-owner
  protection, audit log correctness, and legacy-fallback correctness for
  orgs/members that predate this feature.
