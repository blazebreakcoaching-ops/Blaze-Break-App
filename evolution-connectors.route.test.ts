import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the Connector Layer (Evolution Engine PR3) - a
// read-only platform-wide view unifying platform-dependency "configured"
// booleans with real cross-org connector data (org-connectors.ts).
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

describe('GET /api/admin/evolution/connectors', () => {
  it('requires an Evolution Engine role', async () => {
    const res = await request(app).get('/api/admin/evolution/connectors').set(auth(NOT_ADMIN));
    expect(res.status).toBe(403);
  });

  it('always includes every platform dependency, even with none configured', async () => {
    const res = await request(app).get('/api/admin/evolution/connectors').set(auth(OWNER));
    expect(res.status).toBe(200);
    const platform = res.body.connectors.filter((c: any) => c.scope === 'platform');
    expect(platform.length).toBeGreaterThanOrEqual(6);
    const twilio = platform.find((c: any) => c.connectorId === 'twilio');
    expect(twilio.status).toBe('not_configured');
  });

  it('aggregates real connectors across every organisation, with the owning orgId attached', async () => {
    seedDoc('organisations/org_a/connectors/conn_1', { type: 'slack', displayName: 'Slack', status: 'active', authStatus: 'not_connected', isLocal: false, configuredBy: 'uid_a' });
    seedDoc('organisations/org_b/connectors/conn_2', { type: 'local', displayName: 'Local document upload', status: 'active', authStatus: 'not_applicable', isLocal: true });

    const res = await request(app).get('/api/admin/evolution/connectors').set(auth(OWNER));
    const orgConnectors = res.body.connectors.filter((c: any) => c.scope === 'organisation');
    expect(orgConnectors).toHaveLength(2);
    const slack = orgConnectors.find((c: any) => c.connectorId === 'conn_1');
    expect(slack.orgId).toBe('org_a');
    expect(slack.owner).toBe('uid_a');
    expect(slack.mutationAllowed).toBe(false);
    const local = orgConnectors.find((c: any) => c.connectorId === 'conn_2');
    expect(local.orgId).toBe('org_b');
  });

  it('returns no org connectors when none have been registered anywhere - an honest empty list, not an error', async () => {
    const res = await request(app).get('/api/admin/evolution/connectors').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.connectors.filter((c: any) => c.scope === 'organisation')).toEqual([]);
  });
});
