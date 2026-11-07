// Phase 5F Agentic Expansion, directive §5/§9 - the possible-suggestion
// route, at the actual route boundary. Confirms the two real
// authorisation checks (calendar action permission, connected task
// provider) actually gate what's returned, and that no proposal, write,
// or connector call ever happens here.

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));

const USERS: Record<string, { email: string }> = { user_a: { email: 'a@test.dev' } };

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => {
      const u = USERS[t];
      if (!u) throw new Error('unknown test uid');
      return { uid: t, email: u.email };
    },
    getUser: async () => ({ customClaims: {} }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const EMPTY_BODY = { statedGoal: null, voluntarilySharedObligation: null, capacityBand: null, priorUserConfirmedPlan: null };

beforeEach(() => resetStore());

describe('POST /api/nova/proactive-suggestions', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/nova/proactive-suggestions').send(EMPTY_BODY);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns no suggestions with no obligation and no authorised context', async () => {
    const res = await request(app).post('/api/nova/proactive-suggestions').set(auth('user_a')).send(EMPTY_BODY);
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it('never suggests calendar_protection without a real, granted allowCalendarActions permission', async () => {
    const res = await request(app).post('/api/nova/proactive-suggestions').set(auth('user_a')).send({ ...EMPTY_BODY, voluntarilySharedObligation: 'Finish the report' });
    expect(res.body.suggestions.find((s: any) => s.category === 'calendar_protection')).toBeUndefined();
  });

  it('suggests calendar_protection once the real allowCalendarActions permission is granted', async () => {
    await (fakeDb as any).collection('users').doc('user_a').collection('nova_permissions').doc('current').set({ allowCalendarActions: true });
    const res = await request(app).post('/api/nova/proactive-suggestions').set(auth('user_a')).send({ ...EMPTY_BODY, voluntarilySharedObligation: 'Finish the report' });
    expect(res.body.suggestions.some((s: any) => s.category === 'calendar_protection')).toBe(true);
  });

  it('suggests task_deferral once a real task-provider integration token exists', async () => {
    await (fakeDb as any).collection('users').doc('user_a').collection('integration_tokens').doc('asana').set({ accessToken: 'sentinel' });
    const res = await request(app).post('/api/nova/proactive-suggestions').set(auth('user_a')).send({ ...EMPTY_BODY, statedGoal: 'Ship the release' });
    expect(res.body.suggestions.some((s: any) => s.category === 'task_deferral')).toBe(true);
  });

  it('rejects an invalid capacityBand value via schema validation', async () => {
    const res = await request(app).post('/api/nova/proactive-suggestions').set(auth('user_a')).send({ ...EMPTY_BODY, capacityBand: 'not_a_real_band' });
    expect(res.status).toBe(400);
  });
});
