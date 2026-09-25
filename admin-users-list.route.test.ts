import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/admin/users - previously zero coverage. This
// route has always been capped at 100 with no pagination; the specific
// thing this exists to prove is the `capped` flag added alongside that
// cap, so the client can tell "that's everyone" from "there are more, but
// we're not showing them" instead of the raw list length silently
// standing in for a true total.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {
    getUser: vi.fn(async (uid: string) => ({
      uid,
      email: `${uid}@test.dev`,
      emailVerified: uid !== 'unverified_user',
      disabled: false,
      metadata: { creationTime: '2026-01-01T00:00:00.000Z', lastSignInTime: '2026-01-02T00:00:00.000Z' },
    })),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
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
import { seedDoc, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.getUser.mockClear();
});

describe('GET /api/admin/users', () => {
  it('reports capped: false when under the page limit', async () => {
    seedDoc('users/u1', {});
    seedDoc('users/u2', {});
    const res = await request(app).get('/api/admin/users').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    expect(res.body.capped).toBe(false);
  });

  it('reports capped: true when the page limit (100) is hit, instead of silently treating that as the true total', async () => {
    for (let i = 0; i < 100; i++) {
      seedDoc(`users/u${i}`, {});
    }
    const res = await request(app).get('/api/admin/users').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(100);
    expect(res.body.capped).toBe(true);
  });

  it('surfaces each account\'s real emailVerified status from Firebase Auth', async () => {
    seedDoc('users/verified_user', {});
    seedDoc('users/unverified_user', {});
    const res = await request(app).get('/api/admin/users').set(auth(OWNER));
    expect(res.status).toBe(200);
    const byUid = Object.fromEntries(res.body.users.map((u: any) => [u.uid, u]));
    expect(byUid.verified_user.emailVerified).toBe(true);
    expect(byUid.unverified_user.emailVerified).toBe(false);
  });

  it('defaults emailVerified to false for a Firestore doc with no matching live Auth account', async () => {
    h.getUser.mockImplementationOnce(async () => { throw new Error('no such user'); });
    seedDoc('users/ghost_user', {});
    const res = await request(app).get('/api/admin/users').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.users[0]).toMatchObject({ uid: 'ghost_user', emailVerified: false, accessStatus: 'unknown' });
  });
});
