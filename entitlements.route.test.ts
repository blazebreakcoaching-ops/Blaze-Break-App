import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the server-authoritative entitlement system: the plan a
// client reads back (GET /api/entitlements/me), the only real way to grant
// Premium today (POST /api/admin/users/:uid/entitlement, admin-only), and
// that capability quotas actually block expensive endpoints once a Free
// account's daily usage is exhausted - the whole point of entitlements.ts
// replacing the old client-writable subscription field.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    sendMessage: vi.fn(async (_req: any) => ({ text: 'Hi there.', functionCalls: [] })),
  };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'admin_user' ? 'platform_owner' : undefined }),
    setCustomUserClaims: vi.fn(async () => {}),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    chats = { create: () => ({ sendMessage: h.sendMessage }) };
    models = { generateContent: vi.fn(async () => ({ text: 'analysis' })) };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_free';
const ADMIN = 'admin_user';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'Hi there.', functionCalls: [] }));
});

describe('GET /api/entitlements/me', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/entitlements/me')).status).toBe(401);
  });

  it('an account with no entitlement doc is Free/active, never Premium', async () => {
    const res = await request(app).get('/api/entitlements/me').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('free');
    expect(res.body.status).toBe('active');
    expect(res.body.capabilities.nova_voice.limit).toBe(1);
  });

  it('a stored legacy plan: "premium" record (pre-B2C-tier accounts) is transparently reported as legacy_premium', async () => {
    seedDoc(`users/${USER}/entitlements/status`, {
      plan: 'premium', status: 'active', billingSource: 'admin', entitlementEnd: null, lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/entitlements/me').set(auth(USER));
    expect(res.body.plan).toBe('legacy_premium');
    expect(res.body.capabilities.nova_voice.limit).toBe(20);
  });

  it('a stale/expired Premium record reports back as Free', async () => {
    seedDoc(`users/${USER}/entitlements/status`, { plan: 'premium', status: 'active', entitlementEnd: '2020-01-01T00:00:00.000Z' });
    const res = await request(app).get('/api/entitlements/me').set(auth(USER));
    expect(res.body.plan).toBe('free');
  });
});

describe('POST /api/admin/users/:uid/entitlement', () => {
  it('requires authentication', async () => {
    expect((await request(app).post(`/api/admin/users/${USER}/entitlement`).send({ plan: 'performance', status: 'active' })).status).toBe(401);
  });

  it('refuses a non-admin caller', async () => {
    const res = await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(USER)).send({ plan: 'performance', status: 'active' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid plan/status without writing anything', async () => {
    const res = await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'ultra', status: 'active' });
    expect(res.status).toBe(400);
    expect(getDocRaw(`users/${USER}/entitlements/status`)).toBeUndefined();
  });

  it('rejects the old "premium" plan name - it no longer exists as a purchasable/grantable plan', async () => {
    const res = await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'premium', status: 'active' });
    expect(res.status).toBe(400);
    expect(getDocRaw(`users/${USER}/entitlements/status`)).toBeUndefined();
  });

  it('rejects "legacy_premium" - it is a read-path migration outcome, never an admin-grantable plan', async () => {
    const res = await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'legacy_premium', status: 'active' });
    expect(res.status).toBe(400);
    expect(getDocRaw(`users/${USER}/entitlements/status`)).toBeUndefined();
  });

  it('an admin grant is written with billingSource forced to admin, never taken from the request body', async () => {
    const res = await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN))
      .send({ plan: 'performance', status: 'active', billingSource: 'stripe', durationDays: 30 });
    expect(res.status).toBe(200);
    const stored = getDocRaw(`users/${USER}/entitlements/status`);
    expect(stored?.plan).toBe('performance');
    expect(stored?.billingSource).toBe('admin');
    expect(stored?.entitlementEnd).not.toBeNull();
  });

  it('an admin grant with no durationDays sets no fixed end', async () => {
    await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'performance', status: 'active' });
    expect(getDocRaw(`users/${USER}/entitlements/status`)?.entitlementEnd).toBeNull();
  });

  it('a grant merges into the entitlement doc rather than clobbering an existing platform-admin role field', async () => {
    seedDoc(`users/${USER}/entitlements/status`, { role: 'support_admin' });
    await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'performance', status: 'active' });
    const stored = getDocRaw(`users/${USER}/entitlements/status`);
    expect(stored?.role).toBe('support_admin');
    expect(stored?.plan).toBe('performance');
  });

  it('logs whether the grant was an upgrade, downgrade, or lateral move relative to the prior plan', async () => {
    seedDoc(`users/${USER}/entitlements/status`, { plan: 'free', status: 'active' });
    await request(app).post(`/api/admin/users/${USER}/entitlement`).set(auth(ADMIN)).send({ plan: 'executive', status: 'active' });
    const stored = getDocRaw(`users/${USER}/entitlements/status`);
    expect(stored?.plan).toBe('executive');
  });
});

describe('Free-tier capability quotas actually block expensive endpoints', () => {
  it('POST /api/nova/chat succeeds when under the daily Free quota', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hi', history: [] });
    expect(res.status).toBe(200);
    expect(h.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('POST /api/nova/chat is blocked with 429 once the Free daily quota is already used up, without calling the model', async () => {
    seedDoc(`users/${USER}/usage_counters/${new Date().toISOString().slice(0, 10)}`, { nova_text: 40 });
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hi', history: [] });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('capability_limit_reached');
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('a Premium account is not blocked at the Free quota boundary', async () => {
    seedDoc(`users/${USER}/entitlements/status`, { plan: 'premium', status: 'active' });
    seedDoc(`users/${USER}/usage_counters/${new Date().toISOString().slice(0, 10)}`, { nova_text: 40 });
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hi', history: [] });
    expect(res.status).toBe(200);
  });

  it('GET /api/user/export is blocked once the Free daily export quota is used up', async () => {
    seedDoc(`users/${USER}/usage_counters/${new Date().toISOString().slice(0, 10)}`, { exports: 1 });
    const res = await request(app).get('/api/user/export').set(auth(USER));
    expect(res.status).toBe(429);
  });

  it('each successful chat message actually increments the usage counter for the next check', async () => {
    await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'one', history: [] });
    await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'two', history: [] });
    const today = new Date().toISOString().slice(0, 10);
    expect(getDocRaw(`users/${USER}/usage_counters/${today}`)?.nova_text).toBe(2);
  });
});
