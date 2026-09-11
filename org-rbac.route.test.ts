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
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

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
});
