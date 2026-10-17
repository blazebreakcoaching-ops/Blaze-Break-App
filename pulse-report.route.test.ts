import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST /api/pulse/report - previously zero coverage. The
// client computes this score locally on every home-screen load; this
// route just gives the server a durable copy to check later (the
// scheduled stale/low-score push nudge reads pulse_status), without
// needing the client to be running at that later moment.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

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
import { getDocRaw, resetStore, forceDocError } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => { resetStore(); });

describe('POST /api/pulse/report', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/pulse/report').send({ score: 70 });
    expect(res.status).toBe(401);
  });

  it('rejects a score outside 0-100', async () => {
    const res = await request(app).post('/api/pulse/report').set(auth(USER)).send({ score: 150 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown field (strict schema)', async () => {
    const res = await request(app).post('/api/pulse/report').set(auth(USER)).send({ score: 70, note: 'feeling okay' });
    expect(res.status).toBe(400);
  });

  it('persists the score with a server-stamped reportedAt', async () => {
    const res = await request(app).post('/api/pulse/report').set(auth(USER)).send({ score: 65 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const stored = getDocRaw(`users/${USER}/pulse_status/latest`);
    expect(stored?.score).toBe(65);
    expect(typeof stored?.reportedAt).toBe('string');
  });

  it('500s if the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/pulse_status/latest`, 'set', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/pulse/report').set(auth(USER)).send({ score: 65 });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
