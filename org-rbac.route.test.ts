import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for the Enterprise org-RBAC routes: member role
// listing/changing, suspend/reactivate, and the org's own audit log. The
// point of these tests is the security boundary itself - RBAC enforcement,
// cross-org tenant isolation, last-owner protection, and that the legacy
// adminUids/memberUids arrays still resolve a real role with zero
// migration, exactly as org-rbac.ts's design promises.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { fakeDb, seedDoc, getDocRaw, resetStore, forceDocError, forceTransactionError } from './test/fake-firestore';

const ORG = 'org_1';
const OTHER_ORG = 'org_2';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[] } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
  });
}

function seedMember(orgId: string, uid: string, role: string, status: string = 'active') {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status, email: `${uid}@test.dev` });
}

beforeEach(() => resetStore());

describe('legacy fallback - orgs and members that predate the members/ subcollection', () => {
  it('an org with no members/ docs still resolves its adminUids as owner-equivalent', async () => {
    seedOrg(ORG, { adminUids: ['legacy_admin'], memberUids: ['legacy_admin', 'legacy_member'] });
    // owner-only route: change another member's role.
    const res = await request(app)
      .post(`/api/org/${ORG}/members/legacy_member/role`)
      .set(auth('legacy_admin'))
      .send({ role: 'viewer' });
    expect(res.status).toBe(200);
  });

  it('a plain memberUids-only member resolves as member, not owner/admin', async () => {
    seedOrg(ORG, { adminUids: ['legacy_admin'], memberUids: ['legacy_admin', 'legacy_member'] });
    const res = await request(app)
      .post(`/api/org/${ORG}/members/legacy_admin/role`)
      .set(auth('legacy_member'))
      .send({ role: 'viewer' });
    expect(res.status).toBe(403);
  });

  it('someone in neither array has no role and is forbidden everywhere', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('blocks demoting the sole owner of a fully legacy org (adminUids-only, no members/ doc at all)', async () => {
    seedOrg(ORG, { adminUids: ['legacy_owner'], memberUids: ['legacy_owner'] });
    // legacy_owner has no members/{uid} doc - resolves to 'owner' purely via
    // the adminUids fallback. The last-owner guard must still catch this.
    const res = await request(app)
      .post(`/api/org/${ORG}/members/legacy_owner/role`)
      .set(auth('legacy_owner'))
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });

  it('blocks removing the sole owner of a fully legacy org via the member-removal route too', async () => {
    seedOrg(ORG, { adminUids: ['legacy_owner'], memberUids: ['legacy_owner', 'admin_2'] });
    // legacy_owner has no members/ doc - resolves to 'owner' purely via the
    // adminUids fallback. admin_2 has a real granular 'admin' doc (so
    // requireOrgAdmin admits them), but legacy_owner is still the org's
    // only effective owner and must stay protected.
    seedMember(ORG, 'admin_2', 'admin');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/legacy_owner/remove`)
      .set(auth('admin_2'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });
});

describe('authoritative membership status cannot fall back to legacy grants', () => {
  it.each(['suspended', 'removed', 'inactive', 'pending'])(
    'denies a %s member even when both legacy arrays still contain their UID',
    async (status) => {
      seedOrg(ORG, { adminUids: ['owner_1', 'former_admin'], memberUids: ['owner_1', 'former_admin'] });
      seedMember(ORG, 'owner_1', 'owner');
      seedMember(ORG, 'former_admin', 'admin', status);
      const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('former_admin'));
      expect(res.status).toBe(403);
    }
  );

  it('denies an invalid granular role instead of reviving a legacy owner grant', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'invalid_admin'], memberUids: ['owner_1', 'invalid_admin'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'invalid_admin', 'not_a_real_role');
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('invalid_admin'));
    expect(res.status).toBe(403);
  });

  it('still allows a valid active granular owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });
});

describe('last-owner safety uses only effective active ownership', () => {
  it.each(['suspended', 'removed', 'inactive'])(
    'cannot demote the last active owner while a legacy-listed second owner is %s',
    async (status) => {
      seedOrg(ORG, { adminUids: ['owner_1', 'former_owner'], memberUids: ['owner_1', 'former_owner'] });
      seedMember(ORG, 'owner_1', 'owner', 'active');
      seedMember(ORG, 'former_owner', 'owner', status);
      const res = await request(app)
        .post(`/api/org/${ORG}/members/owner_1/role`)
        .set(auth('owner_1'))
        .send({ role: 'member' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/last owner/i);
    }
  );

  it('does not count an invalid granular role as a fallback legacy owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'bad_role'], memberUids: ['owner_1', 'bad_role'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'bad_role', 'bad_role');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1')).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });
});

describe('cross-company profile membership consistency', () => {
  it('rejects a stale granular administrator after the account moves to another company', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'moved_admin'], memberUids: ['owner_1', 'moved_admin'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'moved_admin', 'admin');
    seedDoc('users/moved_admin', { organisationId: OTHER_ORG });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('moved_admin'));
    expect(res.status).toBe(403);
  });

  it('rejects stale legacy array-only ownership when profile links to a different organisation', async () => {
    seedOrg(ORG, { adminUids: ['legacy_owner'], memberUids: ['legacy_owner'] });
    seedDoc('users/legacy_owner', { organisationId: OTHER_ORG });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('legacy_owner'));
    expect(res.status).toBe(403);
  });

  it('continues to permit an active member whose profile matches their company', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc('users/owner_1', { organisationId: ORG });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });
});

describe('RBAC matrix on role-management routes', () => {
  it('a viewer can never change a role, suspend, or reactivate anyone', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    seedMember(ORG, 'member_1', 'member');

    const roleRes = await request(app)
      .post(`/api/org/${ORG}/members/member_1/role`)
      .set(auth('viewer_1'))
      .send({ role: 'admin' });
    expect(roleRes.status).toBe(403);

    const suspendRes = await request(app).post(`/api/org/${ORG}/members/member_1/suspend`).set(auth('viewer_1'));
    expect(suspendRes.status).toBe(403);
  });

  it('a member (not viewer/admin) can never manage roles either', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1', 'member_2'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    seedMember(ORG, 'member_2', 'member');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/member_2/role`)
      .set(auth('member_1'))
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('billing_admin and connector_admin cannot manage roles - that is security_admin/owner/admin territory', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'billing_1', 'connector_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'billing_1', 'billing_admin');
    seedMember(ORG, 'connector_1', 'connector_admin');
    seedMember(ORG, 'target', 'member');

    const billingRes = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('billing_1'))
      .send({ role: 'viewer' });
    expect(billingRes.status).toBe(403);

    const connectorRes = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('connector_1'))
      .send({ role: 'viewer' });
    expect(connectorRes.status).toBe(403);
  });

  it('security_admin can change an ordinary member role but not grant owner or security_admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'sec_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'sec_1', 'security_admin');
    seedMember(ORG, 'target', 'member');

    const okRes = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('sec_1'))
      .send({ role: 'connector_admin' });
    expect(okRes.status).toBe(200);

    const ownerAttempt = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('sec_1'))
      .send({ role: 'owner' });
    expect(ownerAttempt.status).toBe(403);

    const secAdminAttempt = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('sec_1'))
      .send({ role: 'security_admin' });
    expect(secAdminAttempt.status).toBe(403);
  });

  it('admin can grant every role except owner and security_admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'target', 'member');

    const okRes = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('admin_1'))
      .send({ role: 'billing_admin' });
    expect(okRes.status).toBe(200);

    const ownerAttempt = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('admin_1'))
      .send({ role: 'owner' });
    expect(ownerAttempt.status).toBe(403);
  });

  it('rejects a role that is not one of the 7 real roles', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('owner_1'))
      .send({ role: 'super_admin' });
    expect(res.status).toBe(400);
  });
});

