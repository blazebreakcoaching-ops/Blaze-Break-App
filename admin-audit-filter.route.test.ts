import { describe, it, expect, beforeEach, vi } from 'vitest';

// Command Centre: exact search over the FULL platform audit history
// (GET /api/admin/audit-logs?action=... | ?actor=...). Previously the only
// filter was client-side over one 50-event page, and the Evolution Engine
// filtered the first page of ALL events, so older matches were invisible.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({
      uid: t, email: `${t}@test.dev`,
      role: t === 'owner_1' ? 'platform_owner' : t === 'support_1' ? 'support_admin' : undefined,
    }),
    getUserByEmail: async (email: string) => {
      if (email === 'admin_a@test.dev') return { uid: 'admin_a' };
      const error: any = new Error('not found'); error.code = 'auth/user-not-found'; throw error;
    },
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

// 120 events spread over time: every 10th is an Evolution action by
// admin_a; the rest are routine suspensions by admin_b. With a 50-event
// page, most matches live beyond the first unfiltered page.
function seedHistory() {
  for (let i = 0; i < 120; i++) {
    const evolution = i % 10 === 0;
    seedDoc(`admin_audit_logs/e${String(i).padStart(3, '0')}`, {
      action: evolution ? 'freeze_evolution_engine' : 'suspend_user',
      actorUid: evolution ? 'admin_a' : 'admin_b',
      actorEmail: evolution ? 'admin_a@test.dev' : 'admin_b@test.dev',
      targetUid: `t${i}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
      metadata: {},
    });
  }
}

beforeEach(() => {
  resetStore();
  seedHistory();
});

describe('GET /api/admin/audit-logs - full-history filters', () => {
  it('without a filter, the first page holds only 5 of the 12 Evolution events (the old problem)', async () => {
    const res = await request(app).get('/api/admin/audit-logs').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.logs.filter((l: any) => l.action === 'freeze_evolution_engine')).toHaveLength(5);
  });

  it('an action filter returns every matching event across the whole history, newest first', async () => {
    const res = await request(app).get('/api/admin/audit-logs?action=freeze_evolution_engine').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(12);
    expect(res.body.logs.every((l: any) => l.action === 'freeze_evolution_engine')).toBe(true);
    expect(res.body.logs[0].targetUid).toBe('t110');
    expect(res.body.complete).toBe(true);
  });

  it('accepts a list of actions (the Evolution Engine view)', async () => {
    const res = await request(app)
      .get('/api/admin/audit-logs?action=' + encodeURIComponent('freeze_evolution_engine,unfreeze_evolution_engine'))
      .set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(12);
  });

  it('filters by administrator email or UID', async () => {
    const byEmail = await request(app).get('/api/admin/audit-logs?actor=admin_a@test.dev').set(auth('owner_1'));
    expect(byEmail.body.logs).toHaveLength(12);
    expect(byEmail.body.logs.every((l: any) => l.actorUid === 'admin_a')).toBe(true);
    const byUid = await request(app).get('/api/admin/audit-logs?actor=admin_b').set(auth('owner_1'));
    expect(byUid.body.logs).toHaveLength(50);
    expect(byUid.body.nextCursor).toBeTruthy();
  });

  it('pages through a filtered result set and refuses a cursor from a different result set', async () => {
    const first = await request(app).get('/api/admin/audit-logs?actor=admin_b').set(auth('owner_1'));
    const second = await request(app).get(`/api/admin/audit-logs?actor=admin_b&cursor=${first.body.nextCursor}`).set(auth('owner_1'));
    expect(second.status).toBe(200);
    expect(second.body.logs).toHaveLength(50);
    const ids = new Set([...first.body.logs, ...second.body.logs].map((l: any) => l.id));
    expect(ids.size).toBe(100);
    const mismatched = await request(app).get(`/api/admin/audit-logs?action=freeze_evolution_engine&cursor=${first.body.nextCursor}`).set(auth('owner_1'));
    expect(mismatched.status).toBe(400);
  });

  it('an unknown administrator email returns an empty, complete result (no error)', async () => {
    const res = await request(app).get('/api/admin/audit-logs?actor=nobody@test.dev').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logs: [], complete: true });
  });

  it('rejects malformed or combined filters', async () => {
    for (const q of ['action=DROP%20TABLE', 'action=', 'action=a,b&actor=x', 'actor=%20', 'actor=bad%20uid!',
      'action=' + Array.from({ length: 31 }, (_, i) => `a${i}`).join(',')]) {
      const res = await request(app).get(`/api/admin/audit-logs?${q}`).set(auth('owner_1'));
      expect(res.status, q).toBe(400);
    }
  });

  it('filters still require audit.read permission', async () => {
    const res = await request(app).get('/api/admin/audit-logs?actor=admin_a').set(auth('random_user'));
    expect(res.status).toBe(403);
  });
});
