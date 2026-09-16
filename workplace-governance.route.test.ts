import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for the Workplace Governance Console's server surface:
// GET /api/org/:orgId/governance (roles reference + real member roles +
// privacy threshold), and that the three admin actions the plan identified
// as missing audit coverage (team assignment, cost-inputs save, settings/
// threshold save) now actually write to the audit log the console reads.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }),
    getUser: async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: null }),
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

const ORG = 'org_1';
const OWNER = 'owner_uid';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(overrides: Record<string, unknown> = {}) {
  seedDoc(`organisations/${ORG}`, {
    adminUids: [OWNER],
    memberUids: [OWNER],
    privacyThreshold: 5,
    ...overrides,
  });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/governance', () => {
  it('requires authentication', async () => {
    seedOrg();
    expect((await request(app).get(`/api/org/${ORG}/governance`)).status).toBe(401);
  });

  it('forbids someone with no organisation permission', async () => {
    seedOrg();
    const res = await request(app).get(`/api/org/${ORG}/governance`).set(auth('random_person'));
    expect(res.status).toBe(403);
  });

  it('returns the real privacy threshold, member roles, and the org-rbac role/permission reference', async () => {
    seedOrg({ memberUids: [OWNER, 'member_a'] });
    const res = await request(app).get(`/api/org/${ORG}/governance`).set(auth(OWNER));
    expect(res.status).toBe(200);
    expect(res.body.privacyThreshold).toBe(5);

    const owner = res.body.members.find((m: any) => m.uid === OWNER);
    expect(owner.role).toBe('owner'); // resolved via the legacy adminUids fallback
    const member = res.body.members.find((m: any) => m.uid === 'member_a');
    expect(member.role).toBe('member'); // resolved via the legacy memberUids fallback

    // The reference table is real data from org-rbac.ts, not hand-copied -
    // spot-check a couple of roles it must contain with the right shape.
    expect(res.body.roleReference.owner).toEqual(expect.arrayContaining(['org.roles.manage', 'org.audit.read']));
    expect(res.body.roleReference.member).not.toContain('org.roles.manage');
  });
});

describe('audit trail now covers previously-unlogged Workplace actions', () => {
  it('logs a team-label assignment', async () => {
    seedOrg({ memberUids: [OWNER, 'member_a'] });
    await request(app)
      .post(`/api/org/${ORG}/members/member_a/team`)
      .set(auth(OWNER))
      .send({ team: 'Design' });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth(OWNER));
    expect(res.body.logs.some((l: any) => l.action === 'assign_member_team' && l.targetResourceId === 'member_a')).toBe(true);
  });

  it('logs a cost-inputs save', async () => {
    seedOrg();
    await request(app)
      .post(`/api/org/${ORG}/cost-inputs`)
      .set(auth(OWNER))
      .send({ annualSicknessDays: 10, avgDailyCostPerEmployee: 200, headcount: 50 });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth(OWNER));
    expect(res.body.logs.some((l: any) => l.action === 'update_cost_inputs')).toBe(true);
  });

  it('logs a settings/privacy-threshold save', async () => {
    seedOrg();
    await request(app)
      .post(`/api/org/${ORG}/settings`)
      .set(auth(OWNER))
      .send({ privacyThreshold: 10 });

    const res = await request(app).get(`/api/org/${ORG}/audit-logs`).set(auth(OWNER));
    const entry = res.body.logs.find((l: any) => l.action === 'update_org_settings');
    expect(entry).toBeTruthy();
    expect(entry.before.privacyThreshold).toBe(5);
    expect(entry.after.privacyThreshold).toBe(10);
  });
});
