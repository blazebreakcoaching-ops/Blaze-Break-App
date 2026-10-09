import { describe, it, expect, beforeEach, vi } from 'vitest';

// End-to-end route tests for GET /api/recovery/direction - confirms the
// real signal-to-direction pipeline (recovery-direction-engine.ts, already
// unit-tested in isolation) behaves correctly wired through real Firestore
// reads, never client-supplied arrays like the legacy /api/recovery/
// recalculate route it's meant to eventually replace.
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

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore, getDocRaw } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

beforeEach(() => resetStore());

describe('GET /api/recovery/direction', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/recovery/direction')).status).toBe(401);
  });

  it('is honest when there is not enough capacity history yet', async () => {
    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.band).toBeNull();
    expect(res.body.explanation.toLowerCase()).toContain('not enough');
  });

  it('building_capacity when capacity has genuinely risen over the window', async () => {
    seedDoc(`users/${USER}/capacity_checkins/c1`, { score: 30, createdAt: daysAgo(13) });
    seedDoc(`users/${USER}/capacity_checkins/c2`, { score: 35, createdAt: daysAgo(12) });
    seedDoc(`users/${USER}/capacity_checkins/c3`, { score: 70, createdAt: daysAgo(2) });
    seedDoc(`users/${USER}/capacity_checkins/c4`, { score: 75, createdAt: daysAgo(1) });

    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.body.band).toBe('building_capacity');
    expect(res.body.capacityTrend).toBe('rising');
  });

  it('under_more_pressure when capacity has fallen', async () => {
    seedDoc(`users/${USER}/capacity_checkins/c1`, { score: 80, createdAt: daysAgo(13) });
    seedDoc(`users/${USER}/capacity_checkins/c2`, { score: 85, createdAt: daysAgo(12) });
    seedDoc(`users/${USER}/capacity_checkins/c3`, { score: 40, createdAt: daysAgo(2) });
    seedDoc(`users/${USER}/capacity_checkins/c4`, { score: 35, createdAt: daysAgo(1) });

    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.body.band).toBe('under_more_pressure');
  });

  it('ignores a capacity check-in outside the lookback window', async () => {
    seedDoc(`users/${USER}/capacity_checkins/old`, { score: 10, createdAt: daysAgo(100) });
    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.body.band).toBeNull();
    expect(res.body.sampleCount).toBe(0);
  });

  it('resolved stressors only count toward demand reduction within the lookback window', async () => {
    seedDoc(`users/${USER}/capacity_checkins/c1`, { score: 80, createdAt: daysAgo(13) });
    seedDoc(`users/${USER}/capacity_checkins/c2`, { score: 85, createdAt: daysAgo(12) });
    seedDoc(`users/${USER}/capacity_checkins/c3`, { score: 40, createdAt: daysAgo(2) });
    seedDoc(`users/${USER}/capacity_checkins/c4`, { score: 35, createdAt: daysAgo(1) });
    seedDoc(`users/${USER}/energy_stressors/s1`, { status: 'resolved', updatedAt: daysAgo(1) });
    seedDoc(`users/${USER}/energy_stressors/s2`, { status: 'resolved', updatedAt: daysAgo(1) });
    seedDoc(`users/${USER}/energy_stressors/s3`, { status: 'resolved', updatedAt: daysAgo(1) });
    // Falling capacity, but demand reduction actually improved recently -> mixed, not under_more_pressure.
    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.body.band).toBe('mixed');
  });

  it('persists the result to derived/recovery_direction', async () => {
    seedDoc(`users/${USER}/capacity_checkins/c1`, { score: 30, createdAt: daysAgo(13) });
    seedDoc(`users/${USER}/capacity_checkins/c2`, { score: 35, createdAt: daysAgo(12) });
    seedDoc(`users/${USER}/capacity_checkins/c3`, { score: 70, createdAt: daysAgo(2) });
    seedDoc(`users/${USER}/capacity_checkins/c4`, { score: 75, createdAt: daysAgo(1) });

    await request(app).get('/api/recovery/direction').set(auth(USER));
    const persisted = getDocRaw(`users/${USER}/derived/recovery_direction`);
    expect(persisted?.band).toBe('building_capacity');
  });

  it('never returns a numeric score field, only a band and explanation', async () => {
    const res = await request(app).get('/api/recovery/direction').set(auth(USER));
    expect(res.body).not.toHaveProperty('value');
    expect(res.body).not.toHaveProperty('score');
  });
});
