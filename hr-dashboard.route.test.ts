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
const OTHER_ORG = 'org_2';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; hrViewerUids?: string[]; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    hrViewerUids: opts.hrViewerUids || [],
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function consenting(uid: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/hr-dashboard — access control', () => {
  it('a plain member without HR-viewer status is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('a designated HR viewer can access it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'hr_1'], hrViewerUids: ['hr_1'] });
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    expect(res.status).toBe(200);
  });

  it('an org admin can access it without being on the HR-viewer list', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });

  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/org/:orgId/hr-dashboard — sees every qualifying team at once', () => {
  it('returns multiple teams in one response, unlike the manager view', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'hr_1', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B', b2: 'Team B', b3: 'Team B' },
      hrViewerUids: ['hr_1'],
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    expect(res.status).toBe(200);
    const teamNames = res.body.teams.map((t: any) => t.team).sort();
    expect(teamNames).toEqual(['Team A', 'Team B']);
  });

  it('a team below threshold is silently omitted, same rule as risk-trend', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'hr_1', 'a1', 'a2', 'a3', 'b1'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B' },
      hrViewerUids: ['hr_1'],
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3', 'b1'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    const teamNames = res.body.teams.map((t: any) => t.team);
    expect(teamNames).toEqual(['Team A']);
  });

  it('the whole response locks when the org-wide cohort is below threshold, even if hidden below it a team might qualify', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'hr_1', 'a1', 'a2'],
      memberTeams: { a1: 'Team A', a2: 'Team A' },
      hrViewerUids: ['hr_1'],
      privacyThreshold: 5,
    });
    ['a1', 'a2'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    expect(res.body.locked).toBe(true);
    expect(res.body.teams).toEqual([]);
  });
});

describe('GET /api/org/:orgId/hr-dashboard — follow-up status', () => {
  it('reports no_recent_acknowledgment for a team with no ack history', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'hr_1', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      hrViewerUids: ['hr_1'],
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    expect(res.body.teams[0].followUp.status).toBe('no_recent_acknowledgment');
  });

  it('reports acknowledged once a manager has logged one recently', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'hr_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      hrViewerUids: ['hr_1'],
      privacyThreshold: 3,
    });
    seedDoc(`organisations/${ORG}`, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'hr_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      hrViewerUids: ['hr_1'], privacyThreshold: 3,
      teamManagers: { mgr_a: ['Team A'] },
    });
    ['a1', 'a2', 'a3'].forEach(consenting);
    await request(app).post(`/api/org/${ORG}/team-dashboard/Team A/acknowledge`).set(auth('mgr_a')).send({ note: 'Held a check-in.' });

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_1'));
    const teamA = res.body.teams.find((t: any) => t.team === 'Team A');
    expect(teamA.followUp.status).toBe('acknowledged');
    expect(teamA.followUp.lastAcknowledgedBy).toBe('mgr_a');
    expect(teamA.followUp.note).toBe('Held a check-in.');
  });
});

describe('tenant isolation', () => {
  it("org B's HR viewer sees nothing about org A", async () => {
    seedOrg(ORG, { adminUids: ['owner_a'], memberUids: ['owner_a'] });
    seedOrg(OTHER_ORG, { adminUids: ['owner_b'], memberUids: ['owner_b', 'hr_b'], hrViewerUids: ['hr_b'] });

    const res = await request(app).get(`/api/org/${ORG}/hr-dashboard`).set(auth('hr_b'));
    expect(res.status).toBe(403);
  });
});
