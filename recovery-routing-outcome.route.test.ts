import { describe, it, expect, beforeEach, vi } from 'vitest';

// End-to-end route tests for POST /api/recovery/routing-outcome - closes the
// loop PR8 opens: Start/Not Now/I'm Okay/completion-answer all report back
// against the specific routing_decisions entry they came from, and those
// reports drive both the day-aware session_state counters and (via
// recovery-signal-candidates.ts's moduleHistory) real recency/cooldown
// tracking for future routing decisions.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('POST /api/recovery/routing-outcome', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/recovery/routing-outcome').send({})).status).toBe(401);
  });

  it('rejects a missing decisionId', async () => {
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ action: 'started' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid action', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('404s for a decision that does not exist', async () => {
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'does_not_exist', action: 'started' });
    expect(res.status).toBe(404);
  });

  it('404s for a decisionId that belongs to a different user (scoped by uid in the path, not by the id alone)', async () => {
    seedDoc(`users/other_user/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    expect(res.status).toBe(404);
  });

  it('started: stamps startedAt and increments interventionsStarted via the day-aware session counter', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    expect(res.status).toBe(200);
    const decision = getDocRaw(`users/${USER}/recovery_routing_decisions/d1`);
    expect(decision?.startedAt).toBeTruthy();
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.interventionsStarted).toBe(1);
  });

  it('declined: stamps outcome/outcomeAt and increments recommendationsDeclined', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    expect(res.status).toBe(200);
    const decision = getDocRaw(`users/${USER}/recovery_routing_decisions/d1`);
    expect(decision?.outcome).toBe('declined');
    expect(decision?.outcomeAt).toBeTruthy();
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.recommendationsDeclined).toBe(1);
  });

  it('completed: stores helpfulness and increments interventionsCompleted', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'completed', helpfulness: 'better' });
    expect(res.status).toBe(200);
    const decision = getDocRaw(`users/${USER}/recovery_routing_decisions/d1`);
    expect(decision?.outcome).toBe('completed');
    expect(decision?.helpfulness).toBe('better');
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.interventionsCompleted).toBe(1);
  });

  it('completed: an invalid helpfulness value is stored as null rather than trusted as-is', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'completed', helpfulness: 'not_a_real_value' });
    const decision = getDocRaw(`users/${USER}/recovery_routing_decisions/d1`);
    expect(decision?.helpfulness).toBeNull();
  });

  it('abandoned: stamps outcome and increments interventionsAbandoned', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'abandoned' });
    expect(res.status).toBe(200);
    const decision = getDocRaw(`users/${USER}/recovery_routing_decisions/d1`);
    expect(decision?.outcome).toBe('abandoned');
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.interventionsAbandoned).toBe(1);
  });

  it('a stale session_state from a previous day is reset rather than incremented onto directly', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: new Date().toISOString(), selectedModule: 'guided_reset' });
    seedDoc(`users/${USER}/recovery_routing/session_state`, {
      day: '2000-01-01', recommendationsOffered: 10, recommendationsDeclined: 5,
      interventionsStarted: 5, interventionsCompleted: 5, interventionsAbandoned: 5, updatedAt: new Date().toISOString(),
    });
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.day).toBe(new Date().toISOString().split('T')[0]);
    expect(session?.interventionsStarted).toBe(1);
    expect(session?.recommendationsOffered).toBe(0);
  });

  it('three declines against the same module put it in cooldown, excluding it from the very next (non-explicit) routing decision', async () => {
    for (let i = 0; i < 3; i++) {
      seedDoc(`users/${USER}/recovery_routing_decisions/d${i}`, {
        createdAt: new Date(Date.now() - i * 1000).toISOString(), selectedModule: 'guided_reset',
      });
      await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: `d${i}`, action: 'declined' });
    }
    // A capacity check-in gives the Capacity Gate enough to judge bandwidth without an explicit
    // report, and a fresh, recent high-severity trigger would normally route to STABILISE/
    // guided_reset (see recovery-routing-decision.route.test.ts) - cooldownActive should exclude
    // it instead, leaving no eligible candidate at all.
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/stress_triggers/tr1`, { source: 'Meetings', severity: 'high', createdAt: new Date().toISOString() });
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.selectedModule).not.toBe('guided_reset');
    expect(res.body.routingOutcome).toBe('none_needed');
  });
});