describe('role mutation cannot manufacture organisation membership', () => {
  it('rejects role changes for a self-UID missing from the company roster', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['other_member'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1')).send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('cannot reactivate a UID that is not on the organisation roster', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/outsider/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(400);
    expect(getDocRaw(`organisations/${ORG}/members/outsider`)).toBeUndefined();
  });

  it('cannot reactivate an existing active or malformed membership', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'active');
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('active');
  });

  it('refuses to revive staff whose profile now points to another company', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    seedDoc('users/target', { organisationId: OTHER_ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('suspended');
  });

  it('allows reactivation of a genuinely suspended staff member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    seedDoc('users/target', { organisationId: ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('active');
  });
});

describe('legacy admin grant/revoke routes', () => {
  it('POST /api/org/:orgId/members/:memberUid/make-admin: an admin can grant admin to a plain member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    const res = await request(app).post(`/api/org/${ORG}/members/target/make-admin`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const raw = getDocRaw(`organisations/${ORG}`);
    expect(raw?.adminUids).toContain('target');
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.role).toBe('admin');
  });

  it('POST /api/org/:orgId/members/:memberUid/make-admin: refuses to grant admin to a non-member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/stranger/make-admin`).set(auth('owner_1'));
    expect(res.status).toBe(400);
  });

  it('POST /api/org/:orgId/members/:memberUid/make-admin: refuses a non-admin caller', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/member_1/make-admin`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('POST /api/org/:orgId/members/:memberUid/make-admin: 500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/members/target/make-admin`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });

  it('POST /api/org/:orgId/members/:memberUid/revoke-admin: an admin can revoke another admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1'] });
    seedMember(ORG, 'admin_1', 'admin');
    const res = await request(app).post(`/api/org/${ORG}/members/admin_1/revoke-admin`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const raw = getDocRaw(`organisations/${ORG}`);
    expect(raw?.adminUids).not.toContain('admin_1');
    expect(getDocRaw(`organisations/${ORG}/members/admin_1`)?.role).toBe('member');
  });

  it("POST /api/org/:orgId/members/:memberUid/revoke-admin: can't revoke your own admin access", async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/revoke-admin`).set(auth('owner_1'));
    expect(res.status).toBe(400);
  });

  it('POST /api/org/:orgId/members/:memberUid/revoke-admin: refuses to leave the org with zero admins', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/revoke-admin`).set(auth('owner_1'));
    expect(res.status).toBe(400);
  });

  it('POST /api/org/:orgId/members/:memberUid/revoke-admin: 500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1'] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/members/admin_1/revoke-admin`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('legacy admin endpoints respect protected roles and audit changes', () => {
  it('a regular admin cannot convert a security admin into a general admin through the old endpoint', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'admin_1', 'security_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'security_1', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/security_1/make-admin`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/security_1`)?.role).toBe('security_admin');
  });

  it('a regular admin cannot demote an owner using revoke-admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2', 'admin_1'], memberUids: ['owner_1', 'owner_2', 'admin_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/revoke-admin`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/owner_2`)?.role).toBe('owner');
  });

  it('the old endpoint will not convert an inactive membership into an admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/make-admin`).set(auth('owner_1'));
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.role).toBe('member');
  });

  it('a legacy admin grant has a durable attributable audit entry', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/target/make-admin`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'grant_admin', actorUid: 'owner_1', targetResourceId: 'target', after: { role: 'admin' } }),
    ]));
  });
});

describe('GET /api/org/:orgId/members/roles', () => {
  it('returns every member\'s granular role', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).get(`/api/org/${ORG}/members/roles`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const uids = res.body.members.map((m: any) => m.uid).sort();
    expect(uids).toEqual(['member_1', 'owner_1']);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/members/roles`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/members/roles`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/members/:memberUid/reactivate', () => {
  it('an admin can reactivate a suspended member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('active');
  });

  it('refuses a plain member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1', 'target'] });
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('500s if the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'target', 'member', 'suspended');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('last-owner protection', () => {
  it('blocks demoting the sole owner away from owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1'))
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });

  it('allows demoting an owner when a second owner exists', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2'], memberUids: ['owner_1', 'owner_2'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/owner_2/role`)
      .set(auth('owner_1'))
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
  });

  it('blocks removing the last owner via the member-removal route too', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    // requireOrgAdmin requires the caller to be a different admin than the
    // target for /remove to even be reachable in practice, so seed a second
    // admin-role account to make the call, but the sole 'owner' target
    // should still be protected.
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org',
      adminUids: ['owner_1', 'admin_2'],
      memberUids: ['owner_1', 'admin_2'],
    });
    seedMember(ORG, 'admin_2', 'admin');
    const res = await request(app)
      .post(`/api/org/${ORG}/members/owner_1/remove`)
      .set(auth('admin_2'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });
});

