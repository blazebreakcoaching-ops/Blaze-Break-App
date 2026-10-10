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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; teamManagers?: Record<string, string[]> } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    teamManagers: opts.teamManagers || {},
  });
}

const createIntervention = (team: string, uid: string) =>
  request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth(uid))
    .send({ team, signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });

const recordOutcome = (id: string, uid: string, outcomeRating: string) =>
  request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/outcome`).set(auth(uid)).send({ outcomeRating });

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/what-works-here', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/what-works-here`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('a plain member can read the library, empty when no interventions exist', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.patterns).toEqual([]);
  });

  it('includes a data provenance label (Work Design Pulse PR13)', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('a1'));
    expect(res.body.provenance).toContain('Derived from work_design_interventions');
    // No real k-anonymity gate runs against this library (it's built from
    // intervention records, not a per-member aggregate), so the honest
    // label is "Not Applicable", never a claimed "Passed".
    expect(res.body.provenance).toContain('Privacy Gate: Not Applicable');
  });

  it('computes repeated_one_team when the same team has two positive outcomes', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const c1 = await createIntervention('Team A', 'mgr_a');
    await recordOutcome(c1.body.intervention.id, 'mgr_a', 'useful');
    const c2 = await createIntervention('Team A', 'mgr_a');
    await recordOutcome(c2.body.intervention.id, 'mgr_a', 'useful');

    const res = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('owner_1'));
    const pattern = res.body.patterns.find((p: any) => p.signalKey === 'meeting_pressure');
    expect(pattern.level).toBe('repeated_one_team');
    expect(pattern.teamCount).toBe(1);
    expect(pattern.canPromote).toBe(false);
  });

  it('computes consistent_no_transfer across teams and allows promotion', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'mgr_b'],
      teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
    });
    const c1 = await createIntervention('Team A', 'mgr_a');
    await recordOutcome(c1.body.intervention.id, 'mgr_a', 'useful');
    const c2 = await createIntervention('Team B', 'mgr_b');
    await recordOutcome(c2.body.intervention.id, 'mgr_b', 'partly_useful');

    const res = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('owner_1'));
    const pattern = res.body.patterns.find((p: any) => p.signalKey === 'meeting_pressure');
    expect(pattern.level).toBe('consistent_no_transfer');
    expect(pattern.teamCount).toBe(2);
    expect(pattern.canPromote).toBe(true);
  });
});

describe('POST /api/org/:orgId/what-works-here/:signalKey/promote', () => {
  it('refuses a non-admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/what-works-here/meeting_pressure/promote`).set(auth('mgr_a'));
    expect(res.status).toBe(403);
  });

  it('refuses to promote a pattern whose real evidence has not reached repeated_across_teams', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const c1 = await createIntervention('Team A', 'mgr_a');
    await recordOutcome(c1.body.intervention.id, 'mgr_a', 'useful');

    const res = await request(app).post(`/api/org/${ORG}/what-works-here/meeting_pressure/promote`).set(auth('owner_1'));
    expect(res.status).toBe(400);
  });

  it('promotes a pattern whose real evidence has reached repeated_across_teams, and the library then shows local_operating_principle', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'mgr_b'],
      teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
    });
    const c1 = await createIntervention('Team A', 'mgr_a');
    await recordOutcome(c1.body.intervention.id, 'mgr_a', 'useful');
    const c2 = await createIntervention('Team B', 'mgr_b');
    await recordOutcome(c2.body.intervention.id, 'mgr_b', 'useful');

    const promoteRes = await request(app).post(`/api/org/${ORG}/what-works-here/meeting_pressure/promote`).set(auth('owner_1'));
    expect(promoteRes.status).toBe(200);

    const listRes = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('owner_1'));
    const pattern = listRes.body.patterns.find((p: any) => p.signalKey === 'meeting_pressure');
    expect(pattern.level).toBe('local_operating_principle');
    expect(pattern.canPromote).toBe(false);
  });
});
