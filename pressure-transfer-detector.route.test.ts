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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; teamManagers?: Record<string, string[]> } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    teamManagers: opts.teamManagers || {},
    privacyThreshold: 3,
  });
}

function connectCalendar(uid: string, metrics: { totalMeetingHours: number; backToBackCount: number; eveningMeetingCount: number; weekendMeetingCount: number }) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: new Date().toISOString(), ...metrics });
}

const TEAM_UIDS = ['a1', 'a2', 'a3'];
const seedTeam = () => seedOrg(ORG, {
  adminUids: ['owner_1'],
  memberUids: ['owner_1', 'mgr_a', ...TEAM_UIDS],
  memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
  teamManagers: { mgr_a: ['Team A'] },
});

beforeEach(() => resetStore());

describe('Pressure Transfer Detector — captured at trial start, checked at outcome', () => {
  it('captures a real signalSnapshotAtStart when the team cohort is big enough', async () => {
    seedTeam();
    TEAM_UIDS.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 20, backToBackCount: 3, eveningMeetingCount: 0, weekendMeetingCount: 0 }));

    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
    expect(res.body.intervention.signalSnapshotAtStart).not.toBeNull();
    expect(res.body.intervention.signalSnapshotAtStart.avgMeetingHoursPerWeek).toBe(20);
  });

  it('leaves signalSnapshotAtStart null when the cohort is not big enough yet', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a', 'a1'], memberTeams: { a1: 'Team A' }, teamManagers: { mgr_a: ['Team A'] } });
    connectCalendar('a1', { totalMeetingHours: 20, backToBackCount: 3, eveningMeetingCount: 0, weekendMeetingCount: 0 });

    const res = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
    expect(res.body.intervention.signalSnapshotAtStart).toBeNull();
  });

  it('flags no pressure transfer when meeting hours genuinely improve and nothing else worsens', async () => {
    seedTeam();
    TEAM_UIDS.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 20, backToBackCount: 3, eveningMeetingCount: 0, weekendMeetingCount: 0 }));
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
    const id = createRes.body.intervention.id;

    TEAM_UIDS.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 14, backToBackCount: 3, eveningMeetingCount: 0, weekendMeetingCount: 0 }));
    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });
    expect(res.body.pressureTransferCheck).toBeNull();
  });

  it('flags a pressure transfer to evening meetings when hours drop but evening share rises', async () => {
    seedTeam();
    TEAM_UIDS.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 20, backToBackCount: 3, eveningMeetingCount: 0, weekendMeetingCount: 0 }));
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
    const id = createRes.body.intervention.id;

    // All three now log evening meetings (100% share, up from 0%) while
    // the headline hours figure dropped - a real transfer pattern.
    TEAM_UIDS.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 14, backToBackCount: 3, eveningMeetingCount: 2, weekendMeetingCount: 0 }));
    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });
    expect(res.body.pressureTransferCheck).not.toBeNull();
    expect(res.body.pressureTransferCheck.movedTo).toBe('evening_meetings');
    expect(res.body.pressureTransferCheck.message.toLowerCase()).not.toContain('caused');
  });

  it('leaves pressureTransferCheck null when no signalSnapshotAtStart was ever captured', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'mgr_a', 'a1'], memberTeams: { a1: 'Team A' }, teamManagers: { mgr_a: ['Team A'] } });
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'basis', employeeBurden: 'low' });
    const id = createRes.body.intervention.id;

    const res = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${id}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });
    expect(res.body.pressureTransferCheck).toBeNull();
  });
});
