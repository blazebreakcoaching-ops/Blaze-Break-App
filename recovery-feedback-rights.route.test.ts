import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { resetStore, seedDoc, getDocRaw } from './test/fake-firestore';

const USER = 'member_feedback';
const path = (uid = USER) => `users/${uid}/recovery_routing_decisions/item1`;
const auth = (uid = USER) => ({ Authorization: `Bearer ${uid}` });
beforeEach(() => resetStore());

describe('Recovery feedback withdrawal and reset are durable member rights', () => {
  it('requires authentication and does not disclose other members\' decisions', async () => {
    seedDoc(path(), { selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better' });
    expect((await request(app).delete('/api/recovery/my-feedback/item1')).status).toBe(401);
    expect((await request(app).delete('/api/recovery/my-feedback/item1').set(auth('other_member'))).status).toBe(404);
    expect(getDocRaw(path())?.helpfulness).toBe('better');
  });

  it('forgets only the subjective rating, idempotently, and refuses its delayed correction', async () => {
    seedDoc(path(), { createdAt: new Date().toISOString(), selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better' });
    seedDoc(`users/${USER}/recovery_routing/session_state`, { interventionsCompleted: 1 });
    const url = '/api/recovery/my-feedback/item1';
    const first = await request(app).delete(url).set(auth());
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, alreadyForgotten: false });
    expect(getDocRaw(path())?.helpfulness).toBeUndefined();
    expect(getDocRaw(path())?.feedbackWithdrawnAt).toBeTruthy();
    const repeat = await request(app).delete(url).set(auth());
    expect(repeat.status).toBe(200);
    expect(repeat.body.alreadyForgotten).toBe(true);
    const late = await request(app).post('/api/recovery/routing-outcome').set(auth())
      .send({ decisionId: 'item1', action: 'completed', helpfulness: 'not_really' });
    expect(late.status).toBe(409);
    expect(getDocRaw(path())?.helpfulness).toBeUndefined();
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.interventionsCompleted).toBe(1);
  });

  it('rejects erasure of an unresolved offer without changing its event', async () => {
    seedDoc(path(), { selectedModule: 'guided_reset' });
    const res = await request(app).delete('/api/recovery/my-feedback/item1').set(auth());
    expect(res.status).toBe(409);
    expect(getDocRaw(path())?.feedbackWithdrawnAt).toBeUndefined();
  });

  it('resolves concurrent correction and withdrawal with no resurrected rating', async () => {
    seedDoc(path(), { createdAt: new Date().toISOString(), selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better' });
    const [forgot, correction] = await Promise.all([
      request(app).delete('/api/recovery/my-feedback/item1').set(auth()),
      request(app).post('/api/recovery/routing-outcome').set(auth())
        .send({ decisionId: 'item1', action: 'completed', helpfulness: 'not_really' }),
    ]);
    expect(forgot.status).toBe(200);
    expect([200, 409]).toContain(correction.status);
    expect(getDocRaw(path())?.helpfulness).toBeUndefined();
  });

  it('reset blocks delayed old feedback while still permitting fresh post-reset sessions', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, {
      allowAdaptiveIntelligence: true,
      adaptivePreferredModules: ['guided_reset'],
      adaptiveAvoidedModules: [],
    });
    seedDoc(path(), {
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better',
    });
    const reset = await request(app).post('/api/recovery/reset-adaptive-learning').set(auth())
      .send({ confirm: 'RESET_MY_LEARNING' });
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ adaptiveLearningEnabled: false, ratingsErased: 1, complete: true });
    const permissions = getDocRaw(`users/${USER}/nova_permissions/current`);
    expect(permissions?.allowAdaptiveIntelligence).toBe(false);
    expect(permissions?.adaptivePreferredModules).toEqual([]);
    expect(getDocRaw(path())?.helpfulness).toBeUndefined();
    const resetAt = getDocRaw(`users/${USER}/recovery_routing/learning_reset_state`)?.lastResetAt;
    expect(typeof resetAt).toBe('string');

    const delayed = await request(app).post('/api/recovery/routing-outcome').set(auth())
      .send({ decisionId: 'item1', action: 'completed', helpfulness: 'same' });
    expect(delayed.status).toBe(409);
    expect(getDocRaw(path())?.helpfulness).toBeUndefined();

    seedDoc(`users/${USER}/recovery_routing_decisions/fresh`, {
      createdAt: new Date(Date.parse(resetAt) + 1000).toISOString(),
      selectedModule: 'guided_reset',
    });
    const fresh = await request(app).post('/api/recovery/routing-outcome').set(auth())
      .send({ decisionId: 'fresh', action: 'completed', helpfulness: 'better' });
    expect(fresh.status).toBe(200);
    expect(getDocRaw(`users/${USER}/recovery_routing_decisions/fresh`)?.helpfulness).toBe('better');
  });

  it('does not reset another account\'s preferences or ratings', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, { allowAdaptiveIntelligence: true });
    seedDoc('users/another_user/nova_permissions/current', { allowAdaptiveIntelligence: true });
    seedDoc('users/another_user/recovery_routing_decisions/d1', {
      createdAt: new Date().toISOString(), selectedModule: 'guided_reset',
      outcome: 'completed', helpfulness: 'better',
    });
    expect((await request(app).post('/api/recovery/reset-adaptive-learning').set(auth())
      .send({ confirm: 'RESET_MY_LEARNING' })).status).toBe(200);
    expect(getDocRaw('users/another_user/nova_permissions/current')?.allowAdaptiveIntelligence).toBe(true);
    expect(getDocRaw('users/another_user/recovery_routing_decisions/d1')?.helpfulness).toBe('better');
  });
});

