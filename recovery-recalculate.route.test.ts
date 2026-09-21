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
import { getDocRaw, resetStore } from './test/fake-firestore';

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
    const res = await request(app)
      .post('/api/recovery/recalculate')
      .set(auth(USER))
      .send({
        checkins: [
          { stressLoad: 6, energyLevel: 5 },
          { stressLoad: 7, energyLevel: 4 },
          { stressLoad: 5, energyLevel: 6 },
        ],
        energy_budgets: [],
        mood_pulses: [
          { moodLabel: 'calm', intensity: 5 },
          { moodLabel: 'tired', intensity: 4 },
          { moodLabel: 'frustrated', intensity: 6 },
        ],
        body_checkins: [],
        wins: [],
        weekly_reviews: [],
        goals: [],
      });

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
});
