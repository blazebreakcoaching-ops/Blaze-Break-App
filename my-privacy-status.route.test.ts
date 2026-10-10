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

function seedOrg(orgId: string, opts: { memberUids?: string[]; memberTeams?: Record<string, string>; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function consenting(uid: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/my-privacy-status — access control', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('a plain member (no admin rights needed) can access it', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/org/:orgId/my-privacy-status — honest, count-free status', () => {
  it('reveals the minimum group size (a policy number, not personal data)', async () => {
    seedOrg(ORG, { memberUids: ['a1'], privacyThreshold: 7 });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.body.minimumGroupSize).toBe(7);
  });

  it('reports the org cohort as insufficient when too few have consented, with no count ever shown', async () => {
    seedOrg(ORG, { memberUids: ['a1', 'a2', 'a3', 'a4', 'a5'], privacyThreshold: 3 });
    consenting('a1');
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.body.orgCohortSufficient).toBe(false);
    expect(res.body).not.toHaveProperty('cohortSize');
    expect(res.body).not.toHaveProperty('connectedCount');
  });

  it('reports the org cohort as sufficient once enough members have consented', async () => {
    seedOrg(ORG, { memberUids: ['a1', 'a2', 'a3'], privacyThreshold: 3 });
    ['a1', 'a2', 'a3'].forEach(consenting);
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.body.orgCohortSufficient).toBe(true);
  });

  it('returns myTeam: null and myTeamCohortSufficient: null for a member with no team assigned', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(res.body.myTeam).toBeNull();
    expect(res.body.myTeamCohortSufficient).toBeNull();
  });

  it("reports the member's own team's sufficiency independently of the org-wide figure", async () => {
    seedOrg(ORG, {
      memberUids: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B' },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3', 'b1'].forEach(consenting);

    const resA = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(resA.body.myTeam).toBe('Team A');
    expect(resA.body.myTeamCohortSufficient).toBe(true);
    expect(resA.body.orgCohortSufficient).toBe(true);

    const resB = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('b1'));
    expect(resB.body.myTeam).toBe('Team B');
    expect(resB.body.myTeamCohortSufficient).toBe(false);
    expect(resB.body.orgCohortSufficient).toBe(true);
  });
});
