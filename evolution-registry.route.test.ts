import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Evolution Engine's canonical feature registry
// (platform_feature_registry) - Evolution Engine PR1. Covers the real
// access boundary (narrower than requireAdmin - see
// admin-roles.ts's EVOLUTION_ENGINE_ROLES) and the seed migration's
// create-if-absent safety property (never clobbers a manual edit).
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t,
      email: `${t}@test.dev`,
      role: t === 'owner_1' ? 'platform_owner' : t === 'support_1' ? 'support_admin' : undefined,
    }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const OWNER = 'owner_1'; // platform_owner - an EVOLUTION_ENGINE_ROLES member
const SUPPORT_ADMIN = 'support_1'; // a real platform admin role, but NOT in EVOLUTION_ENGINE_ROLES
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/registry', () => {
  it('requires an Evolution Engine role, not just any admin role', async () => {
    expect((await request(app).get('/api/admin/evolution/registry').set(auth(NOT_ADMIN))).status).toBe(403);
    // support_admin is a real platform-staff role but deliberately excluded
    // from the narrower Evolution Engine boundary.
    expect((await request(app).get('/api/admin/evolution/registry').set(auth(SUPPORT_ADMIN))).status).toBe(403);
  });

  it('lists seeded entries for an Evolution Engine role', async () => {
    seedDoc('platform_feature_registry/nova_overload_shield', {
      displayName: 'Nova Overload Shield', description: 'x', lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    const res = await request(app).get('/api/admin/evolution/registry').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].featureId).toBe('nova_overload_shield');
  });
});

describe('POST /api/admin/evolution/registry', () => {
  it('requires an Evolution Engine role', async () => {
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(SUPPORT_ADMIN)).send({
      featureId: 'nova_overload_shield', displayName: 'X', description: 'x', lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid payload (e.g. bad lifecycleState)', async () => {
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(OWNER)).send({
      featureId: 'nova_overload_shield', displayName: 'X', description: 'x', lifecycleState: 'enabled', enforcementState: 'fully_enforced',
    });
    expect(res.status).toBe(400);
  });

  it('creates a new entry and logs the admin action', async () => {
    const res = await request(app).post('/api/admin/evolution/registry').set(auth(OWNER)).send({
      featureId: 'nova_overload_shield', displayName: 'Nova Overload Shield', description: 'x',
      lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    expect(res.status).toBe(200);
    const doc = getDocRaw('platform_feature_registry/nova_overload_shield');
    expect(doc?.displayName).toBe('Nova Overload Shield');
    expect(doc?.createdAt).toBeTruthy();

    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(logs.body.logs.find((l: any) => l.action === 'update_feature_registry')).toBeTruthy();
  });

  it('updating an existing entry preserves its original createdAt', async () => {
    seedDoc('platform_feature_registry/nova_overload_shield', {
      displayName: 'Old Name', description: 'x', lifecycleState: 'live', enforcementState: 'unknown', createdAt: '2020-01-01T00:00:00.000Z',
    });
    await request(app).post('/api/admin/evolution/registry').set(auth(OWNER)).send({
      featureId: 'nova_overload_shield', displayName: 'New Name', description: 'x', lifecycleState: 'live', enforcementState: 'fully_enforced',
    });
    const doc = getDocRaw('platform_feature_registry/nova_overload_shield');
    expect(doc?.displayName).toBe('New Name');
    expect(doc?.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('POST /api/admin/evolution/registry/seed', () => {
  it('requires an Evolution Engine role', async () => {
    const res = await request(app).post('/api/admin/evolution/registry/seed').set(auth(SUPPORT_ADMIN));
    expect(res.status).toBe(403);
  });

  it('creates entries for the real legacy registry and flag data, with a nonzero total', async () => {
    const res = await request(app).post('/api/admin/evolution/registry/seed').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.created).toBeGreaterThan(20);
    expect(res.body.skipped).toBe(0);

    const list = await request(app).get('/api/admin/evolution/registry').set(auth(OWNER));
    expect(list.body.entries.length).toBe(res.body.total);
    const shield = list.body.entries.find((e: any) => e.featureId === 'nova_overload_shield');
    expect(shield.enforcementState).toBe('fully_enforced');
    expect(shield.lifecycleState).toBe('live');
  });

  it('is idempotent and never clobbers a manually edited entry on re-run', async () => {
    await request(app).post('/api/admin/evolution/registry/seed').set(auth(OWNER));
    // Manually edit one seeded entry.
    await request(app).post('/api/admin/evolution/registry').set(auth(OWNER)).send({
      featureId: 'nova_overload_shield', displayName: 'Manually Renamed', description: 'manual edit',
      lifecycleState: 'live', enforcementState: 'fully_enforced', notes: 'edited by hand',
    });

    const res2 = await request(app).post('/api/admin/evolution/registry/seed').set(auth(OWNER));
    expect(res2.body.created).toBe(0);
    expect(res2.body.skipped).toBe(res2.body.total);

    const doc = getDocRaw('platform_feature_registry/nova_overload_shield');
    expect(doc?.displayName).toBe('Manually Renamed');
    expect(doc?.notes).toBe('edited by hand');
  });
});
