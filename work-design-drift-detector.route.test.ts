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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; teamManagers?: Record<string, string[]>; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    teamManagers: opts.teamManagers || {},
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function connectCalendar(uid: string, metrics: { totalMeetingHours: number; backToBackCount: number; eveningMeetingCount: number; weekendMeetingCount: number }) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: new Date().toISOString(), ...metrics });
}

const TEAM_A = ['a1', 'a2', 'a3'];
const TEAM_B = ['b1', 'b2', 'b3'];

async function promoteMeetingPressure() {
  seedOrg(ORG, {
    adminUids: ['owner_1'],
    memberUids: ['owner_1', 'mgr_a', 'mgr_b', ...TEAM_A, ...TEAM_B],
    teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
  });
  const c1 = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
    .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
  await request(app).patch(`/api/org/${ORG}/work-design-interventions/${c1.body.intervention.id}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });
  const c2 = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_b'))
    .send({ team: 'Team B', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
  await request(app).patch(`/api/org/${ORG}/work-design-interventions/${c2.body.intervention.id}/outcome`).set(auth('mgr_b')).send({ outcomeRating: 'useful' });
  const promoteRes = await request(app).post(`/api/org/${ORG}/what-works-here/meeting_pressure/promote`).set(auth('owner_1'));
  expect(promoteRes.status).toBe(200);
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/work-design-drift', () => {
  it('requires authentication', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/work-design-drift`);
    expect(res.status).toBe(401);
  });

  it('refuses a non-member', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/work-design-drift`).set(auth('stranger'));
    expect(res.status).toBe(403);
  });

  it('returns no findings when nothing has been promoted yet', async () => {
    seedOrg(ORG, { memberUids: ['a1'] });
    const res = await request(app).get(`/api/org/${ORG}/work-design-drift`).set(auth('a1'));
    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual([]);
  });

  it('returns no finding when the promoted signal is currently low/typical', async () => {
    await promoteMeetingPressure();
    [...TEAM_A, ...TEAM_B].forEach((uid) => connectCalendar(uid, { totalMeetingHours: 5, backToBackCount: 0, eveningMeetingCount: 0, weekendMeetingCount: 0 }));

    const res = await request(app).get(`/api/org/${ORG}/work-design-drift`).set(auth('owner_1'));
    expect(res.body.findings).toEqual([]);
  });

  it('flags drift when the promoted signal has regressed to a sustained band', async () => {
    await promoteMeetingPressure();
    [...TEAM_A, ...TEAM_B].forEach((uid) => connectCalendar(uid, { totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0 }));

    const res = await request(app).get(`/api/org/${ORG}/work-design-drift`).set(auth('owner_1'));
    expect(res.body.findings).toHaveLength(1);
    expect(res.body.findings[0].signalKey).toBe('meeting_pressure');
    expect(res.body.findings[0].message).toContain('Sustained');
  });
});
