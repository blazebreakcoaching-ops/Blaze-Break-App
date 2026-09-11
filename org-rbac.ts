// Pure logic for Blaze Break Enterprise's organisation-level RBAC, kept
// I/O-free and unit-tested - same pattern as org-risk-trend.ts and every
// other pure logic module in this codebase. server.ts is responsible for
// reading the actual member record from Firestore and handing the role
// here; nothing in this file talks to a database.
//
// This is a genuinely new layer, not a rename of the existing platform-
// staff role system (requireAdmin/requireRole/getPermissionsForRole in
// server.ts, which govern Blaze Break's OWN team managing the whole
// platform). These are roles a CUSTOMER organisation assigns to its own
// members to administer its own Blaze Break Enterprise account. The two
// systems are deliberately kept separate: a platform_admin has no implicit
// org-level permissions, and an org owner has no platform-level ones.

export const ORG_ROLES = [
  'owner',
  'admin',
  'billing_admin',
  'security_admin',
  'connector_admin',
  'member',
  'viewer',
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const isOrgRole = (value: unknown): value is OrgRole =>
  typeof value === 'string' && (ORG_ROLES as readonly string[]).includes(value);

export const ORG_PERMISSIONS = [
  'org.roles.manage',
  'org.billing.manage',
  'org.billing.view',
  'org.security.manage',
  'org.connectors.manage',
  'org.connectors.view',
  'org.sso.manage',
  'org.devices.manage',
  'org.devices.view',
  'org.search.query',
  'org.audit.read',
  'org.data_policy.manage',
  'org.data_policy.view',
] as const;

export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

// Every "view" permission a role holds implicitly grants the read half of
// whatever it can also manage, so this table only lists what each role
// gets ADDED beyond the base viewer set - built out below via composition
// rather than repeating the full list seven times.
const VIEW_ONLY: OrgPermission[] = [
  'org.billing.view',
  'org.connectors.view',
  'org.devices.view',
  'org.audit.read',
  'org.data_policy.view',
];

const ALL_PERMISSIONS: OrgPermission[] = [...ORG_PERMISSIONS];

export const ORG_ROLE_PERMISSIONS: Record<OrgRole, OrgPermission[]> = {
  // Sole role that can transfer/revoke ownership (enforced by the caller,
  // not by a permission string - see assertNotLastOrgOwner in server.ts).
  owner: ALL_PERMISSIONS,
  // Everything an owner can do operationally; only owner-transfer itself
  // is reserved. Deliberately the same permission set as owner - the
  // distinction lives in the "last owner" / "who can grant owner" checks
  // server.ts enforces on top of this table, not in a second, near-
  // identical permission list here.
  admin: ALL_PERMISSIONS,
  billing_admin: ['org.billing.manage', 'org.billing.view', 'org.audit.read'],
  security_admin: [
    'org.security.manage',
    'org.sso.manage',
    'org.roles.manage',
    'org.data_policy.manage',
    'org.data_policy.view',
    'org.audit.read',
  ],
  connector_admin: ['org.connectors.manage', 'org.connectors.view', 'org.audit.read'],
  // A normal org member: can use enterprise search (that's a product
  // feature, not an admin one) and see their own device status, nothing
  // administrative.
  member: ['org.search.query', 'org.devices.view'],
  // Read-only across the board, including search - a viewer is someone
  // who should be able to see the org's enterprise state (e.g. an
  // external auditor or a stakeholder) without being able to change any
  // of it.
  viewer: [...VIEW_ONLY, 'org.search.query'],
};

export const hasOrgPermission = (role: unknown, permission: OrgPermission): boolean => {
  if (!isOrgRole(role)) return false;
  return ORG_ROLE_PERMISSIONS[role].includes(permission);
};

export const hasAnyOrgPermission = (role: unknown, permissions: OrgPermission[]): boolean =>
  permissions.some((p) => hasOrgPermission(role, p));

// A linear rank for the roles that DO form a real hierarchy (owner > admin
// > the specialised admins, treated as equal rank to each other > member >
// viewer). Used only for "is this role at least as senior as that one"
// checks (e.g. the last-owner guard) - permission checks above are the
// correct tool for "can this role do X", since the specialised admin roles
// are lateral to each other, not ranked.
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  billing_admin: 2,
  security_admin: 2,
  connector_admin: 2,
  member: 1,
  viewer: 0,
};

export const isRoleAtLeast = (role: unknown, minRole: OrgRole): boolean =>
  isOrgRole(role) && ROLE_RANK[role] >= ROLE_RANK[minRole];

// Whether `actorRole` is allowed to assign `targetRole` to someone. Granting
// or revoking 'owner' or 'security_admin' is restricted to an existing
// owner - a security_admin could otherwise promote themselves to owner, or
// an admin could hand out security_admin (and from there, SSO control)
// without an owner ever approving it.
export const canAssignRole = (actorRole: unknown, targetRole: OrgRole): boolean => {
  if (!isOrgRole(actorRole)) return false;
  if (targetRole === 'owner' || targetRole === 'security_admin') {
    return actorRole === 'owner';
  }
  return hasOrgPermission(actorRole, 'org.roles.manage');
};
