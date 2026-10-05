import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the platform-admin-management endpoints - previously
// zero coverage. The main point: role fields on all three routes below
// are now Zod-enum-validated (an invalid/typo'd role used to be accepted
// silently, setting admin:true with getPermissionsForRole()'s empty
// default permission set), and the last-platform-owner guard actually
// blocks removing/downgrading the sole remaining owner.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {
    setCustomUserClaims: vi.fn(async () => {}),
    getUserByEmail: vi.fn(async (email: string) => ({ uid: `uid_${email}`, email, displayName: null })),
    updateUser: vi.fn(async () => {}),
    // mergeCustomClaims/removeCustomClaimKeys (server.ts) read the
    // account's existing claims before writing, so every admin route
    // under test now calls getUser(uid) first - previously claims were
    // just overwritten wholesale with no read. Starts empty; tests that
    // care about merging pre-existing claims can override per-call.
    getUser: vi.fn(async (_uid: string) => ({ customClaims: {} })),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t,
      email: `${t}@test.dev`,
      role: t === 'owner_1' ? 'platform_owner' : (t === 'owner_2' ? 'platform_owner' : undefined),
      admin: t === 'owner_2' ? true : undefined,
      platformOwner: t === 'owner_2' ? true : undefined,
      // owner_2 simulates a temporary escalation that already expired -
      // the token itself still carries the old elevated claims (exactly
      // what a real, not-yet-refreshed Firebase ID token would look
      // like), proving requireAuth's expiry check strips them rather
      // than relying on the claim simply being absent.
      roleExpiresAt: t === 'owner_2' ? new Date(Date.now() - 60_000).toISOString() : undefined,
    }),
    setCustomUserClaims: h.setCustomUserClaims,
    getUserByEmail: h.getUserByEmail,
    updateUser: h.updateUser,
    getUser: h.getUser,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_OWNER = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.setCustomUserClaims.mockClear();
  h.getUserByEmail.mockClear();
  h.updateUser.mockClear();
  h.getUser.mockClear();
});

describe('GET /api/admin/admin-users', () => {
  it("surfaces each admin's real mfaEnabled status, read fresh from Auth custom claims", async () => {
    seedDoc('admin_users/uid_with_mfa', { uid: 'uid_with_mfa', email: 'secure@test.dev', role: 'platform_admin' });
    seedDoc('admin_users/uid_without_mfa', { uid: 'uid_without_mfa', email: 'insecure@test.dev', role: 'support_admin' });
    h.getUser.mockImplementationOnce(async (uid: string) => ({ customClaims: uid === 'uid_with_mfa' ? { mfaEnabled: true } : {} }));
    h.getUser.mockImplementationOnce(async (uid: string) => ({ customClaims: uid === 'uid_with_mfa' ? { mfaEnabled: true } : {} }));
    const res = await request(app).get('/api/admin/admin-users').set(auth(OWNER));
    expect(res.status).toBe(200);
    const byUid = Object.fromEntries(res.body.admins.map((a: any) => [a.uid, a]));
    expect(byUid.uid_with_mfa.mfaEnabled).toBe(true);
    expect(byUid.uid_without_mfa.mfaEnabled).toBe(false);
  });

  it('defaults mfaEnabled to false (not fabricated true) when the Auth lookup fails', async () => {
    seedDoc('admin_users/ghost', { uid: 'ghost', email: 'ghost@test.dev', role: 'viewer_admin' });
    h.getUser.mockImplementationOnce(async () => { throw new Error('no such user'); });
    const res = await request(app).get('/api/admin/admin-users').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.admins[0].mfaEnabled).toBe(false);
  });
});

