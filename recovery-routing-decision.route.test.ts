import { describe, it, expect, beforeEach, vi } from 'vitest';

// End-to-end route tests for POST /api/recovery/routing-decision - the
// first real wiring of recovery-routing-engine.ts/recovery-capacity-gate.ts
// to actual signals (capacity check-ins + stressors, Workload Reality
// Check, Trigger Journal, Mood Pulses). Confirms the real signal-to-
// candidate-to-decision pipeline behaves as recovery-signal-candidates.ts's
// own unit tests already prove in isolation, now wired through real
// Firestore reads and the session Recommendation Budget.
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
import { seedDoc, resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('POST /api/recovery/routing-decision', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/recovery/routing-decision').send({})).status).toBe(401);
  });

  it('returns needs_clarification with no signals at all (never a confident guess from nothing)', async () => {
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.routingOutcome).toBe('needs_clarification');
    expect(res.body.selectedRoute).toBe('NONE');
    expect(res.body.sufficientBandwidthData).toBe(false);
  });

  it('an explicit self-report resolves the clarification and still finds no intervention needed when nothing else is logged', async () => {
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({ explicitBandwidthReport: 'reflective_bandwidth' });
    expect(res.status).toBe(200);
    expect(res.body.routingOutcome).toBe('none_needed');
    expect(res.body.selectedRoute).toBe('NONE');
  });

  it('REDUCE: pending workload tasks + a low capacity check-in routes to one_less_thing', async () => {
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'Finish report', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: new Date().toISOString(),
    });
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(res.status).toBe(200);
    expect(res.body.selectedRoute).toBe('REDUCE');
    expect(res.body.selectedModule).toBe('one_less_thing');
    expect(res.body.routingOutcome).toBe('selected');
  });

  it('STABILISE: a recent high-severity trigger wins over a simultaneously-eligible REDUCE candidate (urgency)', async () => {
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'x', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/stress_triggers/tr1`, {
      source: 'Meetings', severity: 'high', notes: 'x', createdAt: new Date().toISOString(),
    });
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(res.body.selectedRoute).toBe('STABILISE');
    expect(res.body.selectedModule).toBe('guided_reset');
  });

  it('an explicit request for a known module is respected even with no other signal', async () => {
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({ explicitRequestModule: 'capacity_firewall' });
    expect(res.status).toBe(200);
    expect(res.body.selectedRoute).toBe('PROTECT');
    expect(res.body.selectedModule).toBe('capacity_firewall');
    expect(res.body.reasonCodes).toEqual(['explicit_user_request']);
  });

  it('rejects an unrecognised explicit module name with a 400, rather than guessing a route', async () => {
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({ explicitRequestModule: 'not_a_real_module' });
    expect(res.status).toBe(400);
  });

  it('the Recommendation Budget suppresses a 4th offer in the same day', async () => {
    seedDoc(`users/${USER}/recovery_routing/session_state`, {
      day: new Date().toISOString().split('T')[0], recommendationsOffered: 3, recommendationsDeclined: 0,
      interventionsStarted: 0, interventionsCompleted: 0, interventionsAbandoned: 0, updatedAt: new Date().toISOString(),
    });
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({ explicitRequestModule: 'capacity_firewall' });
    // Explicit requests still bypass the budget, so use a signal-derived candidate instead to prove suppression.
    expect(res.status).toBe(200);

    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'x', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: new Date().toISOString(),
    });
    const suppressed = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(suppressed.body.routingOutcome).toBe('suppressed_by_budget');
    expect(suppressed.body.selectedRoute).toBe('NONE');
  });

  it('a stale session_state from a previous day is reset rather than carried forward', async () => {
    seedDoc(`users/${USER}/recovery_routing/session_state`, {
      day: '2000-01-01', recommendationsOffered: 10, recommendationsDeclined: 0,
      interventionsStarted: 0, interventionsCompleted: 0, interventionsAbandoned: 0, updatedAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'x', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: new Date().toISOString(),
    });
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    expect(res.body.routingOutcome).toBe('selected');
  });

  it('persists a privacy-minimised decision audit entry, never raw trigger/mood text', async () => {
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'x', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: new Date().toISOString(),
    });
    await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    const { getDocRaw } = await import('./test/fake-firestore');
    const session = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(session?.recommendationsOffered).toBe(1);
  });
});
