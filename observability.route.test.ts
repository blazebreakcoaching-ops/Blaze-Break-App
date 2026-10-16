import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: vi.fn() }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';

describe('GET /healthz', () => {
  it('returns 200 with no auth and no App Check token required', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('tags every response with an X-Request-Id header', async () => {
    const res = await request(app).get('/healthz');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('reuses the X-Cloud-Trace-Context id (Cloud Run trace header) instead of minting its own', async () => {
    const res = await request(app).get('/healthz').set('X-Cloud-Trace-Context', 'abc123trace/456;o=1');
    expect(res.headers['x-request-id']).toBe('abc123trace');
  });
});
