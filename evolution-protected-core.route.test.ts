import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for Protected Core (Evolution Engine PR2) - viewing is
// gated like the rest of the Evolution Engine, but mutating an invariant
// is gated tighter: Platform Owner only, not the broader
// EVOLUTION_ENGINE_ROLES set.
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
      role: t === 'owner_1' ? 'platform_owner' : t === 'security_1' ? 'security_admin' : undefined,
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
const SECURITY_ADMIN = 'security_1'; // a real Evolution Engine role, but NOT Platform Owner
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/evolution/protected-core', () => {
  it('any Evolution Engine role can view', async () => {
    seedDoc('platform_protected_core/private_data_default_deny', { title: 'x', rule: 'x' });
    const res = await request(app).get('/api/admin/evolution/protected-core').set(auth(SECURITY_ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.invariants).toHaveLength(1);
  });

  it('a non-admin cannot view', async () => {
    const res = await request(app).get('/api/admin/evolution/protected-core').set(auth(NOT_ADMIN));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/evolution/protected-core', () => {
  it('a security_admin (real Evolution Engine role, but not Platform Owner) cannot mutate an invariant', async () => {
    const res = await request(app).post('/api/admin/evolution/protected-core').set(auth(SECURITY_ADMIN)).send({
      invariantId: 'private_data_default_deny', title: 'X', rule: 'x', scope: 'x',
      requiredApproval: 'owner_only', testStatus: 'machine_tested', evidence: 'x', allowedChangeProcess: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a payload with no evidence', async () => {
    const res = await request(app).post('/api/admin/evolution/protected-core').set(auth(OWNER)).send({
      invariantId: 'private_data_default_deny', title: 'X', rule: 'x', scope: 'x',
      requiredApproval: 'owner_only', testStatus: 'machine_tested', evidence: '', allowedChangeProcess: 'x',
    });
    expect(res.status).toBe(400);
  });

  it('a Platform Owner can create/update an invariant, and it is audit-logged', async () => {
    const res = await request(app).post('/api/admin/evolution/protected-core').set(auth(OWNER)).send({
      invariantId: 'private_data_default_deny', title: 'Default Deny', rule: 'x', scope: 'x',
      requiredApproval: 'owner_only', testStatus: 'machine_tested', evidence: 'firestore.rules:13', allowedChangeProcess: 'x',
    });
    expect(res.status).toBe(200);
    const doc = getDocRaw('platform_protected_core/private_data_default_deny');
    expect(doc?.title).toBe('Default Deny');

    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(logs.body.logs.find((l: any) => l.action === 'update_protected_core')).toBeTruthy();
  });
});

describe('POST /api/admin/evolution/protected-core/seed', () => {
  it('requires Platform Owner, not just any Evolution Engine role', async () => {
    const res = await request(app).post('/api/admin/evolution/protected-core/seed').set(auth(SECURITY_ADMIN));
    expect(res.status).toBe(403);
  });

  it('creates the real seed invariants', async () => {
    const res = await request(app).post('/api/admin/evolution/protected-core/seed').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.created).toBeGreaterThanOrEqual(6);
    expect(res.body.skipped).toBe(0);

    const list = await request(app).get('/api/admin/evolution/protected-core').set(auth(OWNER));
    const ids = list.body.invariants.map((e: any) => e.invariantId);
    expect(ids).toContain('organisation_privacy_isolation');
    expect(ids).toContain('guardian_alert_explicit_trigger_only');
    expect(ids).toContain('admin_role_grant_requires_platform_owner');
    expect(ids).toContain('admin_audit_log_write_integrity');
    expect(ids).toContain('entitlement_independent_of_feature_flags');
    expect(ids).toContain('private_data_default_deny');
  });

  it('is idempotent and never clobbers a manually edited invariant on re-run', async () => {
    await request(app).post('/api/admin/evolution/protected-core/seed').set(auth(OWNER));
    await request(app).post('/api/admin/evolution/protected-core').set(auth(OWNER)).send({
      invariantId: 'private_data_default_deny', title: 'Default Deny (reviewed)', rule: 'x', scope: 'x',
      requiredApproval: 'owner_only', testStatus: 'machine_tested', evidence: 'firestore.rules:13 - re-verified', allowedChangeProcess: 'x',
    });

    const res2 = await request(app).post('/api/admin/evolution/protected-core/seed').set(auth(OWNER));
    expect(res2.body.created).toBe(0);

    const doc = getDocRaw('platform_protected_core/private_data_default_deny');
    expect(doc?.title).toBe('Default Deny (reviewed)');
  });
});
