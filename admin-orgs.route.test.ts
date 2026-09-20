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
import { getDocRaw, resetStore } from './test/fake-firestore';

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
