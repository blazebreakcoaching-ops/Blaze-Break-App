import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/admin/orgs - specifically the orgId format
// validation. orgId is used directly as a Firestore document ID and was
// previously taken from the request body with no server-side validation
// at all (the client sanitizes it, but the server trusted that entirely).
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

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
import { getDocRaw, resetStore, seedDoc } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('POST /api/admin/orgs — orgId validation', () => {
  it('requires admin', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(NOT_ADMIN)).send({ orgId: 'valid-org', name: 'Valid Org' });
    expect(res.status).toBe(500); // requireAdmin throws, caught by the generic 500 handler in this route
  });

  it('accepts a valid lowercase-alphanumeric-hyphen orgId', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'acme-corp-1', name: 'Acme Corp' });
    expect(res.status).toBe(200);
    expect(getDocRaw('organisations/acme-corp-1')?.name).toBe('Acme Corp');
  });

  it('rejects an orgId containing uppercase letters', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'Acme-Corp', name: 'Acme Corp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/orgId/i);
  });

  it('rejects an orgId containing a slash (path traversal shape)', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'acme/../other', name: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects an orgId containing spaces or special characters', async () => {
    const res1 = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'acme corp', name: 'x' });
    expect(res1.status).toBe(400);
    const res2 = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'acme_corp!', name: 'x' });
    expect(res2.status).toBe(400);
  });

  it('rejects an empty orgId', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: '', name: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string orgId', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 12345, name: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects an orgId over 100 characters', async () => {
    const res = await request(app).post('/api/admin/orgs').set(auth(OWNER)).send({ orgId: 'a'.repeat(101), name: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/orgs', () => {
  it('returns createdAt as a usable ISO string, not a raw Timestamp-shaped object', async () => {
    seedDoc('organisations/acme', { name: 'Acme', joinCode: 'ABC123', createdAt: '2026-01-01T00:00:00.000Z' });
    const res = await request(app).get('/api/admin/orgs').set(auth(OWNER));
    expect(res.status).toBe(200);
    const org = res.body.orgs.find((o: any) => o.id === 'acme');
    expect(org.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(new Date(org.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('reports the effective billing plan, defaulting to free when none is set', async () => {
    seedDoc('organisations/acme', { name: 'Acme', joinCode: 'ABC123' });
    seedDoc('organisations/globex', { name: 'Globex', joinCode: 'XYZ789', billing: { plan: 'enterprise', status: 'active', seatCount: 500 } });
    const res = await request(app).get('/api/admin/orgs').set(auth(OWNER));
    const byId = Object.fromEntries(res.body.orgs.map((o: any) => [o.id, o]));
    expect(byId.acme.billingPlan).toBe('free');
    expect(byId.globex.billingPlan).toBe('enterprise');
  });
});

describe('GET /api/admin/orgs/:orgId', () => {
  it('requires admin', async () => {
    const res = await request(app).get('/api/admin/orgs/acme').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('returns 404 for a non-existent org', async () => {
    const res = await request(app).get('/api/admin/orgs/does-not-exist').set(auth(OWNER));
    expect(res.status).toBe(404);
  });

  it('returns org metadata, billing state, and access-control-only member fields', async () => {
    seedDoc('organisations/acme', {
      name: 'Acme', joinCode: 'ABC123', privacyThreshold: 7,
      billing: { plan: 'business', status: 'active', seatCount: 50, billingContact: 'ops@acme.test' },
    });
    seedDoc('organisations/acme/members/member_1', { email: 'alice@acme.test', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' });
    const res = await request(app).get('/api/admin/orgs/acme').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 'acme',
      name: 'Acme',
      privacyThreshold: 7,
      billing: { plan: 'business', status: 'active', seatCount: 50, billingContact: 'ops@acme.test' },
    });
    expect(res.body.members).toEqual([
      { uid: 'member_1', email: 'alice@acme.test', role: 'owner', status: 'active', joinedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    // No wellbeing-content field (journal/mood/fingerprint/etc.) is ever
    // returned for a member - only access-control fields.
    const memberKeys = Object.keys(res.body.members[0]);
    expect(memberKeys.sort()).toEqual(['email', 'joinedAt', 'role', 'status', 'uid']);
  });
});
