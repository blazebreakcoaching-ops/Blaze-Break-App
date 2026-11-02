import { describe, it, expect, beforeEach } from 'vitest';

// Route test for POST /api/recovery/recalculate - previously zero coverage.
// The specific thing this exists to prove: the 4 derived summaries this
// route computes are actually persisted server-side to
// users/{uid}/derived/{key}. firestore.rules locks derived/{summaryId} to
// server-only writes (allow write: if false), but the client used to try
// to setDoc these itself after getting them back from this route - which
// always failed with permission-denied, silently, after the UI had already
// shown a success state and awarded points. The fix moved persistence into
// this route via the Admin SDK, which bypasses security rules.
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
import { getDocRaw, resetStore, forceDocError, seedDoc } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('POST /api/recovery/recalculate', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/recovery/recalculate').send({});
    expect(res.status).toBe(401);
  });

  it('persists all 4 derived summaries server-side, not just returns them', async () => {
    // A signed-in member's persisted records are the only permitted
    // calculation inputs; request-body arrays are deliberately ignored.
    for (const [i, entry] of [
      { stressLoad: 6, energyLevel: 5 },
      { stressLoad: 7, energyLevel: 4 },
      { stressLoad: 5, energyLevel: 6 },
    ].entries()) {
      seedDoc(`users/${USER}/checkins/c${i}`, entry);
    }
    for (const [i, entry] of [
      { moodLabel: 'calm', intensity: 5 },
      { moodLabel: 'tired', intensity: 4 },
      { moodLabel: 'frustrated', intensity: 6 },
    ].entries()) {
      seedDoc(`users/${USER}/mood_pulses/m${i}`, entry);
    }
    const res = await request(app)
      .post('/api/recovery/recalculate')
      .set(auth(USER))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summaries).toBeTruthy();

    for (const key of ['recovery_debt', 'recovery_velocity', 'energy_trend', 'mood_trend']) {
      const stored = getDocRaw(`users/${USER}/derived/${key}`);
      expect(stored, `expected derived/${key} to be persisted`).toBeDefined();
      expect(stored).toEqual(res.body.summaries[key]);
    }
  });

  it('still returns a not_enough_data summary (and persists it) when there is too little data', async () => {
    const res = await request(app)
      .post('/api/recovery/recalculate')
      .set(auth(USER))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.summaries.recovery_debt.status).toBe('not_enough_data');

    const stored = getDocRaw(`users/${USER}/derived/recovery_debt`);
    expect(stored).toBeDefined();
    expect((stored as any).status).toBe('not_enough_data');
  });

  it('ignores fabricated client data and uses only the authenticated user\'s saved records', async () => {
    seedDoc(`users/${USER}/checkins/genuine`, { stressLoad: 4, energyLevel: 6 });
    // Another account's records must never be consulted.
    for (let i = 0; i < 5; i++) {
      seedDoc(`users/other_user/checkins/other_${i}`, { stressLoad: 10, energyLevel: 1 });
    }
    const response = await request(app)
      .post('/api/recovery/recalculate')
      .set(auth(USER))
      .send({
        checkins: Array.from({ length: 40 }, () => ({ stressLoad: 10, energyLevel: 1 })),
        mood_pulses: Array.from({ length: 40 }, () => ({ moodLabel: 'overwhelmed', intensity: 10 })),
        goals: Array.from({ length: 40 }, () => ({ status: 'completed' })),
      });
    expect(response.status).toBe(200);
    expect(response.body.summaries.recovery_debt.sourceCount).toBe(1);
    expect(response.body.summaries.recovery_debt.status).toBe('not_enough_data');
    expect(response.body.summaries.mood_trend.status).toBe('not_enough_data');
    expect(response.body.summaries.recovery_velocity.status).toBe('not_enough_data');
    expect(getDocRaw(`users/other_user/derived/recovery_debt`)).toBeUndefined();
  });

  it('caps per-user source reads before calculating and persisting a summary', async () => {
    for (let i = 0; i < 150; i++) {
      seedDoc(`users/${USER}/checkins/checkin_${String(i).padStart(3, '0')}`, {
        stressLoad: 6, energyLevel: 4,
      });
    }
    const response = await request(app).post('/api/recovery/recalculate')
      .set(auth(USER)).send({});
    expect(response.status).toBe(200);
    expect(response.body.summaries.recovery_debt.sourceCount).toBe(100);
    expect(response.body.summaries.energy_trend.sourceCount).toBe(100);
  });

  it('500s if persisting a derived summary throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/derived/recovery_debt`, 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/recovery/recalculate').set(auth(USER)).send({});
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
