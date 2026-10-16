import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
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

describe('GET /api/admin/recovery-outcomes', () => {
  it('requires content.manage - security_admin (no content.manage) is forbidden, platform_owner succeeds', async () => {
    const denied = await request(app).get('/api/admin/recovery-outcomes').set(auth('secadmin_1'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/content\.manage/);

    const allowed = await request(app).get('/api/admin/recovery-outcomes').set(auth('owner_1'));
    expect(allowed.status).toBe(200);
  });

  it('aggregates recovery_routing_decisions across multiple users via a collectionGroup read', async () => {
    for (let i = 0; i < 25; i++) {
      seedDoc(`users/user_${i}/recovery_routing_decisions/d${i}`, {
        createdAt: now(),
        selectedModule: 'breathing_reset',
        outcome: 'completed',
        helpfulness: i < 20 ? 'better' : 'same',
      });
    }
    const res = await request(app).get('/api/admin/recovery-outcomes').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
    const [summary] = res.body.modules;
    expect(summary.module).toBe('breathing_reset');
    expect(summary.recommended).toBe(25);
    expect(summary.resolved).toBe(25);
    expect(summary.completed).toBe(25);
    expect(summary.sufficientSample).toBe(true); // 25 resolved >= default threshold of 20
  });

  it('excludes decisions older than the lookback window', async () => {
    const stale = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    seedDoc('users/user_old/recovery_routing_decisions/old1', {
      createdAt: stale, selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better',
    });
    seedDoc('users/user_new/recovery_routing_decisions/new1', {
      createdAt: now(), selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better',
    });
    const res = await request(app).get('/api/admin/recovery-outcomes').set(auth('owner_1'));
    expect(res.body.modules[0].recommended).toBe(1); // only the recent one
  });

  it('respects a custom ?days= lookback, capped at the maximum', async () => {
    const res = await request(app).get('/api/admin/recovery-outcomes?days=30').set(auth('owner_1'));
    expect(res.body.lookbackDays).toBe(30);

    const capped = await request(app).get('/api/admin/recovery-outcomes?days=9999').set(auth('owner_1'));
    expect(capped.body.lookbackDays).toBe(365);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/admin/recovery-outcomes');
    expect(res.status).toBe(401);
  });
});
