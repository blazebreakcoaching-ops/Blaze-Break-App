import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/user/mark-activity - the generic completion
// endpoint every tool's client-side completion trio calls. Confirms a
// known ACTIVITY_FIELD_MAP key merges the right timestamp field into
// derived/stats, an unknown key still 400s, and specifically that the two
// keys added for the new BLAME Reset and SPARK Check tools are wired
// correctly (regression guard against an ACTIVITY_FIELD_MAP typo).
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {};
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('POST /api/user/mark-activity', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/user/mark-activity').send({ activity: 'checkIn' })).status).toBe(401);
  });

  it('rejects an unknown activity key', async () => {
    const res = await request(app).post('/api/user/mark-activity').set(auth(USER)).send({ activity: 'notARealActivity' });
    expect(res.status).toBe(400);
  });

  it('merges lastBlameReset into derived/stats for the blameReset activity', async () => {
    const res = await request(app).post('/api/user/mark-activity').set(auth(USER)).send({ activity: 'blameReset' });
    expect(res.status).toBe(200);
    const stored = getDocRaw(`users/${USER}/derived/stats`);
    expect(typeof stored?.lastBlameReset).toBe('string');
  });

  it('merges lastSparkCheck into derived/stats for the sparkCheck activity', async () => {
    const res = await request(app).post('/api/user/mark-activity').set(auth(USER)).send({ activity: 'sparkCheck' });
    expect(res.status).toBe(200);
    const stored = getDocRaw(`users/${USER}/derived/stats`);
    expect(typeof stored?.lastSparkCheck).toBe('string');
  });
});
