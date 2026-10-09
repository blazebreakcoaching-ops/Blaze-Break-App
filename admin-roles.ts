// Pure, I/O-free single source of truth for Blaze Break's PLATFORM-STAFF
// admin role vocabulary - the people on Blaze Break's own team who operate
// the Platform Command Centre. This is deliberately separate from two
// other, unrelated role axes in this codebase:
//   - The end-user AuthRole union (src/types.ts) - individual/employee/
//     manager/organisation_admin/executive/etc - what a Blaze Break
//     CUSTOMER is, not what a Blaze Break staff member can administer.
//   - org-rbac.ts's ORG_ROLES - a customer organisation's own roles for
//     its own members (owner/admin/billing_admin/security_admin/...).
//     `security_admin` exists in both this list and ORG_ROLES, but means
//     a different thing in each - a platform security_admin has no
//     implicit org-level permissions, and an org security_admin has no
//     platform-level ones. Do not conflate them.
//
// Previously this list existed as three independently-maintained copies
// that had already drifted out of sync: the client admin-gate check in
// AdminDashboard.tsx (8 values), its ROLE_HIERARCHY dropdown (7 values -
// missing security_admin), and server.ts's ADMIN_PANEL_ROLES Zod enum
// (7 values - also missing security_admin). A role granted via one path
// could silently fail an authorization check written against a different
// copy of the list. This file is now the only place these roles are
// enumerated; everything else imports from here.

export const PLATFORM_ADMIN_ROLES = [
  'platform_owner',
  'platform_admin',
  'security_admin',
  'support_admin',
  'content_admin',
  'coach_admin',
  'b2b_admin',
  'viewer_admin',
] as const;

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export const isPlatformAdminRole = (value: unknown): value is PlatformAdminRole =>
  typeof value === 'string' && (PLATFORM_ADMIN_ROLES as readonly string[]).includes(value);

export const PLATFORM_ADMIN_ROLE_LABELS: Record<PlatformAdminRole, string> = {
  platform_owner: 'Platform Owner',
  platform_admin: 'Platform Admin',
  security_admin: 'Security Admin',
  support_admin: 'Support',
  content_admin: 'Content Admin',
  coach_admin: 'Coach Admin (Nova Core)',
  b2b_admin: 'B2B Admin (Org Insights)',
  viewer_admin: 'Auditor (Read-only)',
};

// The account(s) that can always reach Platform Owner, used before any
// custom claim or admin_users record exists yet - a chicken-and-egg
// problem (creating the very first admin needs an existing admin).
// Previously this was two independently hardcoded copies (server.ts's
// OWNER_BOOTSTRAP_EMAILS env-var default and App.tsx's isSuperAdminUser)
// that had already drifted out of sync once before. server.ts can still
// override this via the OWNER_BOOTSTRAP_EMAILS env var for ops
// flexibility; the client has no access to that env var at runtime and
// always uses this default list directly.
export const DEFAULT_OWNER_BOOTSTRAP_EMAILS = [
  'teampublication@gmail.com',
  'teampublication@googlemail.com',
] as const;

export const isOwnerBootstrapEmail = (
  email: string | null | undefined,
  allowlist: readonly string[] = DEFAULT_OWNER_BOOTSTRAP_EMAILS,
): boolean => {
  if (!email) return false;
  const lower = email.toLowerCase();
  return allowlist.some((e) => e.toLowerCase() === lower);
};

// The Evolution Engine (platform-governance control plane: feature
// registry, change proposals, protected core, Nova context brain
// governance, connector contracts) is deliberately narrower than every
// other platform-admin surface - it's "developer control plane" territory,
// not general admin work. Previously App.tsx re-typed this as two
// hardcoded strings ("platform_admin", "security_admin") directly in its
// own nav/route-guard arrays, missing platform_owner entirely and drifting
// independently from this file the same way the three now-unified
// admin-role copies did before admin-roles.ts existed. This is the one
// place both the client nav gate and any server-side route gate should
// import this list from. A future PR narrows this further with granular
// evolution_* permissions (evolution_view, protected_core_manage, etc.);
// until then, this coarse three-role list is the real boundary.
export const EVOLUTION_ENGINE_ROLES = [
  'platform_owner',
  'platform_admin',
  'security_admin',
] as const;

export type EvolutionEngineRole = (typeof EVOLUTION_ENGINE_ROLES)[number];

export const isEvolutionEngineRole = (value: unknown): value is EvolutionEngineRole =>
  typeof value === 'string' && (EVOLUTION_ENGINE_ROLES as readonly string[]).includes(value);
