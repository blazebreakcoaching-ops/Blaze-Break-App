import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

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
import { resetStore, seedDoc, forceCollectionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/recovery/my-outcomes', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/recovery/my-outcomes');
    expect(res.status).toBe(401);
  });

  it("summarizes only the caller's own recovery_routing_decisions, never another user's", async () => {
    seedDoc('users/user_me/recovery_routing_decisions/d1', {
      selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better',
    });
    seedDoc('users/user_me/recovery_routing_decisions/d2', {
      selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better',
    });
    seedDoc('users/user_other/recovery_routing_decisions/dX', {
      selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better',
    });

    const res = await request(app).get('/api/recovery/my-outcomes').set(auth('user_me'));
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
    expect(res.body.modules[0].recommended).toBe(2); // not 3 - user_other's doc is excluded
  });

  it('uses the lower personal reliability threshold (3), not the admin route\'s 20, and never hides the data either way', async () => {
    seedDoc('users/user_me/recovery_routing_decisions/d1', {
      selectedModule: 'anxiety_reset', outcome: 'completed', helpfulness: 'better',
    });
    const res = await request(app).get('/api/recovery/my-outcomes').set(auth('user_me'));
    const [summary] = res.body.modules;
    expect(summary.sampleThreshold).toBe(3);
    expect(summary.sufficientSample).toBe(false); // 1 resolved < 3
    expect(summary.recommended).toBe(1); // still returned, not hidden
  });

  it('500s if the recovery_routing_decisions read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/user_me/recovery_routing_decisions', 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/recovery/my-outcomes').set(auth('user_me'));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
