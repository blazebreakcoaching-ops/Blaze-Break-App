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
import { seedDoc, getDocRaw, resetStore } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string> } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
  });
}

function seedMember(orgId: string, uid: string, role: string) {
  seedDoc(`organisations/${orgId}/members/${uid}`, { role, status: 'active', email: `${uid}@test.dev` });
}

beforeEach(() => resetStore());

describe('POST /api/org/:orgId/members/:memberUid/manage-teams', () => {
  it('an owner can designate a member as manager of a real team', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_1'], memberTeams: { mgr_1: 'Engineering' } });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('owner_1')).send({ teams: ['Engineering'] });
    expect(res.status).toBe(200);
    expect(res.body.teams).toEqual(['Engineering']);
    const stored = await getDocRaw(`organisations/${ORG}`);
    expect(stored?.teamManagers?.mgr_1).toEqual(['Engineering']);
  });

  it('a plain member cannot assign a team manager', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1', 'mgr_1'], memberTeams: { mgr_1: 'Engineering' } });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    const res = await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('member_1')).send({ teams: ['Engineering'] });
    expect(res.status).toBe(403);
  });

  it('rejects assigning a team no member is currently in - there is no team-creation flow', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('owner_1')).send({ teams: ['Nonexistent Team'] });
    expect(res.status).toBe(400);
  });

  it('rejects designating someone who is not a member of the org', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'], memberTeams: {} });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/members/stranger/manage-teams`).set(auth('owner_1')).send({ teams: [] });
    expect(res.status).toBe(400);
  });

  it('an empty teams array clears any existing manager assignment', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_1'], memberTeams: { mgr_1: 'Engineering' } });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('owner_1')).send({ teams: ['Engineering'] });
    const res = await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('owner_1')).send({ teams: [] });
    expect(res.status).toBe(200);
    const stored = await getDocRaw(`organisations/${ORG}`);
    expect(stored?.teamManagers?.mgr_1).toBeUndefined();
  });

  it('records a real before/after diff in the audit log', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_1'], memberTeams: { mgr_1: 'Engineering' } });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/members/mgr_1/manage-teams`).set(auth('owner_1')).send({ teams: ['Engineering'] });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'assign_team_manager');
    expect(entry).toBeTruthy();
    expect(entry.before.teams).toEqual([]);
    expect(entry.after.teams).toEqual(['Engineering']);
  });
});

describe('GET/POST /api/org/:orgId/hr-viewers', () => {
  it('an owner can set and read the HR viewer allow-list', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'hr_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const postRes = await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1')).send({ uids: ['hr_1'] });
    expect(postRes.status).toBe(200);
    const getRes = await request(app).get(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1'));
    expect(getRes.body.uids).toEqual(['hr_1']);
  });

  it('a plain member cannot read or write the HR viewer list', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    seedMember(ORG, 'member_1', 'member');
    expect((await request(app).get(`/api/org/${ORG}/hr-viewers`).set(auth('member_1'))).status).toBe(403);
    expect((await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('member_1')).send({ uids: [] })).status).toBe(403);
  });

  it('rejects designating a non-member as an HR viewer', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1')).send({ uids: ['stranger'] });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed uids field', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    const res = await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1')).send({ uids: 'hr_1' });
    expect(res.status).toBe(400);
  });

  it('records a real before/after diff in the audit log', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'hr_1'] });
    seedMember(ORG, 'owner_1', 'owner');
    await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1')).send({ uids: ['hr_1'] });
    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth('owner_1'));
    const entry = res.body.logs.find((l: any) => l.action === 'update_hr_viewers');
    expect(entry).toBeTruthy();
    expect(entry.before.uids).toEqual([]);
    expect(entry.after.uids).toEqual(['hr_1']);
  });
});