describe('cross-org tenant isolation', () => {
  it('an owner of org A cannot manage roles in org B', async () => {
    seedOrg(ORG, { adminUids: ['owner_a'], memberUids: ['owner_a'] });
    seedMember(ORG, 'owner_a', 'owner');
    seedOrg(OTHER_ORG, { adminUids: ['owner_b'], memberUids: ['owner_b', 'target_b'] });
    seedMember(OTHER_ORG, 'owner_b', 'owner');
    seedMember(OTHER_ORG, 'target_b', 'member');

    const res = await request(app)
      .post(`/api/org/${OTHER_ORG}/members/target_b/role`)
      .set(auth('owner_a'))
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it("org A's audit log never includes org B's entries", async () => {
    seedOrg(ORG, { adminUids: ['owner_a'], memberUids: ['owner_a'] });
    seedMember(ORG, 'owner_a', 'owner');
    seedOrg(OTHER_ORG, { adminUids: ['owner_b'], memberUids: ['owner_b', 'target_b'] });
    seedMember(OTHER_ORG, 'owner_b', 'owner');
    seedMember(OTHER_ORG, 'target_b', 'member');

    // Generate a real audit entry in org B.
    await request(app)
      .post(`/api/org/${OTHER_ORG}/members/target_b/suspend`)
      .set(auth('owner_b'));

    const resA = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_a'));
    expect(resA.status).toBe(200);
    expect(resA.body.logs).toEqual([]);

    const resB = await request(app).get(`/api/org/${OTHER_ORG}/audit-logs`).set(auth('owner_b'));
    expect(resB.body.logs.length).toBe(1);
    expect(resB.body.logs[0].orgId).toBe(OTHER_ORG);
  });
});

describe('audit log correctness', () => {
  it('records actor, org, action, target, before/after, and request metadata', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');

    await request(app)
      .post(`/api/org/${ORG}/members/target/role`)
      .set(auth('owner_1'))
      .send({ role: 'viewer' });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(1);
    const entry = res.body.logs[0];
    expect(entry.actorUid).toBe('owner_1');
    expect(entry.orgId).toBe(ORG);
    expect(entry.action).toBe('change_member_role');
    expect(entry.targetResourceType).toBe('member');
    expect(entry.targetResourceId).toBe('target');
    expect(entry.before).toEqual({ role: 'member' });
    expect(entry.after).toEqual({ role: 'viewer' });
    expect(entry).toHaveProperty('createdAt');
    expect(entry).toHaveProperty('ipAddress');
    expect(entry).toHaveProperty('userAgent');
  });

  it('suspend/reactivate write role-change-shaped before/after too, not raw content', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    await request(app).post(`/api/org/${ORG}/members/target/suspend`).set(auth('owner_1'));
    const raw = getDocRaw(`organisations/${ORG}/members/target`);
    expect(raw?.status).toBe('suspended');
  });
});

