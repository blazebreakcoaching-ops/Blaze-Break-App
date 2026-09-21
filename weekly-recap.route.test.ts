import { describe, it, expect, beforeEach } from 'vitest';

// Route test for GET /api/user/weekly-recap - new this round. Proves it
// reads real check-ins/wins/streak from the last 7 days rather than
// showing static or fabricated copy, correctly excludes anything older
// than the window, and reports hasActivity: false honestly when nothing
// was logged this week instead of a misleading empty recap.
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
import { seedDoc, resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  resetStore();
});

describe('GET /api/user/weekly-recap', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/user/weekly-recap');
    expect(res.status).toBe(401);
  });

  it('reports no activity honestly when nothing was logged this week', async () => {
    seedDoc(`users/${USER}/checkins/old`, { createdAt: daysAgo(30), energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });

    const res = await request(app).get('/api/user/weekly-recap').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasActivity: false });
  });

  it('summarizes real check-ins, streak, energy direction, and the latest win from this week only', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { streak: 4 });
    seedDoc(`users/${USER}/checkins/c1`, { createdAt: daysAgo(6), energyLevel: 3, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });
    seedDoc(`users/${USER}/checkins/c2`, { createdAt: daysAgo(4), energyLevel: 3, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });
    seedDoc(`users/${USER}/checkins/c3`, { createdAt: daysAgo(2), energyLevel: 8, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });
    seedDoc(`users/${USER}/checkins/c4`, { createdAt: daysAgo(1), energyLevel: 8, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });
    // Outside the 7-day window - must not be counted.
    seedDoc(`users/${USER}/checkins/stale`, { createdAt: daysAgo(10), energyLevel: 1, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });

    seedDoc(`users/${USER}/wins/recent`, { createdAt: daysAgo(2), title: 'Said no to an extra meeting', content: 'Kept my afternoon clear.', category: 'boundary' });
    seedDoc(`users/${USER}/wins/stale`, { createdAt: daysAgo(9), title: 'Old win outside the window', content: '...', category: 'rest' });

    const res = await request(app).get('/api/user/weekly-recap').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasActivity).toBe(true);
    expect(res.body.checkinsCount).toBe(4);
    expect(res.body.currentStreak).toBe(4);
    expect(res.body.energyDirection).toBe('rising');
    expect(res.body.highlight).toBe('Said no to an extra meeting');
  });

  it('reports energyDirection as unknown with fewer than two check-ins this week', async () => {
    seedDoc(`users/${USER}/checkins/c1`, { createdAt: daysAgo(1), energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' });

    const res = await request(app).get('/api/user/weekly-recap').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.hasActivity).toBe(true);
    expect(res.body.checkinsCount).toBe(1);
    expect(res.body.energyDirection).toBe('unknown');
    expect(res.body.highlight).toBeNull();
  });
});
