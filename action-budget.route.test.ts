import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; teamManagers?: Record<string, string[]>; actionBudget?: { maxConcurrentActiveInterventions: number } } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    teamManagers: opts.teamManagers || {},
    actionBudget: opts.actionBudget,
  });
}

const createIntervention = (team: string, uid: string) =>
  request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth(uid))
    .send({ team, signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/action-budget', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/action-budget`);
    expect(res.status).toBe(401);
  });

  it('returns the default budget of 3 and zero active when nothing has been started', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/action-budget`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.maxConcurrentActive).toBe(3);
    expect(res.body.currentActiveCount).toBe(0);
    expect(res.body.remaining).toBe(3);
  });

  it('reflects a custom budget set via org settings', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    await request(app).post(`/api/org/${ORG}/settings`).set(auth('owner_1')).send({ maxConcurrentActiveInterventions: 1 });

    const res = await request(app).get(`/api/org/${ORG}/action-budget`).set(auth('owner_1'));
    expect(res.body.maxConcurrentActive).toBe(1);
  });
});

describe('POST /api/org/:orgId/settings — action budget validation', () => {
  it('rejects an out-of-range maxConcurrentActiveInterventions', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/settings`).set(auth('owner_1')).send({ maxConcurrentActiveInterventions: 0 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/org/:orgId/work-design-interventions — Organisational Action Budget enforcement', () => {
  it('allows starting interventions up to the budget, then refuses the next one', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      teamManagers: {},
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });

    const first = await createIntervention('Team A', 'owner_1');
    expect(first.status).toBe(200);

    const second = await createIntervention('Team B', 'owner_1');
    expect(second.status).toBe(400);
    expect(second.body.error).toContain('1');
  });

  it('counts active interventions ORG-WIDE, not per-team', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'mgr_b'],
      teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });

    const first = await createIntervention('Team A', 'mgr_a');
    expect(first.status).toBe(200);

    const second = await createIntervention('Team B', 'mgr_b');
    expect(second.status).toBe(400);
  });

  it('frees up budget once an intervention completes', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });

    const first = await createIntervention('Team A', 'owner_1');
    expect(first.status).toBe(200);
    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${first.body.intervention.id}/outcome`).set(auth('owner_1')).send({ outcomeRating: 'useful' });

    const second = await createIntervention('Team B', 'owner_1');
    expect(second.status).toBe(200);
  });
});

describe('PATCH /api/org/:orgId/work-design-interventions/:id/status — Organisational Action Budget enforcement', () => {
  it('refuses to reactivate a completed intervention via the status route once back at budget', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });

    const first = await createIntervention('Team A', 'owner_1');
    expect(first.status).toBe(200);
    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${first.body.intervention.id}/outcome`).set(auth('owner_1')).send({ outcomeRating: 'useful' });

    const second = await createIntervention('Team B', 'owner_1');
    expect(second.status).toBe(200);

    // Budget is back at 1/1 (second is active, first completed). Reactivating
    // the first via the generic status route must be refused - otherwise an
    // org at its ceiling could stop/complete a trial (freeing nothing a
    // budget check would have counted) and reactivate any number of old
    // interventions to silently exceed the configured limit.
    const reactivate = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${first.body.intervention.id}/status`).set(auth('owner_1')).send({ status: 'active' });
    expect(reactivate.status).toBe(400);
  });

  it('allows a status change that does not increase the active count', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });
    const first = await createIntervention('Team A', 'owner_1');
    expect(first.status).toBe(200);
    const stop = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${first.body.intervention.id}/status`).set(auth('owner_1')).send({ status: 'stopped' });
    expect(stop.status).toBe(200);
  });

  it('allows moving between two active statuses (trialling -> active) since it never increases the count', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1'],
      actionBudget: { maxConcurrentActiveInterventions: 1 },
    });
    const first = await createIntervention('Team A', 'owner_1');
    expect(first.status).toBe(200);
    const promote = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${first.body.intervention.id}/status`).set(auth('owner_1')).send({ status: 'active' });
    expect(promote.status).toBe(200);
  });
});