describe('GET /api/recovery/my-feedback cursor pagination', () => {
  const older = (index: number) => new Date(Date.now() - (index + 1) * 60_000).toISOString();
  it('pages all 70 ratings with no omission or duplicate across 30-entry UI pages', async () => {
    for (let i = 0; i < 70; i++) {
      seedDoc(`users/${USER}/recovery_routing_decisions/d${i}`, {
        createdAt: older(i), selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better',
      });
    }
    let cursor: string | null = null;
    const allIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await request(app).get('/api/recovery/my-feedback' +
        (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')).set(auth());
      expect(result.status).toBe(200);
      allIds.push(...result.body.items.map((item: any) => item.id));
      cursor = result.body.nextCursor;
      if (!cursor) break;
    }
    expect(allIds).toHaveLength(70);
    expect(new Set(allIds).size).toBe(70);
  });

  it('finds older rated records beyond 60 recent unrated offers', async () => {
    for (let i = 0; i < 95; i++) {
      seedDoc(`users/${USER}/recovery_routing_decisions/no_rating_${i}`, {
        createdAt: older(i), selectedModule: 'guided_reset', outcome: 'declined',
      });
    }
    seedDoc(path(), {
      createdAt: older(100), selectedModule: 'guided_reset', outcome: 'completed', helpfulness: 'better',
    });
    const response = await request(app).get('/api/recovery/my-feedback').set(auth());
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].id).toBe('item1');
    expect(response.body.nextCursor).toBeNull();
  });

  it('rejects malformed or cross-account cursors and preserves member isolation', async () => {
    seedDoc('users/another_user/recovery_routing_decisions/private1', {
      createdAt: older(0), selectedModule: 'guided_reset',
      outcome: 'completed', helpfulness: 'better',
    });
    expect((await request(app).get('/api/recovery/my-feedback?cursor=../../other')
      .set(auth())).status).toBe(400);
    expect((await request(app).get('/api/recovery/my-feedback?cursor=private1')
      .set(auth())).status).toBe(400);
    expect((await request(app).get('/api/recovery/my-feedback').set(auth())).body.items).toEqual([]);
  });
});
