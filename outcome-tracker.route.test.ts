import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/user/outcome-tracker - previously zero coverage.
// Builds a 6-week trend view (burnoutRisk/recovery/boundary/overcapacity)
// from real stress_triggers/boundary_scripts/wins/mood_pulses/energy_budgets
// plus a workload_reality_check snapshot, honestly reporting hasAnyData:
// false and null KPIs rather than fabricating figures when nothing exists.
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

describe('GET /api/user/outcome-tracker', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/user/outcome-tracker');
    expect(res.status).toBe(401);
  });

  it('reports no data honestly for a brand-new account', async () => {
    const res = await request(app).get('/api/user/outcome-tracker').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasAnyData).toBe(false);
    expect(res.body.weeks).toHaveLength(6);
    expect(res.body.weeks.every((w: any) => w.hasData === false)).toBe(true);
    expect(res.body.kpis).toMatchObject({
      boundaryScriptsLogged: 0,
      winsLogged: 0,
      avgTriggerSeverity: null,
      overcapacityDaysPerWeek: null,
      sleepConsistency: null,
      returnToWorkConfidence: null,
      userRatedHelpfulness: null,
    });
  });

  it('computes real weekly trends from logged activity within the 6-week window', async () => {
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: daysAgo(3), severity: 8 });
    seedDoc(`users/${USER}/stress_triggers/t2`, { createdAt: daysAgo(4), severity: 6 });
    seedDoc(`users/${USER}/boundary_scripts/b1`, { createdAt: daysAgo(3) });
    seedDoc(`users/${USER}/wins/w1`, { createdAt: daysAgo(3) });
    seedDoc(`users/${USER}/mood_pulses/m1`, { createdAt: daysAgo(3) });
    seedDoc(`users/${USER}/energy_budgets/e1`, { createdAt: daysAgo(3), totalCapacity: 100, allocatedCapacity: 120 });
    // Outside the 6-week (42-day) window - must not be counted.
    seedDoc(`users/${USER}/stress_triggers/stale`, { createdAt: daysAgo(90), severity: 9 });

    const res = await request(app).get('/api/user/outcome-tracker').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasAnyData).toBe(true);
    expect(res.body.kpis.boundaryScriptsLogged).toBe(1);
    expect(res.body.kpis.winsLogged).toBe(1);
    expect(res.body.kpis.avgTriggerSeverity).toBe(7);
    const currentWeek = res.body.weeks[res.body.weeks.length - 1];
    expect(currentWeek.hasData).toBe(true);
    expect(currentWeek.boundary).toBe(25);
    expect(currentWeek.overcapacity).toBe(120);
  });

  it('derives overcapacityDaysPerWeek from an active, high-drain workload snapshot', async () => {
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [
        { completed: false, energyDrain: 250 },
        { completed: false, energyDrain: 200 },
        { completed: true, energyDrain: 500 },
      ],
    });
    const res = await request(app).get('/api/user/outcome-tracker').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.kpis.overcapacityDaysPerWeek).toBe(3);
  });

  it('500s if the stress-triggers read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${USER}/stress_triggers`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/user/outcome-tracker').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
