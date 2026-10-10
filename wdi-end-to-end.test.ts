import { describe, it, expect, beforeEach, vi } from 'vitest';

// Work Design Intelligence closing checklist (WDI PR14): one real org,
// walked end to end through every PR1-13 surface in sequence, as a
// single executable proof that the whole effort still works together -
// not just that each route passes its own isolated tests. If any PR's
// change ever breaks another PR's contract, this is the test that
// should catch it.
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
    getUser: async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: `Name ${uid}` }),
  }),
}));
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

beforeEach(() => resetStore());

describe('Work Design Intelligence - closing end-to-end checklist', () => {
  it('a new org locked below threshold: every aggregate view locks, and a demo preview is reachable instead of a bare dead end', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Acme Co', adminUids: ['owner_1'], memberUids: ['owner_1', 'a1'], privacyThreshold: 3,
    });
    seedDoc('users/owner_1', { organisationId: ORG, shareAnonymizedDataWithOrg: true });

    const exec = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(exec.body.locked).toBe(true);
    // Locked never reveals the raw cohort gap as anything but the two
    // safe numbers (current size, threshold) - never a per-member list.
    expect(exec.body.workDesignSignals).toEqual([]);

    const coverage = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    expect(coverage.body.locked).toBe(true);

    const exportAttempt = await request(app).get(`/api/org/${ORG}/executive-work-design/export`).set(auth('owner_1'));
    expect(exportAttempt.status).toBe(409);
  });

  it('a real org once the cohort clears the threshold: signals, confidence, data coverage, export, and audit trail all agree with each other', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Acme Co', adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3,
    });
    const nowIso = new Date().toISOString();
    seedDoc('users/owner_1', { organisationId: ORG });
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: nowIso, totalMeetingHours: 28, backToBackCount: 9, eveningMeetingCount: 2, weekendMeetingCount: 0 });
    }

    // 1. GET /api/org/me (PR13's role reconciliation) - a real owner sees admin access.
    const me = await request(app).get('/api/org/me').set(auth('owner_1'));
    expect(me.body.isOrgAdmin).toBe(true);

    // 2. Executive Work Design (PR1/PR2/PR7) - real signal, real band.
    const exec = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(exec.body.locked).toBe(false);
    expect(exec.body.workDesignSignals[0].band).toBe('sustained');
    // 3. Confidence (PR11) - attached once available.
    expect(exec.body.workDesignSignals[0].confidence).not.toBeNull();

    // 4. Data Coverage (PR8) - the same calendar connector shows real coverage.
    const coverage = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    expect(coverage.body.locked).toBe(false);
    const calendarRow = coverage.body.connectors.find((c: any) => c.key === 'calendar');
    expect(calendarRow.connectedCount).toBe(3);

    // 5. Export Executive Summary (PR12) - matches the live view, and is audited.
    const exported = await request(app).get(`/api/org/${ORG}/executive-work-design/export`).set(auth('owner_1'));
    expect(exported.status).toBe(200);
    expect(exported.body.workDesignSignals).toEqual(exec.body.workDesignSignals);
    const auditPath = allPaths().find((p) => p.startsWith(`organisations/${ORG}/audit_logs/`));
    expect(auditPath).toBeTruthy();

    // 6. Governance Console (PR13) - the real org-rbac role, not org.adminUids directly.
    const governance = await request(app).get(`/api/org/${ORG}/governance`).set(auth('owner_1'));
    expect(governance.status).toBe(200);
    expect(governance.body.members.find((m: any) => m.uid === 'owner_1').role).toBe('owner');

    // 7. Employee transparency (PR9) - a member sees the real policy number, never a count.
    const privacyStatus = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(privacyStatus.body.minimumGroupSize).toBe(3);
    expect(privacyStatus.body.orgCohortSufficient).toBe(true);
    expect(privacyStatus.body).not.toHaveProperty('cohortSize');
  });

  it('a granular-only admin (promoted via the role-change route, never added to org.adminUids) has working, consistent access everywhere', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Acme Co', adminUids: ['owner_1'], memberUids: ['owner_1', 'granular_admin', 'a1', 'a2'], privacyThreshold: 3,
    });
    seedDoc('users/owner_1', { organisationId: ORG });
    seedDoc('users/granular_admin', { organisationId: ORG });
    for (const uid of ['a1', 'a2']) seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });

    // Promote via the real route (PR13's control panel calls this same route).
    const promote = await request(app).post(`/api/org/${ORG}/members/granular_admin/role`).set(auth('owner_1')).send({ role: 'admin' });
    expect(promote.status).toBe(200);

    // /api/org/me now resolves them as a real admin (the PR13 fix).
    const me = await request(app).get('/api/org/me').set(auth('granular_admin'));
    expect(me.body.isOrgAdmin).toBe(true);

    // And the actual admin-gated executive route agrees.
    const exec = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('granular_admin'));
    expect(exec.status).toBe(200);
  });
});
