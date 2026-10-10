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

function connectCalendar(uid: string, updatedAt: string) {
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt, totalMeetingHours: 10, backToBackCount: 1, eveningMeetingCount: 0, weekendMeetingCount: 0 });
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/data-coverage — access control', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/data-coverage`);
    expect(res.status).toBe(401);
  });

  it('a plain member without admin rights is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('an org admin can access it', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/org/:orgId/data-coverage — org-level gate', () => {
  it('locks below the organisation privacy threshold, with no connector rows', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    consenting('owner_1');
    consenting('member_1');

    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5, connectors: [] });
  });
});

describe('GET /api/org/:orgId/data-coverage — per-connector coverage', () => {
  it('reports a real connected count and coverage percent once enough members have connected', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    const nowIso = new Date().toISOString();
    ['a1', 'a2', 'a3'].forEach(consenting);
    connectCalendar('a1', nowIso);
    connectCalendar('a2', nowIso);

    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    const calendar = res.body.connectors.find((c: any) => c.key === 'calendar');
    expect(calendar.totalConsentingMembers).toBe(3);
    expect(calendar.connectedCount).toBeNull();
    expect(calendar.sufficiencyMessage).toMatch(/Not enough members/);
  });

  it('withholds the connected count (never a revealed small number) when fewer than the threshold have connected', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3', 'a4', 'a5'], privacyThreshold: 3 });
    const nowIso = new Date().toISOString();
    ['a1', 'a2', 'a3', 'a4', 'a5'].forEach(consenting);
    connectCalendar('a1', nowIso);

    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    const calendar = res.body.connectors.find((c: any) => c.key === 'calendar');
    expect(calendar.connectedCount).toBeNull();
    expect(calendar.coveragePercent).toBeNull();
    expect(calendar.sufficiencyMessage).toMatch(/Not enough members/);
  });

  it('treats a stale calendar sync as not connected, never a zero masquerading as real coverage', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3 });
    const staleIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    ['a1', 'a2', 'a3'].forEach(consenting);
    connectCalendar('a1', staleIso);
    connectCalendar('a2', staleIso);
    connectCalendar('a3', staleIso);

    const res = await request(app).get(`/api/org/${ORG}/data-coverage`).set(auth('owner_1'));
    const calendar = res.body.connectors.find((c: any) => c.key === 'calendar');
    expect(calendar.connectedCount).toBeNull();
    expect(calendar.sufficiencyMessage).toMatch(/Not enough members/);
  });
});
