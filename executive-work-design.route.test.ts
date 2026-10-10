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
import { seedDoc, resetStore, allPaths } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; privacyThreshold?: number; costInputs?: any } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    privacyThreshold: opts.privacyThreshold ?? 3,
    costInputs: opts.costInputs ?? null,
  });
}

function consenting(uid: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/executive-work-design — access control', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`);
    expect(res.status).toBe(401);
  });

  it('a plain member without admin rights is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('an org admin can access it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/org/:orgId/executive-work-design — cohort gating', () => {
  it('locks below the organisation privacy threshold, with no signals or estimate', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    consenting('owner_1');
    consenting('member_1');

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5, workDesignSignals: [], financialEstimate: null });
  });

  it('returns a real org-wide Work Design Signal once the cohort is sufficient', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    ['a1', 'a2', 'a3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.workDesignSignals).toHaveLength(1);
    expect(res.body.workDesignSignals[0].key).toBe('meeting_pressure');
  });
});

describe('GET /api/org/:orgId/executive-work-design — financial range estimate', () => {
  it('reports costInputsAvailable:false and financialEstimate:null when the org has not entered cost figures', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    ['a1', 'a2', 'a3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body.costInputsAvailable).toBe(false);
    expect(res.body.financialEstimate).toBeNull();
  });

  it('never fabricates a financial estimate when the signal itself has insufficient data, even with cost inputs entered', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3,
      costInputs: { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 },
    });
    ['a1', 'a2', 'a3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body.costInputsAvailable).toBe(true);
    // No calendar signals connected, so meeting pressure band is null (insufficient data) -> no estimate.
    expect(res.body.workDesignSignals[0].band).toBeNull();
    expect(res.body.financialEstimate).toBeNull();
  });

  it('returns a real low/high range, never a single figure, when the signal is sustained and cost inputs exist', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3,
      costInputs: { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 },
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      consenting(uid);
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 30, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body.workDesignSignals[0].band).toBe('sustained');
    expect(res.body.financialEstimate).not.toBeNull();
    expect(res.body.financialEstimate.lowEstimate).toBeLessThan(res.body.financialEstimate.highEstimate);
    expect(res.body.financialEstimate.assumptionNote).toMatch(/Illustrative only/);
  });
});

describe('GET /api/org/:orgId/executive-work-design — baseline period, confidence, and stale handling', () => {
  const seedFreshCohort = (updatedAt: string) => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    for (const uid of ['a1', 'a2', 'a3']) {
      consenting(uid);
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt, totalMeetingHours: 10, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0 });
    }
  };

  it('attaches a real confidence level once the signal is available, and records today\'s org-wide baseline exactly once even across two calls', async () => {
    seedFreshCohort(new Date().toISOString());

    const res1 = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res1.body.workDesignSignals[0].confidence).not.toBeNull();
    expect(res1.body.workDesignSignals[0].confidenceExplanation).toBeTruthy();

    const historyAfterFirst = allPaths().filter((p) => p.startsWith(`organisations/${ORG}/work_design_signal_history/`));
    expect(historyAfterFirst).toHaveLength(1);

    await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    const historyAfterSecond = allPaths().filter((p) => p.startsWith(`organisations/${ORG}/work_design_signal_history/`));
    expect(historyAfterSecond).toHaveLength(1);
  });

  it('a baseline first observed available ~30 days ago is reflected as a real multi-week daysObserved, not just "today"', async () => {
    seedFreshCohort(new Date().toISOString());
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    seedDoc(`organisations/${ORG}/work_design_signal_history/old`, { recordedAt: thirtyDaysAgo, meetingPressureAvailable: true });

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body.workDesignSignals[0].confidenceExplanation).toMatch(/(29|30) days/);
  });

  it('reports the stale-specific message when enough members connected a calendar before but none have synced within the freshness window', async () => {
    const staleIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    seedFreshCohort(staleIso);

    const res = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(res.body.workDesignSignals[0].sufficiencyStatus).toBe('stale');
    expect(res.body.workDesignSignals[0].sufficiencyMessage).toMatch(/synced/);
    expect(res.body.workDesignSignals[0].confidence).toBeNull();
  });
});
