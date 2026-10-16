import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for requirePermission (server.ts) - previously every
// route below accepted any of the 8 platform-staff roles via a bare
// requireAdmin check, ignoring getPermissionsForRole's own, much narrower
// per-role permission set entirely (a content_admin, whose real permissions
// are only content.manage/nova.manage, could still suspend a user account
// or create a B2B organisation). Each case here proves a role WITHOUT the
// route's required permission is refused, and a role WITH it still works.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {
    getUser: vi.fn(async (uid: string) => ({ uid, email: `${uid}@test.dev`, customClaims: {} })),
    updateUser: vi.fn(async () => {}),
    listUsers: vi.fn(async () => ({ users: [], pageToken: undefined })),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    // Each uid encodes the role it should carry, so a single mock covers
    // every platform-staff role without a per-test override.
    verifyIdToken: async (t: string) => ({
      uid: t,
      email: `${t}@test.dev`,
      role: t.startsWith('owner_') ? 'platform_owner'
        : t.startsWith('contentadmin_') ? 'content_admin'
        : t.startsWith('secadmin_') ? 'security_admin'
        : t.startsWith('b2badmin_') ? 'b2b_admin'
        : t.startsWith('coachadmin_') ? 'coach_admin'
        : undefined,
      // Simulates an account promoted via the old boolean claim with no
      // modern `role` claim ever set - requireAdmin itself already treats
      // this as a super-admin, and requirePermission must keep doing the
      // same rather than deny it based on getPermissionsForRole(undefined).
      admin: t.startsWith('legacyadmin_') ? true : undefined,
    }),
    getUser: h.getUser,
    updateUser: h.updateUser,
    listUsers: h.listUsers,
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc, forceDocError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('requirePermission enforcement on admin routes', () => {
  it('users.manage: content_admin cannot suspend a user, platform_owner can', async () => {
    const denied = await request(app).post('/api/admin/users/target_uid/suspend').set(auth('contentadmin_1')).send({ suspend: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/users\.manage/);

    const allowed = await request(app).post('/api/admin/users/target_uid/suspend').set(auth('owner_1')).send({ suspend: true });
    expect(allowed.status).toBe(200);
  });

  it('users.manage: content_admin cannot grant an entitlement, platform_owner can', async () => {
    const denied = await request(app).post('/api/admin/users/target_uid/entitlement').set(auth('contentadmin_1')).send({ plan: 'core', status: 'active' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/users\.manage/);

    const allowed = await request(app).post('/api/admin/users/target_uid/entitlement').set(auth('owner_1')).send({ plan: 'core', status: 'active' });
    expect(allowed.status).toBe(200);
  });

  it('audit.read: content_admin cannot list admin accounts, security_admin can', async () => {
    const denied = await request(app).get('/api/admin/admin-users').set(auth('contentadmin_1'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/audit\.read/);

    const allowed = await request(app).get('/api/admin/admin-users').set(auth('secadmin_1'));
    expect(allowed.status).toBe(200);
  });

  it('audit.read: content_admin cannot read the audit log, security_admin can', async () => {
    const denied = await request(app).get('/api/admin/audit-logs').set(auth('contentadmin_1'));
    expect(denied.status).toBe(403);

    const allowed = await request(app).get('/api/admin/audit-logs').set(auth('secadmin_1'));
    expect(allowed.status).toBe(200);
  });

  it('b2b.manage: coach_admin cannot create an organisation, b2b_admin can', async () => {
    const denied = await request(app).post('/api/admin/orgs').set(auth('coachadmin_1')).send({ orgId: 'denied-org', name: 'Denied Org' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/b2b\.manage/);

    const allowed = await request(app).post('/api/admin/orgs').set(auth('b2badmin_1')).send({ orgId: 'allowed-org', name: 'Allowed Org' });
    expect(allowed.status).toBe(200);
  });

  it('b2b.manage: coach_admin cannot list organisations, b2b_admin can', async () => {
    const denied = await request(app).get('/api/admin/orgs').set(auth('coachadmin_1'));
    expect(denied.status).toBe(403);

    const allowed = await request(app).get('/api/admin/orgs').set(auth('b2badmin_1'));
    expect(allowed.status).toBe(200);
  });

  it('nova.manage: b2b_admin cannot change Nova settings, content_admin can', async () => {
    const denied = await request(app).post('/api/admin/nova-settings').set(auth('b2badmin_1')).send({ settings: { tone: 'warm' } });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/nova\.manage/);

    const allowed = await request(app).post('/api/admin/nova-settings').set(auth('contentadmin_1')).send({ settings: { tone: 'warm' } });
    expect(allowed.status).toBe(200);
  });

  it('content.manage: b2b_admin cannot update the content library, content_admin can', async () => {
    const denied = await request(app).post('/api/admin/content-library').set(auth('b2badmin_1')).send({ content: 'hello' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/content\.manage/);

    const allowed = await request(app).post('/api/admin/content-library').set(auth('contentadmin_1')).send({ content: 'hello' });
    expect(allowed.status).toBe(200);
  });

  // The defensive catch block behind the happy path above.
  it('content.manage route: returns a generic 500 and logs the real error when the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('app_config/content_library', 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/admin/content-library').set(auth('contentadmin_1')).send({ content: 'hello' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });

  it('settings.manage: content_admin cannot flip a feature flag, platform_owner can', async () => {
    const denied = await request(app).post('/api/admin/feature-flags').set(auth('contentadmin_1')).send({ featureId: 'some_flag', enabled: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/settings\.manage/);

    const allowed = await request(app).post('/api/admin/feature-flags').set(auth('owner_1')).send({ featureId: 'some_flag', enabled: true });
    expect(allowed.status).toBe(200);
  });

  it('settings.manage: content_admin cannot update a release channel, platform_owner can', async () => {
    const denied = await request(app).post('/api/admin/release-channels').set(auth('contentadmin_1')).send({ channel: 'stable', minVersion: '1.0.0', latestVersion: '1.0.0' });
    expect(denied.status).toBe(403);

    const allowed = await request(app).post('/api/admin/release-channels').set(auth('owner_1')).send({ channel: 'stable', minVersion: '1.0.0', latestVersion: '1.0.0' });
    expect(allowed.status).toBe(200);
  });

  it('safety.read: content_admin cannot view the retention queue, security_admin can', async () => {
    const denied = await request(app).get('/api/admin/privacy/retention-queue').set(auth('contentadmin_1'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/safety\.read/);

    const allowed = await request(app).get('/api/admin/privacy/retention-queue').set(auth('secadmin_1'));
    expect(allowed.status).toBe(200);
  });

  it('users.read: b2b_admin cannot list users, security_admin can', async () => {
    const denied = await request(app).get('/api/admin/users').set(auth('b2badmin_1'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/users\.read/);

    const allowed = await request(app).get('/api/admin/users').set(auth('secadmin_1'));
    expect(allowed.status).toBe(200);
  });

  it('a legacy admin:true claim with no modern role still passes every permission check (never locked out by this change)', async () => {
    seedDoc('admin_audit_logs/log1', { actorUid: 'legacyadmin_1', actorEmail: 'legacy@test.dev', action: 'x', targetUid: '', targetEmail: '', createdAt: new Date().toISOString(), metadata: {} });
    const res = await request(app).get('/api/admin/audit-logs').set(auth('legacyadmin_1'));
    expect(res.status).toBe(200);
  });
});
