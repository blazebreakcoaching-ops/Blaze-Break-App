import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t,
      email: `${t}@test.dev`,
      role: t.startsWith('owner_') ? 'platform_owner' : t.startsWith('secadmin_') ? 'security_admin' : undefined,
    }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const now = () => new Date().toISOString();

beforeEach(() => resetStore());

describe('GET /api/admin/product-intelligence', () => {
  it('requires content.manage - security_admin (no content.manage) is forbidden, platform_owner succeeds', async () => {
    const denied = await request(app).get('/api/admin/product-intelligence').set(auth('secadmin_1'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/content\.manage/);

    const allowed = await request(app).get('/api/admin/product-intelligence').set(auth('owner_1'));
    expect(allowed.status).toBe(200);
  });

  it('aggregates all three feature analytics collections across users via collectionGroup reads', async () => {
    seedDoc('users/u1/grounding_analytics_events/e1', { createdAt: now(), eventType: 'grounding_session_completed', category: 'rest_guilt' });
    seedDoc('users/u2/grounding_analytics_events/e2', { createdAt: now(), eventType: 'grounding_session_completed', category: 'rest_guilt' });
    seedDoc('users/u1/movement_analytics_events/e1', { createdAt: now(), eventType: 'movement_completed', movementId: 'desk_stretch', category: 'release' });
    seedDoc('users/u1/recovery_recipes_analytics_events/e1', { createdAt: now(), eventType: 'recipe_completed', situationKey: 'slept_badly', stepType: 'rest' });

    const res = await request(app).get('/api/admin/product-intelligence').set(auth('owner_1'));
    expect(res.status).toBe(200);

    expect(res.body.grounding.totalEvents).toBe(2);
    expect(res.body.grounding.byEventType).toEqual([{ eventType: 'grounding_session_completed', count: 2 }]);
    expect(res.body.grounding.byCategory).toEqual({ rest_guilt: 2 });

    expect(res.body.movement.totalEvents).toBe(1);
    expect(res.body.movement.byMovementId).toEqual({ desk_stretch: 1 });

    expect(res.body.recoveryRecipes.totalEvents).toBe(1);
    expect(res.body.recoveryRecipes.bySituationKey).toEqual({ slept_badly: 1 });
    expect(res.body.recoveryRecipes.byStepType).toEqual({ rest: 1 });
  });

  it('excludes events older than the lookback window', async () => {
    const stale = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    seedDoc('users/u_old/movement_analytics_events/old1', { createdAt: stale, eventType: 'movement_started' });
    seedDoc('users/u_new/movement_analytics_events/new1', { createdAt: now(), eventType: 'movement_started' });

    const res = await request(app).get('/api/admin/product-intelligence').set(auth('owner_1'));
    expect(res.body.movement.totalEvents).toBe(1);
  });

  it('respects a custom ?days= lookback, capped at the maximum', async () => {
    const res = await request(app).get('/api/admin/product-intelligence?days=30').set(auth('owner_1'));
    expect(res.body.lookbackDays).toBe(30);

    const capped = await request(app).get('/api/admin/product-intelligence?days=9999').set(auth('owner_1'));
    expect(capped.body.lookbackDays).toBe(365);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/admin/product-intelligence');
    expect(res.status).toBe(401);
  });
});
