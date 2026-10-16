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
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: 'platform_owner' }),
    updateUser: vi.fn(async () => {}),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

describe('logAdminAction resilience: an audit-log write failure must not fail the admin action', () => {
  it('suspend still succeeds, and is still logged to Cloud Logging, when admin_audit_logs.add() throws', async () => {
    resetStore();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const originalCollection = fakeDb.collection.bind(fakeDb);
    const collectionSpy = vi.spyOn(fakeDb, 'collection').mockImplementation((id: string) => {
      if (id === 'admin_audit_logs') {
        return { add: () => Promise.reject(new Error('simulated audit-log outage')) } as any;
      }
      return originalCollection(id);
    });

    const res = await request(app).post('/api/admin/users/target_uid/suspend').set(auth('owner_1')).send({ suspend: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    // The failure must still be observable somewhere (Cloud Logging), not
    // silently dropped - this is what makes "swallow it" an acceptable
    // tradeoff instead of a real gap.
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged).toMatchObject({ severity: 'ERROR', message: 'Failed to write admin audit log' });
    expect(logged.entry).toMatchObject({ action: 'suspend_user', targetUid: 'target_uid' });

    collectionSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
