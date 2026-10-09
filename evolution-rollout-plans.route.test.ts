import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Rollout Plans (Evolution Engine PR10) - a coordination
// record, not an enforcement engine. Status-transition logic is
// exhaustively unit-tested in rollout-plans.test.ts; these tests focus
// on route wiring: access gating, target-existence validation, and that
// an invalid transition is rejected the same way a real state machine
// would.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : undefined }),
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

beforeEach(() => resetStore());

const seedFeature = () => seedDoc('platform_feature_registry/energy_budget', {
  displayName: 'Energy Budget', description: 'x', lifecycleState: 'live', enforcementState: 'unknown',
  featureFlag: null, dataZones: [], dependencies: [], downstreamConsumers: [], requiredConnectors: [],
  requiredPermissions: [], productOwner: null, technicalOwner: null, entitlementRequirement: null,
  minAppVersion: null, fallbackMode: null, rollbackMethod: null, expectedFlagRetirement: null, notes: null,
  createdAt: '2026-01-01T00:00:00.000Z', lastChangedAt: '2026-01-01T00:00:00.000Z',
});

const validBody = () => ({
  targetFeatureId: 'energy_budget', targetPercentage: 25,
  stopConditions: 'Pause if error rate exceeds 1%.', rationale: 'Gradual rollout.',
});

describe('POST /api/admin/evolution/rollout-plans', () => {
  it('requires Evolution Engine access', async () => {
    const res = await request(app).post('/api/admin/evolution/rollout-plans').set(auth(NOT_ADMIN)).send(validBody());
    expect(res.status).toBe(403);
  });

  it('400s when the target feature does not exist', async () => {
    const res = await request(app).post('/api/admin/evolution/rollout-plans').set(auth(OWNER)).send(validBody());
    expect(res.status).toBe(400);
  });

  it('creates a plan in planned status, with a status history entry', async () => {
    seedFeature();
    const res = await request(app).post('/api/admin/evolution/rollout-plans').set(auth(OWNER)).send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('planned');
    expect(res.body.statusHistory).toHaveLength(1);
  });
});

describe('POST /api/admin/evolution/rollout-plans/:id/status', () => {
  it('allows planned -> active -> paused -> active -> completed', async () => {
    seedFeature();
    const create = await request(app).post('/api/admin/evolution/rollout-plans').set(auth(OWNER)).send(validBody());
    const id = create.body.rolloutId;

    const toActive = await request(app).post(`/api/admin/evolution/rollout-plans/${id}/status`).set(auth(OWNER)).send({ status: 'active' });
    expect(toActive.status).toBe(200);

    const toPaused = await request(app).post(`/api/admin/evolution/rollout-plans/${id}/status`).set(auth(OWNER)).send({ status: 'paused', note: 'investigating a spike' });
    expect(toPaused.status).toBe(200);

    const backToActive = await request(app).post(`/api/admin/evolution/rollout-plans/${id}/status`).set(auth(OWNER)).send({ status: 'active' });
    expect(backToActive.status).toBe(200);

    const toCompleted = await request(app).post(`/api/admin/evolution/rollout-plans/${id}/status`).set(auth(OWNER)).send({ status: 'completed' });
    expect(toCompleted.status).toBe(200);

    const list = await request(app).get('/api/admin/evolution/rollout-plans').set(auth(OWNER));
    const plan = list.body.plans.find((p: any) => p.rolloutId === id);
    expect(plan.status).toBe('completed');
    expect(plan.statusHistory).toHaveLength(5); // planned + 4 transitions
  });

  it('rejects an invalid transition (planned straight to completed)', async () => {
    seedFeature();
    const create = await request(app).post('/api/admin/evolution/rollout-plans').set(auth(OWNER)).send(validBody());
    const res = await request(app).post(`/api/admin/evolution/rollout-plans/${create.body.rolloutId}/status`).set(auth(OWNER)).send({ status: 'completed' });
    expect(res.status).toBe(400);
  });

  it('404s for a nonexistent plan', async () => {
    const res = await request(app).post('/api/admin/evolution/rollout-plans/does-not-exist/status').set(auth(OWNER)).send({ status: 'active' });
    expect(res.status).toBe(404);
  });
});
