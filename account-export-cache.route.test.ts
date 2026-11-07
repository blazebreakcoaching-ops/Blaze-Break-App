import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';

describe('personal data export HTTP cache boundaries', () => {
  it('prevents storing a failed unauthenticated export response', async () => {
    const res = await request(app).get('/api/user/export');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers.pragma).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
