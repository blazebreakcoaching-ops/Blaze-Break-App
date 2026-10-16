import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/org/:orgId/members (previously zero coverage)
// and the validation/catch-block gaps on POST /api/org/:orgId/members/:memberUid/team
// (which already had a happy-path audit-log assertion in
// workplace-governance.route.test.ts).
const h = vi.hoisted(() => ({
  getUser: vi.fn(async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: null })),
}));

process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }), getUser: h.getUser }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceDocError } from './test/fake-firestore';

const ORG = 'org_1';
const OWNER = 'owner_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; hrViewerUids?: string[] } = {}) {
  seedDoc(`organisations/${ORG}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [OWNER],
    memberUids: opts.memberUids || [OWNER],
    memberTeams: opts.memberTeams || {},
    hrViewerUids: opts.hrViewerUids || [],
  });
}

beforeEach(() => {
  resetStore();
  h.getUser.mockClear();
});

describe('GET /api/org/:orgId/members', () => {
  it('requires org admin', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/members`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('lists every member with their real Auth email/displayName, team, and admin status', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'], memberTeams: { member_1: 'Design' } });
    h.getUser.mockImplementation(async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: uid === 'member_1' ? 'Mia' : 'Owner' }));

    const res = await request(app).get(`/api/org/${ORG}/members`).set(auth(OWNER));
    expect(res.status).toBe(200);
    const member = res.body.members.find((m: any) => m.uid === 'member_1');
    expect(member).toMatchObject({ email: 'member_1@test.dev', displayName: 'Mia', isAdmin: false, team: 'Design' });
    const owner = res.body.members.find((m: any) => m.uid === OWNER);
    expect(owner.isAdmin).toBe(true);
    expect(res.body.existingTeams).toEqual(['Design']);
  });

  it('degrades to null email/displayName (not a failure) when the Auth lookup throws for one member', async () => {
    seedOrg({ memberUids: [OWNER, 'ghost_uid'] });
    h.getUser.mockImplementation(async (uid: string) => {
      if (uid === 'ghost_uid') throw new Error('no such Auth user');
      return { uid, email: `${uid}@test.dev`, displayName: null };
    });
    const res = await request(app).get(`/api/org/${ORG}/members`).set(auth(OWNER));
    expect(res.status).toBe(200);
    const ghost = res.body.members.find((m: any) => m.uid === 'ghost_uid');
    expect(ghost).toMatchObject({ email: null, displayName: null, isAdmin: false });
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/members`).set(auth(OWNER));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/org/:orgId/members/:memberUid/team — validation and catch block', () => {
  it('rejects a memberUid who is not actually a member of this organisation', async () => {
    seedOrg({ memberUids: [OWNER] });
    const res = await request(app).post(`/api/org/${ORG}/members/stranger/team`).set(auth(OWNER)).send({ team: 'Design' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string, non-null team value', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/member_1/team`).set(auth(OWNER)).send({ team: 42 });
    expect(res.status).toBe(400);
  });

  it('rejects a team name over 60 characters', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'] });
    const res = await request(app).post(`/api/org/${ORG}/members/member_1/team`).set(auth(OWNER)).send({ team: 'x'.repeat(61) });
    expect(res.status).toBe(400);
  });

  it('clears the team label when team is null', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'], memberTeams: { member_1: 'Design' } });
    const res = await request(app).post(`/api/org/${ORG}/members/member_1/team`).set(auth(OWNER)).send({ team: null });
    expect(res.status).toBe(200);
    expect(getDocRaw(`organisations/${ORG}`)?.memberTeams?.member_1).toBeUndefined();
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg({ memberUids: [OWNER, 'member_1'] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).post(`/api/org/${ORG}/members/member_1/team`).set(auth(OWNER)).send({ team: 'Design' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
