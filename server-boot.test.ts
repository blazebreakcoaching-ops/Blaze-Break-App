import { describe, it, expect, vi } from 'vitest';

// A smoke test that the server module actually LOADS. This exists because a
// real boot-crash once shipped: server.ts had a top-level
// `NudgeScheduleSchema.partial()` that throws under zod v4, so the process
// died on startup - and nothing caught it, because `tsc` and `esbuild --bundle`
// both only analyse/bundle the code, they never execute it. The vitest suite
// runs in CI, so importing the app here means any top-level throw in server.ts
// now fails CI instead of production startup.
//
// Deliberately minimal: it only proves the module evaluates and exports a
// wired Express app. The detailed behaviour lives in the per-endpoint suites.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';

describe('server boots', () => {
  it('loads the module and exports a wired Express app (no top-level throw)', () => {
    expect(app).toBeDefined();
    expect(typeof app).toBe('function'); // an express() app is a request handler
  });

  it('actually serves requests: a protected route rejects an unauthenticated call', async () => {
    const res = await request(app).get('/api/user/export');
    expect(res.status).toBe(401);
  });
});
