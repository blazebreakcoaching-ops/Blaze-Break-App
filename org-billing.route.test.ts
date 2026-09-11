import { describe, it, expect, beforeEach, vi } from 'vitest';

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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; billing?: any; joinCode?: string } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    joinCode: opts.joinCode || 'ABC123',
    ...(opts.billing ? { billing: opts.billing } : {}),
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/billing — default state', () => {
  it('a fresh org reports the free-plan default', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.billing.plan).toBe('free');
    expect(res.body.billing.seatCount).toBe(5);
    expect(res.body.provider).toBe('null');
  });

  it('a viewer can read billing state', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('viewer_1'));
    expect(res.status).toBe(200);
  });

  it('a stranger with no role cannot read billing state', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/billing`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/billing — RBAC boundary', () => {
  const validUpdate = { plan: 'business', status: 'active', seatCount: 50, billingContact: 'finance@org.com' };

  it('a member or viewer cannot change billing', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    seedMember(ORG, 'viewer_1', 'viewer');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('member_1')).send(validUpdate)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('viewer_1')).send(validUpdate)).status).toBe(403);
  });

  it('connector_admin and security_admin cannot touch billing - it is not their domain', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'conn_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'conn_1', 'connector_admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('conn_1')).send(validUpdate)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('sec_1')).send(validUpdate)).status).toBe(403);
  });

  it('billing_admin cannot manage connectors or security - RBAC is a two-way boundary', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'billing_1', 'billing_admin');
    const connectorRes = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('billing_1')).send({ type: 'slack', displayName: 'Slack' });
    expect(connectorRes.status).toBe(403);
    const dataPolicyRes = await request(app).post(`/api/org/${ORG}/data-policy`).set(auth('billing_1')).send({ allowModelTraining: true, allowProductAnalytics: false, allowContentRetentionForDebugging: false, retentionPeriodDays: 30 });
    expect(dataPolicyRes.status).toBe(403);
  });

  it('billing_admin, admin, and owner can each change billing', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'billing_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'billing_1', 'billing_admin');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send(validUpdate)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('admin_1')).send(validUpdate)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('billing_1')).send(validUpdate)).status).toBe(200);
  });
});

describe('POST /api/org/:orgId/billing — validation and provider-field lockdown', () => {
  it('rejects an unknown plan or out-of-range seatCount', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'ultra', status: 'active', seatCount: 10 })).status).toBe(400);
    expect((await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 0 })).status).toBe(400);
  });

  it('ignores any providerCustomerId/providerSubscriptionId sent in the request body - only a real provider integration can set those', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({
      plan: 'business', status: 'active', seatCount: 10,
      providerCustomerId: 'cus_fake123', providerSubscriptionId: 'sub_fake456',
    });
    expect(res.status).toBe(200);
    expect(res.body.billing.providerCustomerId).toBeNull();
    expect(res.body.billing.providerSubscriptionId).toBeNull();
  });
});

describe('seat-limit enforcement on invites', () => {
  it('an invite that fits within the seat allowance succeeds', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'starter', status: 'active', seatCount: 5 } });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });
    expect(res.status).toBe(200);
  });

  it('an invite that would exceed the seat allowance is rejected before sending', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'm2', 'm3', 'm4'], billing: { plan: 'free', status: 'active', seatCount: 5 } });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/seats/);

    const invitesRes = await request(app).get(`/api/org/${ORG}/invites`).set(auth('owner_1'));
    expect(invitesRes.body.invites.length).toBe(0);
  });

  it('pending invites count toward the seat limit, not just active members', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], billing: { plan: 'free', status: 'active', seatCount: 3 } });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com', 'b@example.com'] });

    const res = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['c@example.com'] });
    expect(res.status).toBe(400);
  });

  it('raising seatCount via the billing route allows a previously-blocked invite to succeed', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'm2', 'm3'], billing: { plan: 'free', status: 'active', seatCount: 3 } });
    seedMember(ORG, 'owner_1', 'owner');

    const blocked = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });
    expect(blocked.status).toBe(400);

    await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 10 });

    const allowed = await request(app).post(`/api/org/${ORG}/invite`).set(auth('owner_1')).send({ emails: ['a@example.com'] });
    expect(allowed.status).toBe(200);
  });
});

describe('audit logging', () => {
  it('records a real before/after diff when billing changes', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/billing`).set(auth('owner_1')).send({ plan: 'business', status: 'active', seatCount: 50, billingContact: 'finance@org.com' });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'update_billing');
    expect(entry).toBeTruthy();
    expect(entry.before.plan).toBe('free');
    expect(entry.after.plan).toBe('business');
    expect(entry.after.seatCount).toBe(50);
  });
});
