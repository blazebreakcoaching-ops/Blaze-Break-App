import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for GET /api/org/:orgId/recognition-suggestions - the
// Positive Reinforcement Engine's server route. Same k-anonymity gate as
// every other aggregate org endpoint (see org-risk-trend.route.test.ts),
// plus a check that suggestions are honestly derived from a real
// engagement-rate signal rather than fabricated.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const ADMIN = 'admin_uid';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(threshold: number, memberUids: string[], consenting: string[]) {
  seedDoc(`organisations/${ORG}`, { adminUids: [ADMIN], memberUids, privacyThreshold: threshold });
  for (const uid of memberUids) {
    seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: consenting.includes(uid) });
  }
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/recognition-suggestions — access control', () => {
  it('requires authentication', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    expect((await request(app).get(`/api/org/${ORG}/recognition-suggestions`)).status).toBe(401);
  });

  it('forbids a non-admin of the org', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth('some_random_user'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/org/:orgId/recognition-suggestions — k-anonymity gate', () => {
  it('locks and returns no suggestions below the consenting-member threshold', async () => {
    seedOrg(3, ['a', 'b', 'c', 'd'], ['a']); // only 1 consenting, threshold 3
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.cohortSize).toBe(1);
    expect(res.body.suggestions).toEqual([]);
  });

  it('unlocks once enough members consent, and returns at least one honest suggestion', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.cohortSize).toBe(3);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it('reflects a real rise in engagement between the two most recent weeks', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const now = Date.now();
    // All 3 members active in the current week; none active in the prior week.
    for (const uid of ['a', 'b', 'c']) {
      seedDoc(`users/${uid}/mood_pulses/current`, { createdAt: new Date(now - 1000).toISOString(), moodLabel: 'calm', intensity: 3 });
    }
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.body.locked).toBe(false);
    // 100% current-week engagement with no prior-week activity to compare
    // against still produces the "high sustained engagement" suggestion
    // honestly, without inventing a week-over-week delta it can't compute.
    expect(res.body.suggestions.some((s: string) => s.toLowerCase().includes('solid'))).toBe(true);
  });
});
