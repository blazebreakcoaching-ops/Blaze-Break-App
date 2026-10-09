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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; teamManagers?: Record<string, string[]> } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    teamManagers: opts.teamManagers || {},
    privacyThreshold: 3,
  });
}

const validBody = { team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'High meeting load on Wednesdays' };

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/work-design-interventions', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).send(validBody);
    expect(res.status).toBe(401);
  });

  it('a manager of the named team can create an intervention, starting at status trialling', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a')).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.intervention.status).toBe('trialling');
    expect(res.body.intervention.team).toBe('Team A');
    expect(res.body.intervention.owner).toBe('mgr_a');
    expect(res.body.intervention.startDate).toBeTruthy();
    expect(res.body.intervention.reviewDate).toBeTruthy();
  });

  it('a manager of a different team is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_b'], teamManagers: { mgr_b: ['Team B'] } });
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_b')).send(validBody);
    expect(res.status).toBe(403);
  });

  it('an org admin can create an intervention for any team', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send(validBody);
    expect(res.status).toBe(200);
  });

  it('rejects an invalid body with 400', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send({ team: 'Team A' });
    expect(res.status).toBe(400);
  });

  it('respects a custom reviewInDays', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send({ ...validBody, reviewInDays: 7 });
    const startMs = new Date(res.body.intervention.startDate).getTime();
    const reviewMs = new Date(res.body.intervention.reviewDate).getTime();
    expect(Math.round((reviewMs - startMs) / (24 * 60 * 60 * 1000))).toBe(7);
  });
});

describe('GET /api/org/:orgId/work-design-interventions', () => {
  it("a manager sees only their own team's interventions when no filter is given", async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'],
      teamManagers: { mgr_a: ['Team A'] },
    });
    await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a')).send(validBody);
    await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send({ ...validBody, team: 'Team B' });

    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'));
    expect(res.status).toBe(200);
    expect(res.body.interventions.length).toBe(1);
    expect(res.body.interventions[0].team).toBe('Team A');
  });

  it('an org admin with no filter sees every team', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'],
      teamManagers: { mgr_a: ['Team A'] },
    });
    await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a')).send(validBody);
    await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send({ ...validBody, team: 'Team B' });

    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1'));
    expect(res.body.interventions.length).toBe(2);
  });

  it('a manager requesting a team they do not manage via ?team= is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions?team=Team B`).set(auth('mgr_a'));
    expect(res.status).toBe(403);
  });

  it('a member managing no team is refused when no filter is given', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/work-design-interventions`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/org/:orgId/work-design-interventions/:id/status', () => {
  it('a team manager can update their own intervention\'s status', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.intervention.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/status`).set(auth('mgr_a')).send({ status: 'completed' });
    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'));
    expect(listRes.body.interventions[0].status).toBe('completed');
  });

  it('a manager of a different team cannot update it', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a', 'mgr_b'],
      teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
    });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.intervention.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/status`).set(auth('mgr_b')).send({ status: 'completed' });
    expect(res.status).toBe(403);
  });

  it('404s for a non-existent intervention', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/does_not_exist/status`).set(auth('owner_1')).send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status with 400', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1')).send(validBody);
    const id = createRes.body.intervention.id;
    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/status`).set(auth('owner_1')).send({ status: 'paused' });
    expect(res.status).toBe(400);
  });
});
