import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Change Proposal workflow (Evolution Engine PR8).
// Governance Tier behaviour (who can decide what) is unit-tested
// exhaustively in change-proposals.test.ts - these tests focus on the
// route wiring: creation deriving a real tier from real target data,
// status transitions, and the deliberate Protected Core apply refusal.
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
      role: t === 'owner_1' ? 'platform_owner' : t === 'admin_1' ? 'platform_admin' : t === 'security_1' ? 'security_admin' : undefined,
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

const OWNER = 'owner_1';
const PLATFORM_ADMIN = 'admin_1';
const SECURITY_ADMIN = 'security_1'; // real Evolution Engine access, but not the proposer and not Platform Owner
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

const seedLiveFeature = () => seedDoc('platform_feature_registry/energy_budget', {
  displayName: 'Energy Budget', description: 'x', lifecycleState: 'live', enforcementState: 'unknown',
  featureFlag: null, dataZones: [], dependencies: [], downstreamConsumers: [], requiredConnectors: [],
  requiredPermissions: [], productOwner: null, technicalOwner: null, entitlementRequirement: null,
  minAppVersion: null, fallbackMode: null, rollbackMethod: null, expectedFlagRetirement: null, notes: null,
  createdAt: '2026-01-01T00:00:00.000Z', lastChangedAt: '2026-01-01T00:00:00.000Z',
});

const seedOwnerOnlyInvariant = () => seedDoc('platform_protected_core/private_data_default_deny', {
  title: 'Default Deny', rule: 'x', scope: 'x', requiredApproval: 'owner_only',
  testStatus: 'machine_tested', evidence: 'x', allowedChangeProcess: 'x',
});

describe('POST /api/admin/evolution/change-proposals', () => {
  it('requires Evolution Engine access', async () => {
    const res = await request(app).post('/api/admin/evolution/change-proposals').set(auth(NOT_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: {},
    });
    expect(res.status).toBe(403);
  });

  it('400s when the target does not exist', async () => {
    const res = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'does_not_exist', title: 'x', rationale: 'x', proposedChanges: {},
    });
    expect(res.status).toBe(400);
  });

  it('derives platform_admin_review for a live feature registry target, and starts as draft', async () => {
    seedLiveFeature();
    const res = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget',
      title: 'Mark fully enforced', rationale: 'Verified at App.tsx:123.',
      proposedChanges: { enforcementState: 'fully_enforced' },
    });
    expect(res.status).toBe(200);
    expect(res.body.requiredApproval).toBe('platform_admin_review');
    expect(res.body.status).toBe('draft');
  });

  it('uses the real Protected Core invariant\'s own requiredApproval for a protected_core target', async () => {
    seedOwnerOnlyInvariant();
    const res = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'protected_core', targetId: 'private_data_default_deny',
      title: 'Loosen scope', rationale: 'x', proposedChanges: { scope: 'y' },
    });
    expect(res.status).toBe(200);
    expect(res.body.requiredApproval).toBe('owner_only');
  });
});

describe('change proposal lifecycle (submit/decide/withdraw)', () => {
  it('cannot be decided before it is submitted', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    const decide = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/decide`).set(auth(OWNER)).send({ approve: true });
    expect(decide.status).toBe(400);
  });

  it('a platform_admin can approve a platform_admin_review-tier proposal once submitted', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/submit`).set(auth(PLATFORM_ADMIN));
    const decide = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/decide`).set(auth(PLATFORM_ADMIN)).send({ approve: true, notes: 'looks right' });
    expect(decide.status).toBe(200);
    expect(decide.body.status).toBe('approved');
  });

  it('a non-admin cannot decide even a submitted proposal', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/submit`).set(auth(PLATFORM_ADMIN));
    const decide = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/decide`).set(auth(NOT_ADMIN)).send({ approve: true });
    expect(decide.status).toBe(403);
  });

  it('only the proposer or a Platform Owner can withdraw', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    // SECURITY_ADMIN has real Evolution Engine access (so it passes
    // requireEvolutionAccess) but is neither the proposer (PLATFORM_ADMIN)
    // nor a Platform Owner - this exercises the ownership check itself,
    // not just the baseline access gate.
    const badWithdraw = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/withdraw`).set(auth(SECURITY_ADMIN));
    expect(badWithdraw.status).toBe(403);
    const ownerWithdraw = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/withdraw`).set(auth(OWNER));
    expect(ownerWithdraw.status).toBe(200);
  });
});

describe('POST /api/admin/evolution/change-proposals/:id/apply', () => {
  it('applies an approved feature_registry proposal to the real registry entry', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/submit`).set(auth(PLATFORM_ADMIN));
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/decide`).set(auth(PLATFORM_ADMIN)).send({ approve: true });

    const apply = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/apply`).set(auth(PLATFORM_ADMIN));
    expect(apply.status).toBe(200);

    const doc = getDocRaw('platform_feature_registry/energy_budget');
    expect(doc?.enforcementState).toBe('fully_enforced');

    const list = await request(app).get('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN));
    expect(list.body.proposals.find((p: any) => p.proposalId === create.body.proposalId)?.status).toBe('applied');
  });

  it('refuses to auto-apply a protected_core proposal even once approved', async () => {
    seedOwnerOnlyInvariant();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(OWNER)).send({
      targetType: 'protected_core', targetId: 'private_data_default_deny', title: 'x', rationale: 'x', proposedChanges: { scope: 'y' },
    });
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/submit`).set(auth(OWNER));
    await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/decide`).set(auth(OWNER)).send({ approve: true });

    const apply = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/apply`).set(auth(OWNER));
    expect(apply.status).toBe(400);
    expect(apply.body.error).toMatch(/not auto-applied/);

    const doc = getDocRaw('platform_protected_core/private_data_default_deny');
    expect(doc?.scope).toBe('x'); // unchanged
  });

  it('refuses to apply before approval', async () => {
    seedLiveFeature();
    const create = await request(app).post('/api/admin/evolution/change-proposals').set(auth(PLATFORM_ADMIN)).send({
      targetType: 'feature_registry', targetId: 'energy_budget', title: 'x', rationale: 'x', proposedChanges: { enforcementState: 'fully_enforced' },
    });
    const apply = await request(app).post(`/api/admin/evolution/change-proposals/${create.body.proposalId}/apply`).set(auth(PLATFORM_ADMIN));
    expect(apply.status).toBe(400);
  });
});