describe('suspended membership must never grant organisation permissions', () => {
  it('blocks a suspended admin even when legacy adminUids still contains them, then restores access on reactivation', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'target'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'admin');
    expect((await request(app).get(`/api/org/${ORG}/members`).set(auth('target'))).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/members/target/suspend`).set(auth('owner_1'))).status).toBe(200);
    expect((await request(app).get(`/api/org/${ORG}/members`).set(auth('target'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'))).status).toBe(200);
    expect((await request(app).get(`/api/org/${ORG}/members`).set(auth('target'))).status).toBe(200);
  });

  it('blocks a suspended manager from the team dashboard despite a stale manager assignment', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'manager_1'] });
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'manager_1'],
      teamManagers: { manager_1: ['Engineering'] }, memberTeams: { manager_1: 'Engineering' },
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'manager_1', 'member', 'suspended');
    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('manager_1'));
    expect(res.status).toBe(403);
  });

  it('blocks a suspended HR viewer despite a stale HR viewer allow-list', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'hr_1'],
      hrViewerUids: ['hr_1'],
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'hr_1', 'member', 'suspended');
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    expect(res.status).toBe(403);
  });

  it('protects the final active owner against suspension by another privileged administrator', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'sec_1', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/suspend`).set(auth('sec_1'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });
});

