import { describe, it, expect, beforeEach } from 'vitest';

// Route test for GET /api/user/recommendation - previously zero coverage.
// Focused on the SHIP stage derivation added alongside the existing
// rule-based "next step" priority chain (unchanged by this pass) -
// Safety/Habits/Identity/Purpose (src/types.ts's SHIPStage), persisted to
// derived/stats and returned on every response.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

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

import { vi } from 'vitest';
import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const seedCheckIns = (uid: string, count: number) => {
  for (let i = 0; i < count; i++) {
    seedDoc(`users/${uid}/checkins/c${i}`, { createdAt: '2026-01-01T00:00:00.000Z' });
  }
};

beforeEach(() => {
  resetStore();
});

describe('GET /api/user/recommendation', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/user/recommendation')).status).toBe(401);
  });

  it('always includes a shipStage field alongside the existing recommendation, for a brand-new account with no data', async () => {
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.tool).toBeTruthy();
    expect(res.body.shipStage).toBe('Safety'); // fewer than 3 check-ins ever
  });

  it('is Safety stage when a recent high-severity trigger exists, even with plenty of check-in history', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: new Date().toISOString(), severity: 9, text: 'hard day' });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Safety');
    expect(res.body.tool).toBe('Nervous System Reset');
  });

  it('is Safety stage for fewer than 3 total check-ins, regardless of anything else', async () => {
    seedCheckIns(USER, 2);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString(), lastBoundaryRehearsal: new Date().toISOString() });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 10, peoplePleasing: 10 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Safety');
  });

  it('is Habits stage when check-ins are recent but boundary rehearsal has not started', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Habits');
  });

  it('is Identity stage once boundary rehearsal has real history and the fingerprint shows elevated boundary/people-pleasing scores', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: '2020-01-01T00:00:00.000Z', // stale on purpose, so the Habits branch (recent check-in) never fires
      lastBoundaryRehearsal: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 70, peoplePleasing: 40 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Identity');
  });

  it('is Purpose stage for an established, stable account with no acute or elevated signal', async () => {
    seedCheckIns(USER, 5);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: '2020-01-01T00:00:00.000Z',
      lastBoundaryRehearsal: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 20, peoplePleasing: 20 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Purpose');
  });

  it('persists the derived stage to derived/stats rather than only returning it', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString() });
    await request(app).get('/api/user/recommendation').set(auth(USER));
    const stored = getDocRaw(`users/${USER}/derived/stats`);
    expect(stored?.shipStage).toBe('Habits');
    expect(typeof stored?.shipStageComputedAt).toBe('string');
  });

  it('defaults to Safety without throwing when no fingerprint exists yet', async () => {
    seedCheckIns(USER, 3);
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(['Safety', 'Habits', 'Purpose']).toContain(res.body.shipStage);
  });
});
