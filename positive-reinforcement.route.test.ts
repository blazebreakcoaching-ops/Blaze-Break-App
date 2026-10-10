import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for GET /api/org/:orgId/recognition-suggestions - the
// Positive Reinforcement Engine's server route. Same k-anonymity gate as
// every other aggregate org endpoint, plus a check that suggestions are
// honestly derived from real Lane B organisation work data (resolved Work
// Design Debt, useful intervention outcomes, meeting pressure) - never
// from reading anyone's private mood/body check-ins.
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

  it('flags a Work Design Debt item resolved this week - never reads mood/body data', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const now = new Date().toISOString();
    // A mood_pulse exists for every member, but must never influence the
    // suggestion - this route no longer reads Lane A collections at all.
    for (const uid of ['a', 'b', 'c']) {
      seedDoc(`users/${uid}/mood_pulses/current`, { createdAt: now, moodLabel: 'overwhelmed', intensity: 9 });
    }
    seedDoc(`organisations/${ORG}/work_design_debt/d1`, { team: 'Team A', status: 'resolved', updatedAt: now });
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.body.locked).toBe(false);
    expect(res.body.suggestions.some((s: string) => s.includes('Work Design Debt item was resolved'))).toBe(true);
  });

  it('flags a genuinely useful intervention outcome recorded this week', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const now = new Date().toISOString();
    seedDoc(`organisations/${ORG}/work_design_interventions/i1`, { team: 'Team A', status: 'completed', outcomeRating: 'useful', updatedAt: now });
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.body.locked).toBe(false);
    expect(res.body.suggestions.some((s: string) => s.toLowerCase().includes('genuinely useful'))).toBe(true);
  });

  it('falls back to the generic suggestion when no structural signal is available', async () => {
    seedOrg(3, ['a', 'b', 'c'], ['a', 'b', 'c']);
    const res = await request(app).get(`/api/org/${ORG}/recognition-suggestions`).set(auth(ADMIN));
    expect(res.body.locked).toBe(false);
    expect(res.body.suggestions.some((s: string) => s.includes('Consistent small wins'))).toBe(true);
  });
});
