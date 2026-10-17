import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/recovery/velocity-map - previously zero coverage.
// Builds a real 30-day day-by-day energyOutput/recoveryInput series from
// stress_triggers/energy_budgets/focus_sessions/wins/mood_pulses, honestly
// reporting hasAnyData: false and every day's hasData: false rather than
// fabricating a smooth curve when nothing has been logged.
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
import { seedDoc, resetStore, forceCollectionError } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  resetStore();
});

describe('GET /api/recovery/velocity-map', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/recovery/velocity-map');
    expect(res.status).toBe(401);
  });

  it('reports no data honestly for a brand-new account', async () => {
    const res = await request(app).get('/api/recovery/velocity-map').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasAnyData).toBe(false);
    expect(res.body.days).toHaveLength(30);
    expect(res.body.days.every((d: any) => d.hasData === false)).toBe(true);
  });

  it('computes real energyOutput/recoveryInput for days with logged activity, excluding stale data', async () => {
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: daysAgo(2), severity: 8 });
    seedDoc(`users/${USER}/energy_budgets/e1`, { createdAt: daysAgo(2), totalCapacity: 100, allocatedCapacity: 60 });
    seedDoc(`users/${USER}/focus_sessions/f1`, { createdAt: daysAgo(2), completed: true });
    seedDoc(`users/${USER}/wins/w1`, { createdAt: daysAgo(2) });
    seedDoc(`users/${USER}/mood_pulses/m1`, { createdAt: daysAgo(2) });
    // Outside the 30-day window - must not be counted.
    seedDoc(`users/${USER}/stress_triggers/stale`, { createdAt: daysAgo(90), severity: 9 });

    const res = await request(app).get('/api/recovery/velocity-map').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasAnyData).toBe(true);
    const activeDay = res.body.days.find((d: any) => d.hasData);
    expect(activeDay).toBeTruthy();
    expect(activeDay.energyOutput).toBe(60); // budget pct takes priority over trigger-derived estimate
    expect(activeDay.recoveryInput).toBe(63); // (1 focus session + 1 win + 0.5 mood) * 25, rounded
  });

  it('500s if the stress-triggers read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${USER}/stress_triggers`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/recovery/velocity-map').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
