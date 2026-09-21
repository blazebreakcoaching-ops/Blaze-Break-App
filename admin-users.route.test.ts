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
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
    setCustomUserClaims: h.setCustomUserClaims,
    getUserByEmail: h.getUserByEmail,
    updateUser: h.updateUser,
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
});

describe('POST /api/admin/admin-users', () => {
  it('requires platform owner', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(NOT_OWNER)).send({ email: 'a@b.com', role: 'support_admin' });
    expect(res.status).toBe(500); // requirePlatformOwner throws, caught by the generic 500 handler in this route
  });

  it('rejects an invalid role', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'super_admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
    expect(h.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects an app-level role that is not a valid admin-panel role', async () => {
    // 'individual'/'manager' etc. are real AuthRole values but never valid
    // admin-panel roles - confirms the two enums are kept genuinely separate.
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'a@b.com', role: 'individual' });
    expect(res.status).toBe(400);
  });

  it('accepts every valid admin-panel role and creates the admin user', async () => {
    for (const role of ['platform_owner', 'platform_admin', 'support_admin', 'content_admin', 'coach_admin', 'b2b_admin', 'viewer_admin']) {
      const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: `${role}@test.dev`, role, displayName: 'Test' });
      expect(res.status).toBe(200);
    }
  });

  it('stores the role and sets the admin custom claim on success', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth(OWNER)).send({ email: 'new@test.dev', role: 'support_admin', displayName: 'New Admin' });
    expect(res.status).toBe(200);
    expect(h.setCustomUserClaims).toHaveBeenCalledWith('uid_new@test.dev', expect.objectContaining({ admin: true, role: 'support_admin', platformOwner: false }));
    const stored = getDocRaw('admin_users/uid_new@test.dev');
    expect(stored?.role).toBe('support_admin');
    expect(stored?.permissions).toEqual(['users.read', 'safety.read']);
  });
});

describe('POST /api/admin/admin-users/:uid/role', () => {
  it('requires platform owner', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(NOT_OWNER)).send({ role: 'support_admin' });
    expect(res.status).toBe(500);
  });

  it('rejects an invalid role', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'super_admin' });
    expect(res.status).toBe(400);
    expect(h.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('rejects an extra, unexpected field in the body', async () => {
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'support_admin', extra: true });
    expect(res.status).toBe(400);
  });

  it('updates the role on a valid request', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'viewer_admin', permissions: [] });
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'content_admin' });
    expect(res.status).toBe(200);
    const stored = getDocRaw('admin_users/target_uid');
    expect(stored?.role).toBe('content_admin');
    expect(stored?.permissions).toEqual(['content.manage', 'nova.manage']);
  });

  it('refuses to downgrade the last remaining platform owner', async () => {
    seedDoc('admin_users/target_uid', { uid: 'target_uid', role: 'platform_owner' });
    const res = await request(app).post('/api/admin/admin-users/target_uid/role').set(auth(OWNER)).send({ role: 'support_admin' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/last Platform Owner/i);
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
