import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for the org data-use policy routes. The most important
// property under test: a freshly created org that has NEVER touched this
// endpoint still reports allowModelTraining: false - the default is real,
// not just a value some admin has to remember to set.
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
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; dataPolicy?: any } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    ...(opts.dataPolicy ? { dataPolicy: opts.dataPolicy } : {}),
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

const fullPolicy = {
  allowModelTraining: false,
  allowProductAnalytics: true,
  allowContentRetentionForDebugging: false,
  retentionPeriodDays: 14,
};

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/data-policy — default is no training', () => {
  it('a brand new org that has never touched this returns allowModelTraining: false by default', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/data-policy`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.policy).toEqual({
      allowModelTraining: false,
      allowProductAnalytics: false,
      allowContentRetentionForDebugging: false,
      retentionPeriodDays: 30,
    });
  });

  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/data-policy`);
    expect(res.status).toBe(401);
  });

  it('a viewer can read the policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const res = await request(app).get(`/api/org/${ORG}/data-policy`).set(auth('viewer_1'));
    expect(res.status).toBe(200);
  });

  it('a stranger with no role in the org cannot read it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/data-policy`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/data-policy — RBAC', () => {
  it('a viewer cannot change the policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const res = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('viewer_1')).send(fullPolicy);
    expect(res.status).toBe(403);
  });

  it('a member cannot change the policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('member_1')).send(fullPolicy);
    expect(res.status).toBe(403);
  });

  it('a connector_admin or billing_admin cannot change the policy - only security_admin/admin/owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'connector_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'connector_1', 'connector_admin');
    seedMember(ORG, 'billing_1', 'billing_admin');
    expect((await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('connector_1')).send(fullPolicy)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('billing_1')).send(fullPolicy)).status).toBe(403);
  });

  it('security_admin, admin, and owner can each change the policy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    expect((await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('owner_1')).send(fullPolicy)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('admin_1')).send(fullPolicy)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('sec_1')).send(fullPolicy)).status).toBe(200);
  });
});

describe('POST /api/org/:orgId/data-policy — validation', () => {
  it('rejects a missing field rather than silently defaulting it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const { allowModelTraining, ...incomplete } = fullPolicy;
    const res = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('owner_1')).send(incomplete);
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-range retentionPeriodDays', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('owner_1')).send({ ...fullPolicy, retentionPeriodDays: 0 });
    expect(res.status).toBe(400);
  });

  it('an owner CAN explicitly enable model training if they choose to - this is a real, honest toggle, not a hidden always-off switch', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app)
      .post(`/api/org/${ORG}/data-policy`)
      .set(auth('owner_1'))
      .send({ ...fullPolicy, allowModelTraining: true });
    expect(res.status).toBe(200);
    expect(res.body.policy.allowModelTraining).toBe(true);
    const getRes = await request(app).get(`/api/org/${ORG}/data-policy`).set(auth('owner_1'));
    expect(getRes.body.policy.allowModelTraining).toBe(true);
  });
});

describe('audit logging', () => {
  it('records a real before/after diff when the policy changes', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('owner_1')).send(fullPolicy);

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    expect(res.body.logs.length).toBe(1);
    const entry = res.body.logs[0];
    expect(entry.action).toBe('update_data_policy');
    expect(entry.before.allowModelTraining).toBe(false);
    expect(entry.after.allowProductAnalytics).toBe(true);
  });
});