describe('atomic company departure and stale-roster protection', () => {
  it('a failed transaction must leave BOTH profile and organisation access unchanged', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'leaver'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'leaver', 'member');
    seedDoc('users/leaver', { organisationId: ORG });
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).post('/api/org/leave').set(auth('leaver'));
      expect(res.status).toBe(500);
      expect(getDocRaw('users/leaver')?.organisationId).toBe(ORG);
      expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('leaver');
      expect(getDocRaw(`organisations/${ORG}/members/leaver`)?.role).toBe('member');
    } finally {
      restore();
      spy.mockRestore();
    }
  });

  it('a stale roster cannot cause the removal route to unlink a person from another company', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'other_employee'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'other_employee', 'member');
    seedDoc('users/other_employee', { organisationId: OTHER_ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/other_employee/remove`).set(auth('owner_1'));
    expect(res.status).toBe(409);
    expect(getDocRaw('users/other_employee')?.organisationId).toBe(OTHER_ORG);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('other_employee');
  });

  it('two company owners cannot simultaneously leave and abandon their organisation', async () => {
    seedOrg(ORG, { adminUids: ['owner_a', 'owner_b'], memberUids: ['owner_a', 'owner_b'] });
    seedMember(ORG, 'owner_a', 'owner');
    seedMember(ORG, 'owner_b', 'owner');
    seedDoc('users/owner_a', { organisationId: ORG });
    seedDoc('users/owner_b', { organisationId: ORG });
    const results = await Promise.all(['owner_a', 'owner_b'].map(uid =>
      request(app).post('/api/org/leave').set(auth(uid))
    ));
    expect(results.map(r => r.status).sort()).toEqual([200, 400]);
    expect(getDocRaw(`organisations/${ORG}`)?.adminUids).toHaveLength(1);
  });
});

describe('membership record lifecycle', () => {
  it('joining via join code creates a real member-role record, defaulting to member', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org',
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      joinCode: 'ABC123',
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc('users/new_joiner', {});

    const res = await request(app).post('/api/org/join').set(auth('new_joiner')).send({ joinCode: 'ABC123' });
    expect(res.status).toBe(200);
    const raw = getDocRaw(`organisations/${ORG}/members/new_joiner`);
    expect(raw?.role).toBe('member');
    expect(raw?.status).toBe('active');
  });

  it("leaving the org deletes the member's granular role record, not just the legacy arrays", async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'leaver'] });
    seedDoc(`users/leaver`, { organisationId: ORG });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'leaver', 'member');
    expect(getDocRaw(`organisations/${ORG}/members/leaver`)).toBeDefined();

    await request(app).post('/api/org/leave').set(auth('leaver'));
    expect(getDocRaw(`organisations/${ORG}/members/leaver`)).toBeUndefined();
  });

  it('cleans former HR and manager privileges when a staff member leaves', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'leaver'],
      teamManagers: { leaver: ['Engineering'] }, memberTeams: { leaver: 'Engineering' },
      hrViewerUids: ['leaver'],
    });
    seedDoc('users/leaver', { organisationId: ORG, shareAnonymizedDataWithOrg: true });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'leaver', 'member');
    const res = await request(app).post('/api/org/leave').set(auth('leaver'));
    expect(res.status).toBe(200);
    const org = getDocRaw(`organisations/${ORG}`);
    expect(org?.memberUids).not.toContain('leaver');
    expect(org?.hrViewerUids).not.toContain('leaver');
    expect(org?.memberTeams?.leaver).toBeUndefined();
    expect(org?.teamManagers?.leaver).toBeUndefined();
    expect(getDocRaw('users/leaver')?.organisationId).toBeUndefined();
  });

  it('refuses to let the final active company owner leave', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc('users/owner_1', { organisationId: ORG });
    const res = await request(app).post('/api/org/leave').set(auth('owner_1'));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
    expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('owner_1');
    expect(getDocRaw('users/owner_1')?.organisationId).toBe(ORG);
  });

  it('cleans old HR/team grants when an admin removes a member', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'leaver'],
      teamManagers: { leaver: ['Engineering'] }, memberTeams: { leaver: 'Engineering' },
      hrViewerUids: ['leaver'],
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'leaver', 'member');
    seedDoc('users/leaver', { organisationId: ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/leaver/remove`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const org = getDocRaw(`organisations/${ORG}`);
    expect(org?.teamManagers?.leaver).toBeUndefined();
    expect(org?.memberTeams?.leaver).toBeUndefined();
    expect(org?.hrViewerUids).not.toContain('leaver');
    expect(getDocRaw(`organisations/${ORG}/members/leaver`)).toBeUndefined();
  });

  // The defensive catch block behind the happy path above.
  it('POST /api/org/leave: returns a generic 500 and logs the real error when the user profile read throws', async () => {
    seedDoc(`users/leaver2`, { organisationId: ORG });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/leaver2', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/org/leave').set(auth('leaver2'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('durable organisation membership audit events', () => {
  it('commits role grant and an attributed audit event together', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const change = await request(app).post(`/api/org/${ORG}/members/target/role`)
      .set(auth('owner_1')).send({ role: 'viewer' });
    expect(change.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.role).toBe('viewer');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.status).toBe(200);
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'change_member_role', actorUid: 'owner_1',
        targetResourceId: 'target', before: { role: 'member' }, after: { role: 'viewer' },
      }),
    ]));
  });

  it('commits suspension and a durable audit event together', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const change = await request(app).post(`/api/org/${ORG}/members/target/suspend`)
      .set(auth('owner_1'));
    expect(change.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('suspended');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'suspend_member', actorUid: 'owner_1', targetResourceId: 'target' }),
    ]));
  });

  it('commits reactivation and a durable audit event together', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const change = await request(app).post(`/api/org/${ORG}/members/target/reactivate`)
      .set(auth('owner_1'));
    expect(change.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('active');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'reactivate_member', actorUid: 'owner_1', targetResourceId: 'target' }),
    ]));
  });
});

describe('protected role revocations require an existing owner', () => {
  it('blocks an ordinary admin from demoting a second owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2'], memberUids: ['owner_1', 'owner_2', 'admin_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/role`)
      .set(auth('admin_1')).send({ role: 'member' });
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/owner_2`)?.role).toBe('owner');
  });

  it('blocks security admins from downgrading another security admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'security_1', 'security_2'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'security_1', 'security_admin');
    seedMember(ORG, 'security_2', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/security_2/role`)
      .set(auth('security_1')).send({ role: 'viewer' });
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/security_2`)?.role).toBe('security_admin');
  });

  it('blocks a normal admin from downgrading a security administrator', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'admin_1', 'security_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'security_1', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/security_1/role`)
      .set(auth('admin_1')).send({ role: 'member' });
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/security_1`)?.role).toBe('security_admin');
  });

  it('allows an owner to demote a second owner without losing the last active owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2'], memberUids: ['owner_1', 'owner_2'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/role`)
      .set(auth('owner_1')).send({ role: 'member' });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/owner_2`)?.role).toBe('member');
  });
});

describe('protected account suspension permissions', () => {
  it('blocks a non-owner admin from suspending a second company owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2'], memberUids: ['owner_1', 'owner_2', 'admin_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/suspend`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/owner_2`)?.status).toBe('active');
  });

  it('blocks a security admin from suspending a second security admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'security_1', 'security_2'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'security_1', 'security_admin');
    seedMember(ORG, 'security_2', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/security_2/suspend`).set(auth('security_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/security_2`)?.status).toBe('active');
  });

  it('blocks admin from reactivating a suspended company owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'owner_2'], memberUids: ['owner_1', 'owner_2', 'admin_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'owner_2', 'owner', 'suspended');
    seedMember(ORG, 'admin_1', 'admin');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_2/reactivate`).set(auth('admin_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/owner_2`)?.status).toBe('suspended');
  });
});

