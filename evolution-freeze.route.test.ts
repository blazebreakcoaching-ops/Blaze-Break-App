import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Freeze Evolution - the toggle itself, and that it
// actually blocks real mutating Evolution Engine routes (a sample
// spanning both requireEvolutionAccess- and requirePlatformOwner-gated
// ones) while leaving reads untouched. Full coverage across every
// mutating route is verified structurally in
// evolution-freeze-coverage.test.ts; these tests confirm the mechanism
// itself actually works end-to-end against the real app.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev`, role: t === 'owner_1' ? 'platform_owner' : t === 'admin_1' ? 'platform_admin' : undefined }),
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
const PLATFORM_ADMIN = 'admin_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/freeze', () => {
  it('requires Evolution Engine access', async () => {
    expect((await request(app).get('/api/admin/evolution/freeze').set(auth(NOT_ADMIN))).status).toBe(403);
  });
  it('reports not frozen by default', async () => {
    const res = await request(app).get('/api/admin/evolution/freeze').set(auth(PLATFORM_ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.frozen).toBe(false);
  });
});

describe('POST /api/admin/evolution/freeze', () => {
  it('requires Platform Owner, not just any Evolution Engine role', async () => {
    const res = await request(app).post('/api/admin/evolution/freeze').set(auth(PLATFORM_ADMIN)).send({ frozen: true });
    expect(res.status).toBe(403);
  });

  it('rejects a non-boolean frozen field', async () => {
    const res = await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: 'yes' });
    expect(res.status).toBe(400);
  });

  it('a Platform Owner can freeze and unfreeze, and it is reflected in GET', async () => {
    const freeze = await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true, reason: 'Investigating a bad apply.' });
    expect(freeze.status).toBe(200);

    const get1 = await request(app).get('/api/admin/evolution/freeze').set(auth(OWNER));
    expect(get1.body.frozen).toBe(true);
    expect(get1.body.reason).toBe('Investigating a bad apply.');
    expect(get1.body.frozenBy).toBe(OWNER);

    const unfreeze = await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: false });
    expect(unfreeze.status).toBe(200);
    const get2 = await request(app).get('/api/admin/evolution/freeze').set(auth(OWNER));
    expect(get2.body.frozen).toBe(false);
  });

  it('is itself audit-logged', async () => {
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(logs.body.logs.find((l: any) => l.action === 'freeze_evolution_engine')).toBeTruthy();
  });
});

describe('a real freeze actually blocks mutating Evolution Engine routes', () => {
  const seedFeature = () => seedDoc('platform_feature_registry/energy_budget', {
    displayName: 'Energy Budget', description: 'x', lifecycleState: 'live', enforcementState: 'unknown',
    featureFlag: null, dataZones: [], dependencies: [], downstreamConsumers: [], requiredConnectors: [],
    requiredPermissions: [], productOwner: null, technicalOwner: null, entitlementRequirement: null,
    minAppVersion: null, fallbackMode: null, rollbackMethod: null, expectedFlagRetirement: null, notes: null,
    createdAt: '2026-01-01T00:00:00.000Z', lastChangedAt: '2026-01-01T00:00:00.000Z',
  });

  it('blocks a requireEvolutionAccess-gated mutation (registry upsert) with 423', async () => {
    seedFeature();
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(PLATFORM_ADMIN)).send({
      featureId: 'energy_budget', displayName: 'Energy Budget', description: 'x',
      lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    expect(res.status).toBe(423);
  });

  it('blocks a requirePlatformOwner-gated mutation (Protected Core upsert) with 423, even for the owner', async () => {
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    const res = await request(app).post('/api/admin/evolution/protected-core').set(auth(OWNER)).send({
      invariantId: 'private_data_default_deny', title: 'X', rule: 'x', scope: 'x',
      requiredApproval: 'owner_only', testStatus: 'machine_tested', evidence: 'x', allowedChangeProcess: 'x',
    });
    expect(res.status).toBe(423);
  });

  it('never blocks a read, even while frozen', async () => {
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    const res = await request(app).get('/api/admin/evolution/registry').set(auth(PLATFORM_ADMIN));
    expect(res.status).toBe(200);
  });

  it('a 403 still wins over a 423 - access is checked first', async () => {
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(NOT_ADMIN)).send({ featureId: 'x' });
    expect(res.status).toBe(403);
  });

  it('unfreezing restores the ability to mutate', async () => {
    seedFeature();
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: true });
    await request(app).post('/api/admin/evolution/freeze').set(auth(OWNER)).send({ frozen: false });
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(PLATFORM_ADMIN)).send({
      featureId: 'energy_budget', displayName: 'Energy Budget', description: 'x',
      lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    expect(res.status).toBe(200);
  });
});
