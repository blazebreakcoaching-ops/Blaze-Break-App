import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for GET+POST /api/anxiety-reset - previously zero coverage
// at the route layer (anxiety-reset-engine.test.ts covers the pure engine
// logic only). Confirms events are scoped to the caller, the schema
// rejects unknown fields while overriding client-supplied userId/createdAt
// with the real authenticated uid/server timestamp, and that logging an
// event also awards engagement points to derived/stats.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceCollectionError, forceDocError, fakeDb } from './test/fake-firestore';

// The route creates its event doc via `.collection(...).doc().set(...)`
// (an auto-generated id), not `.collection(...).add(...)`, so neither
// forceDocError (needs a fixed path) nor forceCollectionError's 'add'
// (never called) can reach it - this forces any `.set()` under the
// anxiety_reset_events collection to fail, the same technique
// forceDocError/forceCollectionError use internally, just matched by
// path prefix instead of an exact path.
function forceAnxietyResetEventWriteError(error: Error): () => void {
  const probe = fakeDb.collection('anxiety_reset_events').doc('__probe__');
  const DocRefCtor = Object.getPrototypeOf(probe).constructor as any;
  const original = DocRefCtor.prototype.set;
  DocRefCtor.prototype.set = function (this: any, ...args: any[]) {
    if (this.path.startsWith('anxiety_reset_events/')) return Promise.reject(error);
    return original.apply(this, args);
  };
  return () => {
    DocRefCtor.prototype.set = original;
  };
}

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('GET /api/anxiety-reset', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/anxiety-reset');
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own events", async () => {
    seedDoc('anxiety_reset_events/e1', { userId: USER, mode: 'panic', completed: true });
    seedDoc('anxiety_reset_events/eX', { userId: 'other_user', mode: 'panic', completed: true });

    const res = await request(app).get('/api/anxiety-reset').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].id).toBe('e1');
  });

  it('500s if the read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('anxiety_reset_events', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/anxiety-reset').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/anxiety-reset', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/anxiety-reset').send({ mode: 'panic' });
    expect(res.status).toBe(401);
  });

  it('rejects an unknown field (strict schema)', async () => {
    const res = await request(app).post('/api/anxiety-reset').set(auth(USER)).send({ mode: 'panic', extraField: 'nope' });
    expect(res.status).toBe(400);
  });

  it('saves the event scoped to the authenticated caller, ignoring a client-supplied userId', async () => {
    const res = await request(app).post('/api/anxiety-reset').set(auth(USER)).send({
      userId: 'someone_else',
      mode: 'panic',
      triggerType: 'work_stress',
      intensityBefore: 8,
      intensityAfter: 3,
      completed: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.event.userId).toBe(USER);
  });

  it('awards 50 engagement points on top of any existing points', async () => {
    seedDoc(`users/${USER}/derived/stats`, { points: 100 });
    await request(app).post('/api/anxiety-reset').set(auth(USER)).send({ mode: 'panic', completed: true });
    const stats = getDocRaw(`users/${USER}/derived/stats`);
    expect(stats?.points).toBe(150);
    expect(typeof stats?.lastAnxietyReset).toBe('string');
  });

  it('500s if the event write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceAnxietyResetEventWriteError(new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/anxiety-reset').set(auth(USER)).send({ mode: 'panic' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });

  it('500s if the stats write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/derived/stats`, 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/anxiety-reset').set(auth(USER)).send({ mode: 'panic' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