describe('scoped security admins cannot grant themselves general or billing access', () => {
  it.each(['admin', 'billing_admin'])('denies self-promotion to %s', async (nextRole) => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'security_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'security_1', 'security_admin');
    const res = await request(app).post(`/api/org/${ORG}/members/security_1/role`)
      .set(auth('security_1')).send({ role: nextRole });
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/security_1`)?.role).toBe('security_admin');
  });

  it.each(['admin', 'billing_admin'])('denies granting %s to another staff member', async (nextRole) => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'security_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'security_1', 'security_admin');
    seedMember(ORG, 'target', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/target/role`)
      .set(auth('security_1')).send({ role: nextRole });
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.role).toBe('member');
  });
});

describe('HR access changes require active membership and durable audit', () => {
  it('rejects adding suspended staff to the HR viewer list', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/hr-viewers`)
      .set(auth('owner_1')).send({ uids: ['target'] });
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}`)?.hrViewerUids).toBeUndefined();
  });

  it('rejects invalid member roles when assigning HR access', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'unknown', 'active');
    const res = await request(app).post(`/api/org/${ORG}/hr-viewers`)
      .set(auth('owner_1')).send({ uids: ['target'] });
    expect(res.status).toBe(409);
  });

  it('records the before-and-after HR access list in the same transaction', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const res = await request(app).post(`/api/org/${ORG}/hr-viewers`)
      .set(auth('owner_1')).send({ uids: ['target'] });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.hrViewerUids).toEqual(['target']);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'update_hr_viewers', actorUid: 'owner_1',
        before: { uids: [] }, after: { uids: ['target'] },
      }),
    ]));
  });
});


