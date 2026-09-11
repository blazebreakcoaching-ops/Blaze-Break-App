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
const OTHER_ORG = 'org_2';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[] } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/connectors — RBAC', () => {
  it('a viewer cannot create a connector', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('viewer_1')).send({ type: 'slack', displayName: 'Slack' });
    expect(res.status).toBe(403);
  });

  it('a member cannot create a connector', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('member_1')).send({ type: 'slack', displayName: 'Slack' });
    expect(res.status).toBe(403);
  });

  it('a billing_admin or security_admin cannot create a connector - only connector_admin/admin/owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'billing_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'billing_1', 'billing_admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    expect((await request(app).post(`/api/org/${ORG}/connectors`).set(auth('billing_1')).send({ type: 'slack', displayName: 'Slack' })).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/connectors`).set(auth('sec_1')).send({ type: 'slack', displayName: 'Slack' })).status).toBe(403);
  });

  it('connector_admin, admin, and owner can each create a connector', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'conn_1', 'connector_admin');
    expect((await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Owner Slack' })).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/connectors`).set(auth('admin_1')).send({ type: 'jira', displayName: 'Admin Jira' })).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/connectors`).set(auth('conn_1')).send({ type: 'asana', displayName: 'Connector Admin Asana' })).status).toBe(200);
  });

  it('a stranger with no role in the org cannot create a connector', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('stranger')).send({ type: 'slack', displayName: 'Slack' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/connectors — validation and honest status', () => {
  it('rejects an unknown connector type', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'salesforce', displayName: 'Salesforce' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing displayName', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack' });
    expect(res.status).toBe(400);
  });

  it('an OAuth-backed connector (slack) is created with authStatus not_connected, never connected', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });
    expect(res.status).toBe(200);
    expect(res.body.connector.authStatus).toBe('not_connected');
  });

  it('a local connector is created with authStatus not_applicable, not connected', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'local', displayName: 'Uploaded docs' });
    expect(res.status).toBe(200);
    expect(res.body.connector.authStatus).toBe('not_applicable');
  });
});

describe('GET /api/org/:orgId/connectors — detail redaction', () => {
  it('a viewer sees status but not configuredBy/lastError detail', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });

    const res = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('viewer_1'));
    expect(res.status).toBe(200);
    expect(res.body.connectors.length).toBe(1);
    expect(res.body.connectors[0].status).toBe('active');
    expect(res.body.connectors[0].configuredBy).toBeUndefined();
  });

  it('a connector_admin sees full detail including configuredBy', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'conn_1', 'connector_admin');
    await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });

    const res = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('conn_1'));
    expect(res.status).toBe(200);
    expect(res.body.connectors[0].configuredBy).toBe('owner_1');
  });

  it('a member with no connectors.view permission cannot list connectors', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });
});

describe('connector lifecycle: enable/disable/revoke/reindex', () => {
  async function seedConnector(): Promise<string> {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });
    return res.body.connector.id;
  }

  it('disable then enable round-trips status correctly', async () => {
    const id = await seedConnector();
    const disableRes = await request(app).post(`/api/org/${ORG}/connectors/${id}/disable`).set(auth('owner_1'));
    expect(disableRes.status).toBe(200);
    let listRes = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('owner_1'));
    expect(listRes.body.connectors[0].status).toBe('disabled');
    expect(listRes.body.connectors[0].enabled).toBe(false);

    const enableRes = await request(app).post(`/api/org/${ORG}/connectors/${id}/enable`).set(auth('owner_1'));
    expect(enableRes.status).toBe(200);
    listRes = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('owner_1'));
    expect(listRes.body.connectors[0].status).toBe('active');
  });

  it('revoke resets status to revoked and authStatus back to its honest starting point', async () => {
    const id = await seedConnector();
    const res = await request(app).post(`/api/org/${ORG}/connectors/${id}/revoke`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const listRes = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('owner_1'));
    expect(listRes.body.connectors[0].status).toBe('revoked');
    expect(listRes.body.connectors[0].authStatus).toBe('not_connected');
    expect(listRes.body.connectors[0].enabled).toBe(false);
  });

  it('reindex marks a job pending but is explicit that nothing processes it yet', async () => {
    const id = await seedConnector();
    const res = await request(app).post(`/api/org/${ORG}/connectors/${id}/reindex`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.reindexStatus).toBe('pending');
    expect(res.body.note).toMatch(/not yet/i);
  });

  it('a viewer cannot disable, enable, revoke, or reindex a connector', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    const createRes = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });
    const id = createRes.body.connector.id;

    expect((await request(app).post(`/api/org/${ORG}/connectors/${id}/disable`).set(auth('viewer_1'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/connectors/${id}/enable`).set(auth('viewer_1'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/connectors/${id}/revoke`).set(auth('viewer_1'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/connectors/${id}/reindex`).set(auth('viewer_1'))).status).toBe(403);
  });

  it('acting on a nonexistent connector id returns 404', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/connectors/does_not_exist/disable`).set(auth('owner_1'));
    expect(res.status).toBe(404);
  });
});

describe('tenant isolation', () => {
  it("org A's admin cannot see or act on org B's connector", async () => {
    seedOrg(ORG, { adminUids: ['owner_a'], memberUids: ['owner_a'] });
    seedMember(ORG, 'owner_a', 'owner');
    seedOrg(OTHER_ORG, { adminUids: ['owner_b'], memberUids: ['owner_b'] });
    seedMember(OTHER_ORG, 'owner_b', 'owner');

    const createRes = await request(app).post(`/api/org/${OTHER_ORG}/connectors`).set(auth('owner_b')).send({ type: 'slack', displayName: 'Org B Slack' });
    const orgBConnectorId = createRes.body.connector.id;

    // owner_a has no role in org B at all, so acting via org B's own path is forbidden...
    const crossOrgAction = await request(app).post(`/api/org/${OTHER_ORG}/connectors/${orgBConnectorId}/disable`).set(auth('owner_a'));
    expect(crossOrgAction.status).toBe(403);

    // ...and org B's connector never appears when org A lists its own connectors.
    const orgAList = await request(app).get(`/api/org/${ORG}/connectors`).set(auth('owner_a'));
    expect(orgAList.body.connectors.length).toBe(0);
  });
});

describe('audit logging', () => {
  it('records create, disable, and revoke as separate audit entries', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const createRes = await request(app).post(`/api/org/${ORG}/connectors`).set(auth('owner_1')).send({ type: 'slack', displayName: 'Slack' });
    const id = createRes.body.connector.id;
    await request(app).post(`/api/org/${ORG}/connectors/${id}/disable`).set(auth('owner_1'));
    await request(app).post(`/api/org/${ORG}/connectors/${id}/revoke`).set(auth('owner_1'));

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const actions = res.body.logs.map((l: any) => l.action);
    expect(actions).toContain('create_connector');
    expect(actions).toContain('disable_connector');
    expect(actions).toContain('revoke_connector');
  });
});
