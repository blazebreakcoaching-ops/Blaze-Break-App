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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; teamManagers?: Record<string, string[]>; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    teamManagers: opts.teamManagers || {},
    privacyThreshold: opts.privacyThreshold ?? 1,
  });
  (opts.memberUids || []).forEach((uid) => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));
}

beforeEach(() => resetStore());

describe('PATCH /api/org/:orgId/suggestions/:id/respond', () => {
  it('requires authentication', async () => {
    const res = await request(app).patch(`/api/org/${ORG}/suggestions/s1/respond`).send({ note: 'x' });
    expect(res.status).toBe(401);
  });

  it('refuses a non-admin', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).patch(`/api/org/${ORG}/suggestions/s1/respond`).set(auth('member_1')).send({ note: 'x' });
    expect(res.status).toBe(403);
  });

  it('404s for a non-existent suggestion', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).patch(`/api/org/${ORG}/suggestions/does_not_exist/respond`).set(auth('owner_1')).send({ note: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects a body with neither linkedInterventionId nor note', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const suggestRes = await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    expect(suggestRes.status).toBe(200);
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    const res = await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({});
    expect(res.status).toBe(400);
  });

  it('rejects a whitespace-only note rather than storing a blank response', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const suggestRes = await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    expect(suggestRes.status).toBe(200);
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    const res = await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({ note: '   ' });
    expect(res.status).toBe(400);
  });

  it('trims a note before storing it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    const res = await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({ note: '  We are looking into it.  ' });
    expect(res.status).toBe(200);
  });

  it('rejects linking to an intervention that does not exist', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    const res = await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({ linkedInterventionId: 'does_not_exist' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/org/:orgId/suggestions — You Said -> We Changed response', () => {
  it('returns response: null when nobody has reviewed the suggestion yet', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });

    const res = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    expect(res.body.suggestions[0].response).toBeNull();
  });

  it("returns a not_yet response after an admin leaves an honest 'we haven't changed this yet' note", async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({ note: "We haven't changed this yet, but we're looking into it." });

    const res = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    expect(res.body.suggestions[0].response.type).toBe('not_yet');
  });

  it('returns a changed response once the linked intervention has a positive outcome, reflecting the CURRENT state live', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], teamManagers: { owner_1: ['Team A'] } });
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('owner_1')).send({ message: 'Meetings run too long' });
    const listRes = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    const id = listRes.body.suggestions[0].id;

    const interventionRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('owner_1'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'From anonymous suggestion', employeeBurden: 'low' });
    const interventionId = interventionRes.body.intervention.id;
    await request(app).patch(`/api/org/${ORG}/suggestions/${id}/respond`).set(auth('owner_1')).send({ linkedInterventionId: interventionId });

    const beforeOutcome = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    expect(beforeOutcome.body.suggestions[0].response.type).toBe('in_progress');

    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${interventionId}/outcome`).set(auth('owner_1')).send({ outcomeRating: 'useful' });

    const afterOutcome = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('owner_1'));
    expect(afterOutcome.body.suggestions[0].response.type).toBe('changed');
  });
});