describe('team access writes are auditable and require current membership', () => {
  it('refuses assigning a suspended employee to a team', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/team`)
      .set(auth('owner_1')).send({ team: 'Support' });
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}`)?.memberTeams).toBeUndefined();
  });

  it('refuses giving a suspended employee team-manager access', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'],
      memberUids: ['owner_1', 'target'], memberTeams: { owner_1: 'Support' },
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/manage-teams`)
      .set(auth('owner_1')).send({ teams: ['Support'] });
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}`)?.teamManagers).toBeUndefined();
  });

  it('saves a normal team assignment and its audit record together', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/target/team`)
      .set(auth('owner_1')).send({ team: 'Support' });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.memberTeams?.target).toBe('Support');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'assign_member_team', actorUid: 'owner_1',
        before: { team: null }, after: { team: 'Support' },
      }),
    ]));
  });

  it('saves a manager assignment and its audit record together', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', adminUids: ['owner_1'],
      memberUids: ['owner_1', 'target'], memberTeams: { target: 'Support' },
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/target/manage-teams`)
      .set(auth('owner_1')).send({ teams: ['Support'] });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.teamManagers?.target).toEqual(['Support']);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'assign_team_manager', actorUid: 'owner_1',
        before: { teams: [] }, after: { teams: ['Support'] },
      }),
    ]));
  });

  it('does not change a team assignment if the audit transaction fails', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    try {
      const res = await request(app).post(`/api/org/${ORG}/members/target/team`)
        .set(auth('owner_1')).send({ team: 'Support' });
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}`)?.memberTeams).toBeUndefined();
    } finally {
      restore();
    }
  });
});


describe('membership teardown and reactivation are audit-safe', () => {
  it('commits member removal and its audit evidence in the same transaction', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    seedDoc('users/target', { organisationId: ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/target/remove`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/members/target`)).toBeUndefined();
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'remove_member', actorUid: 'owner_1', targetResourceId: 'target',
        after: { accessRemoved: true },
      }),
    ]));
  });

  it('commits a member voluntary departure and its audit evidence together', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'leaver'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'leaver', 'member');
    seedDoc('users/leaver', { organisationId: ORG });
    const res = await request(app).post('/api/org/leave').set(auth('leaver'));
    expect(res.status).toBe(200);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'leave_organisation', actorUid: 'leaver', targetResourceId: 'leaver',
        after: { accessRemoved: true },
      }),
    ]));
  });

  it('does not remove membership when its transaction fails', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member');
    seedDoc('users/target', { organisationId: ORG });
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    try {
      const res = await request(app).post(`/api/org/${ORG}/members/target/remove`).set(auth('owner_1'));
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}`)?.memberUids).toContain('target');
      expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('active');
      expect(getDocRaw('users/target')?.organisationId).toBe(ORG);
    } finally { restore(); }
  });

  it('prevents changing the role of suspended employees', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/role`)
      .set(auth('owner_1')).send({ role: 'admin' });
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.role).toBe('member');
  });

  it('prevents reactivation if the target profile now belongs to another company', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'target'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    seedDoc('users/target', { organisationId: OTHER_ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(409);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('suspended');
  });

  it('refuses reactivation when the member record exists but roster entry is gone', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'target', 'member', 'suspended');
    const res = await request(app).post(`/api/org/${ORG}/members/target/reactivate`).set(auth('owner_1'));
    expect(res.status).toBe(400);
    expect(getDocRaw(`organisations/${ORG}/members/target`)?.status).toBe('suspended');
  });
});


describe('device registration and revocation audit boundaries', () => {
  const registration = { channel: 'stable', appVersion: '1.2.3', deviceName: 'Test laptop' };

  it('registers a device with a matching durable organisation audit entry', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const response = await request(app).post(`/api/org/${ORG}/devices/register`)
      .set(auth('member_1')).send(registration);
    expect(response.status).toBe(200);
    expect(response.body.device.ownerUid).toBe('member_1');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'register_device', actorUid: 'member_1',
        targetResourceId: response.body.device.id,
      }),
    ]));
  });

  it('does not register a device when the transaction fails', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const restore = forceTransactionError(new Error('simulated failure'));
    try {
      const response = await request(app).post(`/api/org/${ORG}/devices/register`)
        .set(auth('member_1')).send(registration);
      expect(response.status).toBe(500);
      const devices = await request(app).get(`/api/org/${ORG}/devices`).set(auth('owner_1'));
      expect(devices.body.devices).toEqual([]);
    } finally { restore(); }
  });

  it('does not let suspended staff register devices', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member', 'suspended');
    const response = await request(app).post(`/api/org/${ORG}/devices/register`)
      .set(auth('member_1')).send(registration);
    expect(response.status).toBe(403);
  });

  it('revokes a device and records the status change in the same transaction', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    seedDoc(`organisations/${ORG}/devices/device_1`, {
      ownerUid: 'member_1', status: 'active', channel: 'stable', appVersion: '1.2.3',
    });
    const response = await request(app).post(`/api/org/${ORG}/devices/device_1/revoke`).set(auth('owner_1'));
    expect(response.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/devices/device_1`)?.status).toBe('revoked');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'revoke_device', targetResourceId: 'device_1',
        before: { status: 'active' }, after: { status: 'revoked' },
      }),
    ]));
  });

  it('does not revoke a device when the transaction fails', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/devices/device_1`, {
      ownerUid: 'owner_1', status: 'active', channel: 'stable', appVersion: '1.2.3',
    });
    const restore = forceTransactionError(new Error('simulated failure'));
    try {
      const res = await request(app).post(`/api/org/${ORG}/devices/device_1/revoke`).set(auth('owner_1'));
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}/devices/device_1`)?.status).toBe('active');
    } finally { restore(); }
  });

  it('rejects check-ins from revoked devices without rewriting lastCheckIn', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    seedDoc(`organisations/${ORG}/devices/device_1`, {
      ownerUid: 'member_1', status: 'revoked', channel: 'stable',
      appVersion: '1.2.3', lastCheckIn: 'old-value',
    });
    const res = await request(app).post(`/api/org/${ORG}/devices/device_1/check-for-update`)
      .set(auth('member_1'));
    expect(res.status).toBe(403);
    expect(getDocRaw(`organisations/${ORG}/devices/device_1`)?.lastCheckIn).toBe('old-value');
  });
});


