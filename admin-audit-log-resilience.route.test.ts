import { describe, it, expect, vi } from 'vitest';

// logAdminAction (server.ts) deliberately swallows a failed audit-log write
// rather than letting it fail the admin action that already happened - see
// the comment above it ("blocking the response on a retry would punish the
// admin for an audit-log outage they can't fix"). That's an intentional,
// documented behavior with no test proving it actually holds; this closes
// that gap for one representative admin route.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return { revokeRefreshTokens: vi.fn(async () => {}) };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: 'platform_owner' }),
    updateUser: vi.fn(async () => {}),
    revokeRefreshTokens: h.revokeRefreshTokens,
    // The suspend route now looks up the target (404 / platform-staff check).
    getUser: async (uid: string) => ({ uid, email: `${uid}@test.dev`, emailVerified: true, customClaims: {} }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

describe('logAdminAction resilience: an audit-log write failure must not fail the admin action', () => {
  it('suspend still succeeds, revokes sessions, and queues the audit event for recovery when admin_audit_logs writes fail', async () => {
    resetStore();
    h.revokeRefreshTokens.mockClear();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalCollection = fakeDb.collection.bind(fakeDb);
    const collectionSpy = vi.spyOn(fakeDb, 'collection').mockImplementation((id: string) => {
      if (id === 'admin_audit_logs') {
        return {
          doc: () => ({ id: 'evt_outage', set: () => Promise.reject(new Error('simulated audit-log outage')) }),
        } as any;
      }
      return originalCollection(id);
    });

    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth('owner_1')).send({ suspend: true });

    // The suspension itself already happened, so it must not be reported
    // as failed - but the response is honest that the audit is not yet durable.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, auditRecorded: false });
    expect(h.revokeRefreshTokens).toHaveBeenCalledWith('target_uid');
    // Same event ID is queued for idempotent replay.
    const queued = getDocRaw('admin_audit_recovery/evt_outage');
    expect(queued?.entry).toMatchObject({ action: 'suspend_user', targetUid: 'target_uid', outcome: 'succeeded' });
    const messages = errorSpy.mock.calls.map((c) => JSON.parse(c[0] as string).message);
    expect(messages).toContain('Primary audit persistence failed; event placed in recovery queue');

    collectionSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
