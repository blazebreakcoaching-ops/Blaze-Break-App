import { describe, it, expect } from 'vitest';
import {
  ORG_ROLES,
  ORG_PERMISSIONS,
  ORG_ROLE_PERMISSIONS,
  isOrgRole,
  hasOrgPermission,
  hasAnyOrgPermission,
  isRoleAtLeast,
  canAssignRole,
} from './org-rbac';

describe('isOrgRole', () => {
  it('accepts every real role', () => {
    for (const r of ORG_ROLES) expect(isOrgRole(r)).toBe(true);
  });
  it('rejects a platform role, garbage, and non-string input', () => {
    expect(isOrgRole('platform_owner')).toBe(false);
    expect(isOrgRole('Owner')).toBe(false); // case-sensitive, no silent coercion
    expect(isOrgRole(undefined)).toBe(false);
    expect(isOrgRole(null)).toBe(false);
    expect(isOrgRole(42)).toBe(false);
  });
});

describe('hasOrgPermission', () => {
  it('owner and admin hold every real permission', () => {
    for (const p of ORG_PERMISSIONS) {
      expect(hasOrgPermission('owner', p)).toBe(true);
      expect(hasOrgPermission('admin', p)).toBe(true);
    }
  });

  it('billing_admin can manage billing but not connectors, sso, or roles', () => {
    expect(hasOrgPermission('billing_admin', 'org.billing.manage')).toBe(true);
    expect(hasOrgPermission('billing_admin', 'org.connectors.manage')).toBe(false);
    expect(hasOrgPermission('billing_admin', 'org.sso.manage')).toBe(false);
    expect(hasOrgPermission('billing_admin', 'org.roles.manage')).toBe(false);
  });

  it('security_admin can manage sso and roles but not billing or connectors', () => {
    expect(hasOrgPermission('security_admin', 'org.sso.manage')).toBe(true);
    expect(hasOrgPermission('security_admin', 'org.roles.manage')).toBe(true);
    expect(hasOrgPermission('security_admin', 'org.billing.manage')).toBe(false);
    expect(hasOrgPermission('security_admin', 'org.connectors.manage')).toBe(false);
  });

  it('connector_admin can manage connectors but not billing, sso, or roles', () => {
    expect(hasOrgPermission('connector_admin', 'org.connectors.manage')).toBe(true);
    expect(hasOrgPermission('connector_admin', 'org.billing.manage')).toBe(false);
    expect(hasOrgPermission('connector_admin', 'org.sso.manage')).toBe(false);
    expect(hasOrgPermission('connector_admin', 'org.roles.manage')).toBe(false);
  });

  it('member can search and view their own devices, nothing administrative', () => {
    expect(hasOrgPermission('member', 'org.search.query')).toBe(true);
    expect(hasOrgPermission('member', 'org.devices.view')).toBe(true);
    expect(hasOrgPermission('member', 'org.billing.view')).toBe(false);
    expect(hasOrgPermission('member', 'org.connectors.manage')).toBe(false);
    expect(hasOrgPermission('member', 'org.audit.read')).toBe(false);
  });

  it('viewer is read-only across the board, including search, but can never manage anything', () => {
    expect(hasOrgPermission('viewer', 'org.search.query')).toBe(true);
    expect(hasOrgPermission('viewer', 'org.billing.view')).toBe(true);
    expect(hasOrgPermission('viewer', 'org.connectors.view')).toBe(true);
    expect(hasOrgPermission('viewer', 'org.devices.view')).toBe(true);
    expect(hasOrgPermission('viewer', 'org.audit.read')).toBe(true);
    for (const p of ORG_PERMISSIONS) {
      if (p.endsWith('.manage')) expect(hasOrgPermission('viewer', p)).toBe(false);
    }
  });

  it('an unrecognised or malformed role holds no permissions - deny by default, never fail open', () => {
    for (const p of ORG_PERMISSIONS) {
      expect(hasOrgPermission('not_a_real_role', p)).toBe(false);
      expect(hasOrgPermission(undefined, p)).toBe(false);
      expect(hasOrgPermission(null, p)).toBe(false);
    }
  });

  it('every role in ORG_ROLE_PERMISSIONS is a real, declared role with no stray keys', () => {
    expect(Object.keys(ORG_ROLE_PERMISSIONS).sort()).toEqual([...ORG_ROLES].sort());
  });

  it('every permission granted to any role is a real, declared permission', () => {
    for (const role of ORG_ROLES) {
      for (const p of ORG_ROLE_PERMISSIONS[role]) {
        expect(ORG_PERMISSIONS).toContain(p);
      }
    }
  });
});

describe('hasAnyOrgPermission', () => {
  it('is true if the role holds at least one of the listed permissions', () => {
    expect(hasAnyOrgPermission('billing_admin', ['org.sso.manage', 'org.billing.manage'])).toBe(true);
  });
  it('is false if the role holds none of them', () => {
    expect(hasAnyOrgPermission('member', ['org.sso.manage', 'org.billing.manage'])).toBe(false);
  });
});

describe('isRoleAtLeast', () => {
  it('ranks owner > admin > the specialised admins (equal to each other) > member > viewer', () => {
    expect(isRoleAtLeast('owner', 'admin')).toBe(true);
    expect(isRoleAtLeast('admin', 'owner')).toBe(false);
    expect(isRoleAtLeast('admin', 'security_admin')).toBe(true);
    expect(isRoleAtLeast('security_admin', 'billing_admin')).toBe(true); // equal rank
    expect(isRoleAtLeast('billing_admin', 'security_admin')).toBe(true); // equal rank, both ways
    expect(isRoleAtLeast('member', 'security_admin')).toBe(false);
    expect(isRoleAtLeast('viewer', 'member')).toBe(false);
    expect(isRoleAtLeast('member', 'viewer')).toBe(true);
  });
  it('a role is always at least itself', () => {
    for (const r of ORG_ROLES) expect(isRoleAtLeast(r, r)).toBe(true);
  });
  it('an invalid role is never at least anything', () => {
    expect(isRoleAtLeast('bogus', 'viewer')).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('only an owner can grant or revoke the owner role', () => {
    expect(canAssignRole('owner', 'owner')).toBe(true);
    expect(canAssignRole('admin', 'owner')).toBe(false);
    expect(canAssignRole('security_admin', 'owner')).toBe(false);
  });

  it('only an owner can grant security_admin - an admin cannot hand out SSO control on their own', () => {
    expect(canAssignRole('owner', 'security_admin')).toBe(true);
    expect(canAssignRole('admin', 'security_admin')).toBe(false);
    expect(canAssignRole('security_admin', 'security_admin')).toBe(false); // can't self-replicate either
  });

  it('admin can assign the ordinary roles', () => {
    expect(canAssignRole('admin', 'billing_admin')).toBe(true);
    expect(canAssignRole('admin', 'connector_admin')).toBe(true);
    expect(canAssignRole('admin', 'member')).toBe(true);
    expect(canAssignRole('admin', 'viewer')).toBe(true);
  });

  it('a role with no org.roles.manage permission can never assign any role', () => {
    expect(canAssignRole('member', 'viewer')).toBe(false);
    expect(canAssignRole('viewer', 'viewer')).toBe(false);
    expect(canAssignRole('billing_admin', 'member')).toBe(false);
    expect(canAssignRole('connector_admin', 'member')).toBe(false);
  });

  it('an invalid actor role can never assign anything', () => {
    expect(canAssignRole('bogus', 'member')).toBe(false);
    expect(canAssignRole(undefined, 'member')).toBe(false);
  });
});