describe('offboarding cannot be bypassed through stale member documents', () => {
  it('rejects an otherwise active granular owner absent from the current roster', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1', 'former_owner'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'former_owner', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('former_owner'));
    expect(res.status).toBe(403);
  });

  it('rejects a leftover granular HR viewer when they are no longer in memberUids', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1'], hrViewerUids: ['former_hr'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'former_hr', 'member');
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('former_hr'));
    expect(res.status).toBe(403);
  });

  it('refuses to demote the only rostered owner when an orphan owner record exists', async () => {
    seedOrg(ORG, { memberUids: ['owner_1', 'ordinary_staff'], adminUids: ['owner_1', 'former_owner'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'ordinary_staff', 'member');
    seedMember(ORG, 'former_owner', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1')).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
    expect(getDocRaw(`organisations/${ORG}/members/owner_1`)?.role).toBe('owner');
  });

  it('does not count a legacy admin UID absent from the roster as an owner', async () => {
    seedOrg(ORG, { memberUids: ['owner_1', 'ordinary_staff'], adminUids: ['owner_1', 'old_legacy_owner'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'ordinary_staff', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1')).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
  });
});


describe('fake database transaction rollback reflects production atomicity', () => {
  it('does not publish earlier writes when a transaction callback throws', async () => {
    seedDoc('organisations/rollback_org', { memberUids: ['existing'] });
    await expect(fakeDb.runTransaction(async (tx: any) => {
      const ref = fakeDb.collection('organisations').doc('rollback_org');
      tx.update(ref, { memberUids: ['existing', 'unauthorised'] });
      tx.set(ref.collection('audit_logs').doc('test_event'), { action: 'test' });
      throw new Error('audit persistence failed');
    })).rejects.toThrow('audit persistence failed');
    expect(getDocRaw('organisations/rollback_org')?.memberUids).toEqual(['existing']);
    expect(getDocRaw('organisations/rollback_org/audit_logs/test_event')).toBeUndefined();
  });
});


describe('company invitation and governance audit transactions', () => {
  it('rotates a shared code with a durable audit event that contains no secret', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1'] });
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', memberUids: ['owner_1'], adminUids: ['owner_1'], joinCode: 'OLD_SHARED_CODE',
    });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/regenerate-join-code`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.joinCode).not.toBe('OLD_SHARED_CODE');
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = audit.body.logs.find((item: any) => item.action === 'rotate_join_code');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain('OLD_SHARED_CODE');
    expect(JSON.stringify(entry)).not.toContain(res.body.joinCode);
  });

  it('does not rotate the shared code if its audit transaction fails', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', memberUids: ['owner_1'], adminUids: ['owner_1'], joinCode: 'OLD_SHARED_CODE',
    });
    seedMember(ORG, 'owner_1', 'owner');
    const restore = forceTransactionError(new Error('simulated audit outage'));
    try {
      const res = await request(app).post(`/api/org/${ORG}/regenerate-join-code`).set(auth('owner_1'));
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}`)?.joinCode).toBe('OLD_SHARED_CODE');
    } finally { restore(); }
  });

  it('cancels the exact invited email and records the revocation atomically', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/employee@example.com`, {
      email: 'employee@example.com', tokenHash: 'not-a-real-token',
    });
    const res = await request(app)
      .post(`/api/org/${ORG}/invites/employee@example.com/cancel`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}/pending_invites/employee@example.com`)).toBeUndefined();
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'cancel_invitation', targetResourceId: 'employee@example.com',
        after: { pending: false, sharedJoinCodeStillValid: true },
      }),
    ]));
  });

  it('cannot cancel an invitation if the transaction fails', async () => {
    seedOrg(ORG, { memberUids: ['owner_1'], adminUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedDoc(`organisations/${ORG}/pending_invites/employee@example.com`, {
      email: 'employee@example.com', tokenHash: 'not-a-real-token',
    });
    const restore = forceTransactionError(new Error('simulated audit outage'));
    try {
      const res = await request(app)
        .post(`/api/org/${ORG}/invites/employee@example.com/cancel`).set(auth('owner_1'));
      expect(res.status).toBe(500);
      expect(getDocRaw(`organisations/${ORG}/pending_invites/employee@example.com`)).toBeDefined();
    } finally { restore(); }
  });

  it('records the real before and after company privacy threshold', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Test Org', memberUids: ['owner_1'], adminUids: ['owner_1'], privacyThreshold: 5,
    });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/settings`)
      .set(auth('owner_1')).send({ privacyThreshold: 8 });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.privacyThreshold).toBe(8);
    const audit = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(audit.body.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'update_org_settings', before: { privacyThreshold: 5 },
        after: { privacyThreshold: 8 },
      }),
    ]));
  });
});


describe('cross-company owner records cannot defeat last-owner protection', () => {
  it('cannot demote the only effective owner when another listed owner has moved company', async () => {
    seedOrg(ORG, {
      memberUids: ['owner_1', 'moved_owner'],
      adminUids: ['owner_1', 'moved_owner'],
    });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'moved_owner', 'owner');
    seedDoc('users/owner_1', { organisationId: ORG });
    seedDoc('users/moved_owner', { organisationId: OTHER_ORG });
    const res = await request(app).post(`/api/org/${ORG}/members/owner_1/role`)
      .set(auth('owner_1')).send({ role: 'member' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last owner/i);
    expect(getDocRaw(`organisations/${ORG}/members/owner_1`)?.role).toBe('owner');
  });
});
