import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/admin/privacy/retention-queue - previously zero
// coverage. The one thing this exists to prove: the admin view reaches the
// exact same verdict evaluateRetentionAction() (data-retention.ts) would
// give the real nightly sweep for a given account, rather than a separate,
// possibly-drifted copy of the decision logic.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

const h = vi.hoisted(() => ({
  listUsers: vi.fn(async () => ({ users: [], pageToken: undefined })),
}));

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
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
import { seedDoc, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const monthsAgo = (n: number) => new Date(Date.now() - n * 30 * 24 * 60 * 60 * 1000).toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  resetStore();
  h.listUsers.mockClear();
  h.listUsers.mockImplementation(async () => ({ users: [], pageToken: undefined }));
});

describe('GET /api/admin/privacy/retention-queue', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('reports the real sweep kill-switch state and policy numbers', async () => {
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.inactivityMonths).toBe(12);
    expect(res.body.warningDaysBefore).toBe(30);
    expect(typeof res.body.sweepEnabled).toBe('boolean');
  });

  it('places an account inactive past the warning threshold with no warning sent yet into warnedPending', async () => {
    h.listUsers.mockImplementation(async () => ({
      users: [{ uid: 'inactive_1', email: 'inactive1@test.dev', metadata: { lastSignInTime: monthsAgo(12), creationTime: monthsAgo(24) } }],
      pageToken: undefined,
    }));
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.warnedPending).toHaveLength(1);
    expect(res.body.warnedPending[0].uid).toBe('inactive_1');
    expect(res.body.eligibleForDeletion).toHaveLength(0);
  });

  it('places an already-warned, grace-period-elapsed account into eligibleForDeletion, not warnedPending', async () => {
    seedDoc('users/warned_1', { retentionWarningSentAt: daysAgo(31) });
    h.listUsers.mockImplementation(async () => ({
      users: [{ uid: 'warned_1', email: 'warned1@test.dev', metadata: { lastSignInTime: monthsAgo(13), creationTime: monthsAgo(24) } }],
      pageToken: undefined,
    }));
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.eligibleForDeletion).toHaveLength(1);
    expect(res.body.eligibleForDeletion[0].uid).toBe('warned_1');
    expect(res.body.warnedPending).toHaveLength(0);
  });

  it('leaves an active account out of both lists', async () => {
    h.listUsers.mockImplementation(async () => ({
      users: [{ uid: 'active_1', email: 'active1@test.dev', metadata: { lastSignInTime: daysAgo(1), creationTime: monthsAgo(24) } }],
      pageToken: undefined,
    }));
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.warnedPending).toHaveLength(0);
    expect(res.body.eligibleForDeletion).toHaveLength(0);
  });

  it('reports capped: true when a further page of users exists', async () => {
    h.listUsers.mockImplementation(async () => ({ users: [], pageToken: 'next-page-token' }));
    const res = await request(app).get('/api/admin/privacy/retention-queue').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.capped).toBe(true);
  });
});