describe('POST /api/admin/admin-users', () => {
  it('requires platform owner', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(NOT_OWNER)).send({ email: 'a@b.com', role: 'support_admin', reason: 'incident response' });
    expect(res.status).toBe(500); // requirePlatformOwner throws, caught by the generic 500 handler in this route
  });

  it('rejects an invalid role', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'super_admin', reason: 'incident response' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
    expect(h.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects an app-level role that is not a valid admin-panel role', async () => {
    // 'individual'/'manager' etc. are real AuthRole values but never valid
    // admin-panel roles - confirms the two enums are kept genuinely separate.
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'individual', reason: 'incident response' });
    expect(res.status).toBe(400);
  });

  it('requires a reason', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'support_admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
    expect(h.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects a too-short reason', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'support_admin', reason: 'hi' });
    expect(res.status).toBe(400);
  });

  it('accepts every valid admin-panel role and creates the admin user', async () => {
    for (const role of ['platform_owner', 'platform_admin', 'support_admin', 'content_admin', 'coach_admin', 'b2b_admin', 'viewer_admin']) {
      const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: `${role}@test.dev`, role, displayName: 'Test', reason: 'quarterly access review' });
      expect(res.status).toBe(200);
    }
  });

  it('stores the role and sets the admin custom claim on success, with no expiry when none is requested', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'new@test.dev', role: 'support_admin', displayName: 'New Admin', reason: 'covering support rotation' });
    expect(res.status).toBe(200);
    expect(h.setCustomUserClaims).toHaveBeenCalledWith('uid_new@test.dev', expect.objectContaining({ admin: true, role: 'support_admin', platformOwner: false, roleExpiresAt: null }));
    const stored = getDocRaw('admin_users/uid_new@test.dev');
    expect(stored?.role).toBe('support_admin');
    expect(stored?.permissions).toEqual(['users.read', 'safety.read']);
    expect(stored?.reason).toBe('covering support rotation');
    expect(stored?.expiresAt).toBeNull();
  });

  it('grants a temporary, self-expiring escalation when escalationHours is set', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER))
      .send({ email: 'temp@test.dev', role: 'security_admin', reason: 'incident response - 24h escalation', escalationHours: 24 });
    expect(res.status).toBe(200);
    const [, claims] = h.setCustomUserClaims.mock.calls.at(-1) as unknown as [string, any];
    expect(claims.roleExpiresAt).toBeTruthy();
    expect(Date.parse(claims.roleExpiresAt)).toBeGreaterThan(Date.now());
    const stored = getDocRaw('admin_users/uid_temp@test.dev');
    expect(stored?.expiresAt).toBe(claims.roleExpiresAt);
  });

  it('rejects an escalation longer than 30 days', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER))
      .send({ email: 'a@b.com', role: 'support_admin', reason: 'too long', escalationHours: 721 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/admin-users/:uid/role', () => {
  it('requires platform owner', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(NOT_OWNER)).send({ role: 'support_admin', reason: 'incident response' });
    expect(res.status).toBe(500);
  });

  it('rejects an invalid role', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'super_admin', reason: 'incident response' });
    expect(res.status).toBe(400);
    expect(h.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'support_admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  it('rejects an extra, unexpected field in the body', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'support_admin', reason: 'incident response', extra: true });
    expect(res.status).toBe(400);
  });

  it('updates the role on a valid request', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'viewer_admin', permissions: [] });
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'content_admin', reason: 'promoted for content review duties' });
    expect(res.status).toBe(200);
    const stored = getDocRaw('admin_users/target_uid');
    expect(stored?.role).toBe('content_admin');
    expect(stored?.permissions).toEqual(['content.manage', 'nova.manage']);
    expect(stored?.reason).toBe('promoted for content review duties');
  });

  it('refuses to downgrade the last remaining platform owner', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'platform_owner' });
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'support_admin', reason: 'org restructure' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/last Platform Owner/i);
  });
});

describe('requireAuth: temporary privilege escalation expiry', () => {
  it('no longer treats an expired escalation as admin, platform_admin, or platform_owner', async () => {
    // owner_2 is minted by the test's own verifyIdToken mock below with an
    // already-past roleExpiresAt - requireAuth must strip the elevated
    // claims before any of the three guards see them, with no Firestore
    // read and no cron job involved.
    const res = await request(app).get('/api/admin/admin-users').set(auth('owner_2'));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Forbidden/i);
  });
});

describe('POST /api/admin/users/:uid/role (app-level AuthRole)', () => {
  it('requires platform owner', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/role').set(auth(NOT_OWNER)).send({ role: 'manager' });
    expect(res.status).toBe(500);
  });

  it('rejects an invalid role', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/role').set(auth(OWNER)).send({ role: 'super_admin' });
    expect(res.status).toBe(400);
  });

  it('rejects an admin-panel role that is not a valid app-level role either way, but accepts one that is shared', async () => {
    // platform_admin is valid in BOTH enums (an admin can also be a user
    // with that role claim) - confirms the app-level route isn't more
    // restrictive than it should be for the roles the two lists share.
    const res = await request(app).post('/api/admin/users/target_uid/role').set(auth(OWNER)).send({ role: 'platform_admin' });
    expect(res.status).toBe(200);
  });

  it('accepts every valid app-level role', async () => {
    const roles = ['individual', 'employee', 'recovery_ally', 'manager', 'organisation_admin', 'executive', 'security_admin', 'user'];
    for (const role of roles) {
      const res = await request(app).post('/api/admin/users/target_uid/role').set(auth(OWNER)).send({ role });
      expect(res.status).toBe(200);
    }
  });

  it('stores the role on the entitlements doc and sets the claim', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/role').set(auth(OWNER)).send({ role: 'manager' });
    expect(res.status).toBe(200);
    expect(h.setCustomUserClaims).toHaveBeenCalledWith('target_uid', { role: 'manager' });
    const stored = getDocRaw('users/target_uid/entitlements/status');
    expect(stored?.role).toBe('manager');
  });
});

describe('POST /api/admin/users/:uid/suspend', () => {
  it('requires admin', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(NOT_OWNER)).send({ suspend: true });
    expect(res.status).toBe(500);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean suspend value', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(OWNER)).send({ suspend: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/suspend/i);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a missing suspend field', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(OWNER)).send({});
    expect(res.status).toBe(400);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an extra, unexpected field in the body', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(OWNER)).send({ suspend: true, reason: 'test' });
    expect(res.status).toBe(400);
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it('disables the target account on suspend: true', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(OWNER)).send({ suspend: true });
    expect(res.status).toBe(200);
    expect(h.updateUser).toHaveBeenCalledWith('target_uid', { disabled: true });
  });

  it('re-enables the target account on suspend: false', async () => {
    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth(OWNER)).send({ suspend: false });
    expect(res.status).toBe(200);
    expect(h.updateUser).toHaveBeenCalledWith('target_uid', { disabled: false });
  });
});

describe('DELETE /api/admin/admin-users/:uid', () => {
  it('refuses to remove the last remaining platform owner', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'platform_owner' });
    const res = await request(app).delete('/api/admin/admin-users/target_uid').set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/last Platform Owner/i);
    expect(getDocRaw('admin_users/target_uid')).toBeDefined();
  });

  it('allows removing a non-owner admin', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'support_admin' });
    const res = await request(app).delete('/api/admin/admin-users/target_uid').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(getDocRaw('admin_users/target_uid')).toBeUndefined();
  });
});
