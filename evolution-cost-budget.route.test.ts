import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Release Health cost budget config (Evolution
// Engine PR11) - the stored number GET /api/admin/cost-usage's
// budgetAlert compares against (see cost-usage.route.test.ts for that
// integration).
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/cost-budget', () => {
  it('requires Evolution Engine access', async () => {
    expect((await request(app).get('/api/admin/evolution/cost-budget').set(auth(NOT_ADMIN))).status).toBe(403);
  });
  it('defaults to 0 when unset', async () => {
    const res = await request(app).get('/api/admin/evolution/cost-budget').set(auth(OWNER));
    expect(res.body.monthlyBudgetUsd).toBe(0);
  });
});

describe('POST /api/admin/evolution/cost-budget', () => {
  it('rejects a negative budget', async () => {
    const res = await request(app).post('/api/admin/evolution/cost-budget').set(auth(OWNER)).send({ monthlyBudgetUsd: -5 });
    expect(res.status).toBe(400);
  });
  it('rejects a non-number budget', async () => {
    const res = await request(app).post('/api/admin/evolution/cost-budget').set(auth(OWNER)).send({ monthlyBudgetUsd: '100' });
    expect(res.status).toBe(400);
  });
  it('sets and persists a real budget', async () => {
    const post = await request(app).post('/api/admin/evolution/cost-budget').set(auth(OWNER)).send({ monthlyBudgetUsd: 250 });
    expect(post.status).toBe(200);
    const get = await request(app).get('/api/admin/evolution/cost-budget').set(auth(OWNER));
    expect(get.body.monthlyBudgetUsd).toBe(250);
  });
});
