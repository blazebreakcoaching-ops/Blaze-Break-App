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

const validConfig = { providerType: 'oidc', issuer: 'https://idp.example.com', clientId: 'client-123' };

beforeEach(() => {
  resetStore();
  delete process.env.SSO_CONFIG_ENCRYPTION_KEY;
});

describe('GET /api/org/:orgId/sso', () => {
  it('reports not configured for a fresh org', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).get(`/api/org/${ORG}/sso`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('a viewer, member, billing_admin, and connector_admin all cannot read SSO config - only org.sso.manage holders can', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1', 'member_1', 'billing_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    seedMember(ORG, 'member_1', 'member');
    seedMember(ORG, 'billing_1', 'billing_admin');
    seedMember(ORG, 'conn_1', 'connector_admin');
    for (const uid of ['viewer_1', 'member_1', 'billing_1', 'conn_1']) {
      expect((await request(app).get(`/api/org/${ORG}/sso`).set(auth(uid))).status).toBe(403);
    }
  });

  it('security_admin, admin, and owner can read SSO config', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    for (const uid of ['owner_1', 'admin_1', 'sec_1']) {
      expect((await request(app).get(`/api/org/${ORG}/sso`).set(auth(uid))).status).toBe(200);
    }
  });
});

describe('POST /api/org/:orgId/sso — validation and RBAC', () => {
  it('a viewer or connector_admin cannot write SSO config', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'viewer_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'viewer_1', 'viewer');
    seedMember(ORG, 'conn_1', 'connector_admin');
    expect((await request(app).post(`/api/org/${ORG}/sso`).set(auth('viewer_1')).send(validConfig)).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/sso`).set(auth('conn_1')).send(validConfig)).status).toBe(403);
  });

  it('security_admin, admin, and owner can each write SSO config', async () => {
    seedOrg(ORG, { adminUids: ['owner_1', 'admin_1'], memberUids: ['owner_1', 'admin_1', 'sec_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'admin_1', 'admin');
    seedMember(ORG, 'sec_1', 'security_admin');
    expect((await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/sso`).set(auth('admin_1')).send(validConfig)).status).toBe(200);
    expect((await request(app).post(`/api/org/${ORG}/sso`).set(auth('sec_1')).send(validConfig)).status).toBe(200);
  });

  it('rejects an invalid config (unknown providerType)', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send({ ...validConfig, providerType: 'ldap' });
    expect(res.status).toBe(400);
  });

  it('rejects an inline clientSecret when SSO_CONFIG_ENCRYPTION_KEY is unset', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send({ ...validConfig, clientSecret: 's3cret' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/SSO_CONFIG_ENCRYPTION_KEY/);
  });

  it('accepts a secretRef even when SSO_CONFIG_ENCRYPTION_KEY is unset', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send({ ...validConfig, secretRef: 'vault://path/to/secret' });
    expect(res.status).toBe(200);
    expect(res.body.config.hasSecret).toBe(true);
    expect(res.body.config.secretRef).toBe('vault://path/to/secret');
  });
});

describe('POST /api/org/:orgId/sso — secret never leaks in a response', () => {
  it('an inline clientSecret is accepted, encrypted, and never appears verbatim in the response', async () => {
    process.env.SSO_CONFIG_ENCRYPTION_KEY = 'test-encryption-key-value';
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send({ ...validConfig, clientSecret: 'super-secret-value' });
    expect(res.status).toBe(200);
    expect(res.body.config.hasSecret).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-value');
    expect(res.body.config.encryptedSecret).toBeUndefined();

    const getRes = await request(app).get(`/api/org/${ORG}/sso`).set(auth('owner_1'));
    expect(JSON.stringify(getRes.body)).not.toContain('super-secret-value');
  });
});

describe('POST /api/org/:orgId/sso — never sets enforceSso itself', () => {
  it('writing config leaves enforceSso false, even across repeated writes', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);
    const res = await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send({ ...validConfig, issuer: 'https://idp2.example.com' });
    expect(res.body.config.enforceSso).toBe(false);
  });
});

describe('POST /api/org/:orgId/sso/enforce — the core guardrail', () => {
  it('cannot be enabled while the sso_enforcement feature flag is off (the default)', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);

    const res = await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: true });
    expect(res.status).toBe(403);

    const configRes = await request(app).get(`/api/org/${ORG}/sso`).set(auth('owner_1'));
    expect(configRes.body.config.enforceSso).toBe(false);
  });

  it('can be enabled once the platform feature flag is explicitly on', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true });
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);

    const res = await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.enforceSso).toBe(true);
  });

  it('disabling enforcement is never gated by the feature flag', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true });
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);
    await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: true });

    // Flag flips off after enforcement was already enabled - disabling must still always work.
    seedDoc('public_feature_flags/sso_enforcement', { enabled: false });
    const res = await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enforceSso).toBe(false);
  });

  it('refuses to enable enforcement before any SSO config exists', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true });
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: true });
    expect(res.status).toBe(400);
  });

  it('a connector_admin cannot enable enforcement', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true });
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'conn_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'conn_1', 'connector_admin');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);
    const res = await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('conn_1')).send({ enabled: true });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/org/:orgId/sso/test', () => {
  it('is explicit that this is not a real authentication handshake', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);
    const res = await request(app).post(`/api/org/${ORG}/sso/test`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.shapeValid).toBe(true);
    expect(res.body.metadataReachable).toBeNull();
    expect(res.body.note).toMatch(/not a real authentication handshake/);
  });

  it('rejects when no config exists yet', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/sso/test`).set(auth('owner_1'));
    expect(res.status).toBe(400);
  });
});

describe('audit logging', () => {
  it('records update_sso_config and enable/disable_sso_enforcement as separate entries', async () => {
    seedDoc('public_feature_flags/sso_enforcement', { enabled: true });
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/sso`).set(auth('owner_1')).send(validConfig);
    await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: true });
    await request(app).post(`/api/org/${ORG}/sso/enforce`).set(auth('owner_1')).send({ enabled: false });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const actions = res.body.logs.map((l: any) => l.action);
    expect(actions).toContain('update_sso_config');
    expect(actions).toContain('enable_sso_enforcement');
    expect(actions).toContain('disable_sso_enforcement');
  });
});
