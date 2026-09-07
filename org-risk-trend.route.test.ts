import { describe, it, expect, beforeEach, vi } from 'vitest';

// Integration tests for GET /api/org/:orgId/risk-trend - the endpoint behind
// the Team Climate Trend and Leading Indicators views. The point of these
// tests is the k-ANONYMITY GATE: this feature is only defensible because it
// never exposes a cohort small enough to finger an individual. That gate is
// security-critical and was previously untested at the route level.
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
const ADMIN = 'admin_uid';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

interface Member { uid: string; team: string; consenting: boolean; }

// Seeds an org and its members. threshold is the k-anonymity minimum. A
// member only counts toward a cohort if consenting === true.
function seedOrg(threshold: number, members: Member[]) {
  seedDoc(`organisations/${ORG}`, {
    adminUids: [ADMIN],
    memberUids: members.map((m) => m.uid),
    memberTeams: Object.fromEntries(members.map((m) => [m.uid, m.team])),
    privacyThreshold: threshold,
  });
  for (const m of members) {
    seedDoc(`users/${m.uid}`, { shareAnonymizedDataWithOrg: m.consenting });
  }
}

const members = (n: number, team: string, consenting: boolean, prefix = 'm'): Member[] =>
  Array.from({ length: n }, (_, i) => ({ uid: `${prefix}_${team}_${i}`, team, consenting }));

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/risk-trend — access control', () => {
  it('requires authentication', async () => {
    seedOrg(3, members(3, 'A', true));
    expect((await request(app).get(`/api/org/${ORG}/risk-trend`)).status).toBe(401);
  });

  it('forbids a non-admin of the org', async () => {
    seedOrg(3, members(3, 'A', true));
    const res = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth('some_random_user'));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/org/:orgId/risk-trend — k-anonymity gate', () => {
  it('LOCKS and exposes no wellbeing signal when consenting members are below the threshold', async () => {
    // 5 members but only 2 have consented; threshold is 3.
    seedOrg(3, [...members(2, 'A', true), ...members(3, 'A', false, 'nc')]);
    const res = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth(ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.cohortSize).toBe(2);
    expect(res.body.threshold).toBe(3);
    // Crucially: NONE of the aggregate signal fields are present when locked.
    expect(res.body.overallConcern).toBeUndefined();
    expect(res.body.moodConcern).toBeUndefined();
    expect(res.body.climateConcern).toBeUndefined();
    expect(res.body.teamBreakdown).toBeUndefined();
    expect(res.body.moodTrend).toBeUndefined();
    expect(res.body.climateTrend).toBeUndefined();
  });

  it('UNLOCKS once enough members consent, and returns the leading-indicator trend fields', async () => {
    seedOrg(3, members(3, 'A', true));
    const res = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth(ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.cohortSize).toBe(3);
    // The response carries the per-signal trend fields the new view needs...
    expect(res.body).toHaveProperty('moodTrend');
    expect(res.body).toHaveProperty('climateTrend');
    // ...and with no survey/mood data yet, the direction is honestly 'unknown',
    // never a fabricated trend.
    expect(res.body.trend.direction).toBe('unknown');
    expect(res.body.moodTrend.direction).toBe('unknown');
  });

  it('suppresses a team that is individually below the threshold, even when the org overall is not', async () => {
    // Org has 4 consenting (>= 3, so unlocked): team A has 3, team B has 1.
    seedOrg(3, [...members(3, 'A', true), ...members(1, 'B', true)]);
    const res = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth(ADMIN));

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    const teams = Object.keys(res.body.teamBreakdown || {});
    expect(teams).toContain('A');        // clears the threshold on its own
    expect(teams).not.toContain('B');    // too small — never named or shown
  });

  it('does not count non-consenting members toward a team either', async () => {
    // Team A: 2 consenting + 5 non-consenting. Still below threshold of 3.
    seedOrg(3, [...members(2, 'A', true), ...members(5, 'A', false, 'nc')]);
    const res = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth(ADMIN));
    // 2 consenting org-wide < 3 => locked, and certainly no team breakdown.
    expect(res.body.locked).toBe(true);
    expect(res.body.teamBreakdown).toBeUndefined();
  });
});
