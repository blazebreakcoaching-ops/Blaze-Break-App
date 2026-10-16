import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET /api/admin/feedback - previously zero coverage of
// any kind. Reads the same feedback_submissions collection
// POST /api/feedback/submit writes to (covered separately in
// guardian-support-catch-blocks.route.test.ts).
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
import { seedDoc, resetStore, forceCollectionError } from './test/fake-firestore';

const OWNER = 'owner_1';
const NOT_ADMIN = 'random_person';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/admin/feedback', () => {
  it('requires admin - a non-admin gets a 500, not a 403 (this route has no Forbidden branch of its own)', async () => {
    const res = await request(app).get('/api/admin/feedback').set(auth(NOT_ADMIN));
    expect(res.status).toBe(500);
  });

  it('returns an honest empty list when nothing has been submitted', async () => {
    const res = await request(app).get('/api/admin/feedback').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.submissions).toEqual([]);
  });

  it('lists real submissions, newest first', async () => {
    seedDoc('feedback_submissions/s1', { category: 'bug', message: 'Found a bug.', createdAt: '2026-01-01T00:00:00.000Z' });
    seedDoc('feedback_submissions/s2', { category: 'testimonial', message: 'Loved it.', createdAt: '2026-01-02T00:00:00.000Z' });

    const res = await request(app).get('/api/admin/feedback').set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.submissions.map((s: any) => s.id)).toEqual(['s2', 's1']);
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the query throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('feedback_submissions', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/admin/feedback').set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
