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
    privacyThreshold: 3,
  });
}

const validBody = { team: 'Team A', signalKey: 'meeting_pressure', description: 'Meetings routinely run through lunch.' };

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/work-design-debt', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(`/api/org/${ORG}/work-design-debt`).send(validBody);
    expect(res.status).toBe(401);
  });

  it('a manager of the named team can create a debt item, starting at status identified with no owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const res = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.debt.status).toBe('identified');
    expect(res.body.debt.ownerUid).toBeNull();
  });

  it('a manager of a different team is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_b'], teamManagers: { mgr_b: ['Team B'] } });
    const res = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_b')).send(validBody);
    expect(res.status).toBe(403);
  });

  it('rejects an invalid body with 400', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('owner_1')).send({ team: 'Team A' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/org/:orgId/work-design-debt', () => {
  it("a manager sees only their own team's debt items when no filter is given", async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('owner_1')).send({ ...validBody, team: 'Team B' });

    const res = await request(app).get(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a'));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].team).toBe('Team A');
  });

  it('an org admin with no filter sees every team', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('owner_1')).send({ ...validBody, team: 'Team B' });

    const res = await request(app).get(`/api/org/${ORG}/work-design-debt`).set(auth('owner_1'));
    expect(res.body.items.length).toBe(2);
  });
});

describe('PATCH /api/org/:orgId/work-design-debt/:id/owner', () => {
  it('assigns a real org member as owner', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.debt.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });
    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a'));
    expect(listRes.body.items[0].ownerUid).toBe('mgr_a');
  });

  it('refuses an ownerUid that is not a real member of the org', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.debt.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/owner`).set(auth('mgr_a')).send({ ownerUid: 'not_a_member' });
    expect(res.status).toBe(400);
  });

  it('404s for a non-existent debt item', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/does_not_exist/owner`).set(auth('owner_1')).send({ ownerUid: 'owner_1' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/org/:orgId/work-design-debt/:id/status — mandatory owner + no-coaching-tolerance rules enforced end to end', () => {
  it('refuses to move past "identified" with no owner assigned', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.debt.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/status`).set(auth('mgr_a')).send({ status: 'owned' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/owner/i);
  });

  it('allows moving to "owned" once an owner has been assigned', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.debt.id;
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/status`).set(auth('mgr_a')).send({ status: 'owned' });
    expect(res.status).toBe(200);
  });

  it('refuses to resolve with no linked intervention', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const id = createRes.body.debt.id;
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${id}/status`).set(auth('mgr_a')).send({ status: 'resolved' });
    expect(res.status).toBe(400);
  });

  it('refuses to resolve when the linked intervention has no outcome recorded yet', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const debtRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const debtId = debtRes.body.debt.id;
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });

    const interventionRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis' });
    const interventionId = interventionRes.body.intervention.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a'))
      .send({ status: 'resolved', linkedInterventionId: interventionId });
    expect(res.status).toBe(400);
  });

  it('refuses to resolve when the linked intervention outcome was "created_another_problem"', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const debtRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const debtId = debtRes.body.debt.id;
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });

    const interventionRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis' });
    const interventionId = interventionRes.body.intervention.id;
    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${interventionId}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'created_another_problem' });

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a'))
      .send({ status: 'resolved', linkedInterventionId: interventionId });
    expect(res.status).toBe(400);
  });

  it('allows resolving once the linked intervention outcome was recorded as "useful"', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a'], teamManagers: { mgr_a: ['Team A'] } });
    const debtRes = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a')).send(validBody);
    const debtId = debtRes.body.debt.id;
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });

    const interventionRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis' });
    const interventionId = interventionRes.body.intervention.id;
    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${interventionId}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });

    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a'))
      .send({ status: 'resolved', linkedInterventionId: interventionId });
    expect(res.status).toBe(200);

    const listRes = await request(app).get(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a'));
    expect(listRes.body.items[0].status).toBe('resolved');
    expect(listRes.body.items[0].linkedInterventionId).toBe(interventionId);
  });

  it('404s for a non-existent debt item', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).patch(`/api/org/${ORG}/work-design-debt/does_not_exist/status`).set(auth('owner_1')).send({ status: 'owned' });
    expect(res.status).toBe(404);
  });
});
