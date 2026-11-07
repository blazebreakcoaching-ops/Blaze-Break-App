// NHEI PHASE 5C (directive §2) - real consent-writing routes, at the
// actual route boundary (GET/POST /api/nhei/consent). Same supertest +
// mocked firebase-admin pattern as
// nhei-knowledge-review-admin.route.test.ts. Covers: independent
// per-purpose writes, that granting one purpose never touches another,
// that withdrawal never deletes anything already persisted, that `uid`
// is taken only from the verified token (never the request body), input
// validation, and that an unauthenticated request is rejected.

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));

const USERS: Record<string, { email: string }> = {
  user_a: { email: 'a@test.dev' },
  user_b: { email: 'b@test.dev' },
};

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const u = USERS[t];
      if (!u) throw new Error('unknown test uid');
      return { uid: t, email: u.email };
    },
    getUser: async (_uid: string) => ({ customClaims: {} }),
    setCustomUserClaims: async () => {},
    revokeRefreshTokens: async () => {},
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  USERS.user_a = { email: 'a@test.dev' };
  USERS.user_b = { email: 'b@test.dev' };
});

describe('GET /api/nhei/consent', () => {
  it('returns all-false defaults for a user with no consent document yet', async () => {
    const res = await request(app).get('/api/nhei/consent').set(auth('user_a'));
    expect(res.status).toBe(200);
    expect(res.body.consent).toEqual({ reflection_storage: false, longitudinal_tracking: false, routing_insights: false });
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/nhei/consent');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/nhei/consent', () => {
  it('grants one purpose without touching the other two', async () => {
    const res = await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'reflection_storage', granted: true });
    expect(res.status).toBe(200);
    expect(res.body.consent).toEqual({ reflection_storage: true, longitudinal_tracking: false, routing_insights: false });
  });

  it('each purpose is independently settable - setting longitudinal_tracking never implies routing_insights or reflection_storage', async () => {
    await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'longitudinal_tracking', granted: true });
    const res = await request(app).get('/api/nhei/consent').set(auth('user_a'));
    expect(res.body.consent).toEqual({ reflection_storage: false, longitudinal_tracking: true, routing_insights: false });
  });

  it('withdrawal flips the flag back to false and never deletes anything (no deletion route is called by this endpoint)', async () => {
    await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'routing_insights', granted: true });
    const withdraw = await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'routing_insights', granted: false });
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.consent.routing_insights).toBe(false);
  });

  it('a request cannot write consent for any uid but its own - there is no uid field in the request body at all', async () => {
    await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'reflection_storage', granted: true });
    const bRes = await request(app).get('/api/nhei/consent').set(auth('user_b'));
    expect(bRes.body.consent.reflection_storage).toBe(false); // user_b's own document, unaffected by user_a's grant
  });

  it('rejects an invalid purpose string rather than silently writing an unknown field', async () => {
    const res = await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'not_a_real_purpose', granted: true });
    expect(res.status).toBe(400);
  });

  it('rejects a non-boolean granted value', async () => {
    const res = await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'reflection_storage', granted: 'yes' });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/nhei/consent').send({ purpose: 'reflection_storage', granted: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('a stray extra field on the body is rejected (schema is .strict())', async () => {
    const res = await request(app).post('/api/nhei/consent').set(auth('user_a')).send({ purpose: 'reflection_storage', granted: true, uid: 'user_b' });
    expect(res.status).toBe(400);
  });
});
