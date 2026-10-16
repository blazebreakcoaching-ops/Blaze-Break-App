import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/org/:orgId/dashboard - the Work Design Pulse
// admin default view. Previously zero coverage of any kind. Renders the
// exact same buildExecutiveWorkDesignPayload the Executive Work Design
// report uses (see executive-work-design.route.test.ts for the full
// cohort-gating/narrative matrix) - these tests focus on this route's own
// wiring: access control, the locked/unlocked response shape it exposes,
// and its defensive catch block.
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
import { seedDoc, resetStore, forceDocError } from './test/fake-firestore';

const ORG = 'org_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function consenting(uid: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/dashboard — access control', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/dashboard`);
    expect(res.status).toBe(401);
  });

  it('a plain member without admin rights is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/dashboard`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('an org admin can access it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/org/:orgId/dashboard — response shape', () => {
  it('locks below the organisation privacy threshold, with no signals/narrative/budget', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    consenting('owner_1');
    consenting('member_1');

    const res = await request(app).get(`/api/org/${ORG}/dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5, workDesignSignals: [], financialEstimate: null });
  });

  it('returns real signals, narrative, action budget, and debt summary once the cohort is sufficient', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    ['a1', 'a2', 'a3'].forEach(consenting);

    const res = await request(app).get(`/api/org/${ORG}/dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.cohortSize).toBe(3);
    expect(res.body.threshold).toBe(3);
    expect(res.body.workDesignSignals).toHaveLength(1);
    expect(res.body.workDesignSignals[0].key).toBe('meeting_pressure');
    expect(res.body.actionBudget).toEqual({ maxConcurrentActiveInterventions: 3, activeInterventionCount: 0 });
    expect(res.body.debtSummary).toEqual({ openDebtCount: 0, openDebtWithoutOwnerCount: 0 });
    expect(typeof res.body.narrative).toBe('string');
    // This route never exposes cost/financial fields - that's
    // executive-work-design's job, not the default admin dashboard view's.
    expect(res.body.financialEstimate).toBeUndefined();
    expect(res.body.costInputsAvailable).toBeUndefined();
  });
});

describe('GET /api/org/:orgId/dashboard — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the org read throws', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`organisations/${ORG}`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get(`/api/org/${ORG}/dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
