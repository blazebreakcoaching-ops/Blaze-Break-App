import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST /api/admin/knowledge-chunks - previously zero
// coverage of any kind. Stores Nova's knowledge base chunks as a single
// app_config doc, the same pattern as nova-settings/content-library.
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
import { getDocRaw, resetStore, forceDocError } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('POST /api/admin/knowledge-chunks', () => {
  it('requires the nova.manage permission', async () => {
    const res = await request(app).post('/api/admin/knowledge-chunks').set(auth(NOT_ADMIN)).send({ chunks: [] });
    expect(res.status).toBe(403);
  });

  it('stores the chunks and is audit-logged', async () => {
    const chunks = [{ id: 'c1', text: 'Nova is a coach, not a therapist.' }];
    const res = await request(app).post('/api/admin/knowledge-chunks').set(auth(OWNER)).send({ chunks });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const stored = getDocRaw('app_config/knowledge_chunks');
    expect(stored?.chunks).toEqual(chunks);

    const logs = await request(app).get('/api/admin/audit-logs').set(auth(OWNER));
    expect(logs.body.logs.find((l: any) => l.action === 'manage_knowledge_chunks')).toBeTruthy();
  });

  // The defensive catch block behind the happy path above.
  it('returns a generic 500 and logs the real error when the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('app_config/knowledge_chunks', 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/admin/knowledge-chunks').set(auth(OWNER)).send({ chunks: [] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
