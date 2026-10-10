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

function seedOrg(orgId: string, opts: { adminUids?: string[]; memberUids?: string[]; memberTeams?: Record<string, string>; teamManagers?: Record<string, string[]>; privacyThreshold?: number } = {}) {
  seedDoc(`organisations/${orgId}`, {
    name: 'Test Org',
    adminUids: opts.adminUids || [],
    memberUids: opts.memberUids || [],
    memberTeams: opts.memberTeams || {},
    teamManagers: opts.teamManagers || {},
    privacyThreshold: opts.privacyThreshold ?? 3,
  });
}

function seedConsentingMember(uid: string, team: string) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
  return { uid, team };
}

beforeEach(() => resetStore());

describe('GET /api/org/:orgId/team-dashboard — access control', () => {
  it('a member who manages no team and is not an org admin is refused', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('member_1'));
    expect(res.status).toBe(403);
  });

  it('requires authentication', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`);
    expect(res.status).toBe(401);
  });

  it('an org admin with no managed team of their own is let through, seeing zero teams', async () => {
    seedOrg(ORG, { adminUids: ['owner_1'], memberUids: ['owner_1'] });
    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.teams).toEqual([]);
  });

  it("a manager of Team A cannot see Team B's data - only their own managed team is ever returned", async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B', b2: 'Team B', b3: 'Team B' },
      teamManagers: { mgr_a: ['Team A'] },
    });
    [seedConsentingMember('a1', 'A'), seedConsentingMember('a2', 'A'), seedConsentingMember('a3', 'A'),
     seedConsentingMember('b1', 'B'), seedConsentingMember('b2', 'B'), seedConsentingMember('b3', 'B')]
      .forEach(m => seedDoc(`users/${m.uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBe(1);
    expect(res.body.teams[0].team).toBe('Team A');
  });
});

describe('GET /api/org/:orgId/team-dashboard — k-anonymity', () => {
  it("a manager's own team below threshold is explicitly locked, not silently omitted", async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1'],
      memberTeams: { a1: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    seedDoc('users/a1', { shareAnonymizedDataWithOrg: true });

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBe(1);
    expect(res.body.teams[0].locked).toBe(true);
    expect(res.body.teams[0].cohortSize).toBe(1);
    expect(res.body.teams[0].threshold).toBe(3);
    expect(res.body.teams[0].overallConcern).toBeUndefined();
  });

  it('unlocks once the team has enough consenting members, with no fabricated trend on first view', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    expect(res.status).toBe(200);
    const team = res.body.teams[0];
    expect(team.locked).toBe(false);
    expect(team.cohortSize).toBe(3);
    expect(Array.isArray(team.indicators)).toBe(true);
  });

  it('a non-consenting member never counts toward the team cohort', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    // Only 2 of the 3 team members have opted in.
    seedDoc('users/a1', { shareAnonymizedDataWithOrg: true });
    seedDoc('users/a2', { shareAnonymizedDataWithOrg: true });
    seedDoc('users/a3', { shareAnonymizedDataWithOrg: false });

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    expect(res.body.teams[0].locked).toBe(true);
    expect(res.body.teams[0].cohortSize).toBe(2);
  });
});

describe('GET /api/org/:orgId/team-dashboard — Nova nudge banner', () => {
  it('surfaces no nudge when nothing is elevated or worsening', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    // No mood/climate data logged at all -> null concern, not elevated.
    expect(res.body.teams[0].nudge).toBeNull();
  });
});

describe('GET /api/org/:orgId/team-dashboard — Work Design Signals (Meeting Pressure)', () => {
  it('no data != zero: with no calendar connections at all, the signal is honestly insufficient, not a fabricated low band', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const team = res.body.teams[0];
    expect(team.locked).toBe(false);
    const signal = team.workDesignSignals.find((s: any) => s.key === 'meeting_pressure');
    expect(signal.band).toBeNull();
    // Nobody has connected a calendar at all (not merely "not enough, but
    // some have") - this is the more specific 'not_connected' status
    // PR11 wires up, distinct from 'stale'/'insufficient_data'.
    expect(signal.sufficiencyStatus).toBe('not_connected');
    expect(signal.sufficiencyMessage).toBeTruthy();
    expect(team.attention).toEqual([]);
  });

  it('a real, sufficiently-connected cohort gets a genuine band and basis, never a raw unexplained number', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const team = res.body.teams[0];
    const signal = team.workDesignSignals.find((s: any) => s.key === 'meeting_pressure');
    expect(signal.band).toBe('sustained');
    expect(signal.bandLabel).toBe('Sustained');
    expect(signal.basis).toContain('28h');
    expect(team.attention).toEqual(['Meeting Pressure is sustained.']);
  });
});

describe('GET /api/org/:orgId/team-dashboard — Nova Manager Coach recommendation', () => {
  it('no recommendation when nothing warrants one (insufficient data)', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    expect(res.body.teams[0].recommendation).toBeNull();
  });

  it('a real, one-item recommendation accompanies a sustained Meeting Pressure band', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const rec = res.body.teams[0].recommendation;
    expect(rec).not.toBeNull();
    expect(rec.signalKey).toBe('meeting_pressure');
    expect(rec.primaryActionLabel).toBeTruthy();
    expect(rec.secondaryActionLabel).toBe('Explore a different change');
  });

  it('no recommendation is offered while a trial is already active for this team - activeIntervention is returned instead', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }
    await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'High meeting load' });

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const team = res.body.teams[0];
    expect(team.recommendation).toBeNull();
    expect(team.activeIntervention).not.toBeNull();
    expect(team.activeIntervention.status).toBe('trialling');
    expect(team.activeIntervention.proposedChange).toBe('Protect 14:00-16:00');
  });

  it('a completed intervention does not count as active - the recommendation returns', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }
    const createRes = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: 'Protect 14:00-16:00', why: 'High meeting load' });
    await request(app).patch(`/api/org/${ORG}/work-design-interventions/${createRes.body.intervention.id}/outcome`).set(auth('mgr_a'))
      .send({ outcomeRating: 'useful' });

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const team = res.body.teams[0];
    expect(team.activeIntervention).toBeNull();
    expect(team.recommendation).not.toBeNull();
  });
});

describe('GET /api/org/:orgId/team-dashboard — never writes the shared org-wide history', () => {
  it('does not create a risk_trend_history entry, even for the org\'s first-ever check today', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));

    const historyPaths = allPaths().filter(p => p.startsWith(`organisations/${ORG}/risk_trend_history/`));
    expect(historyPaths.length).toBe(0);
  });

  it('a manager managing two teams does not write two conflicting history entries', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_ab', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B', b2: 'Team B', b3: 'Team B' },
      teamManagers: { mgr_ab: ['Team A', 'Team B'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));

    const res = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_ab'));
    expect(res.body.teams.length).toBe(2);

    const historyPaths = allPaths().filter(p => p.startsWith(`organisations/${ORG}/risk_trend_history/`));
    expect(historyPaths.length).toBe(0);
  });

  it('risk-trend still writes the correct, complete org-wide snapshot even after team-dashboard was checked first that day', async () => {
    seedOrg(ORG, {
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B', b2: 'Team B', b3: 'Team B' },
      teamManagers: { mgr_a: ['Team A'] },
      privacyThreshold: 3,
    });
    ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].forEach(uid => seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true }));
    // A history entry is only ever written when there's a real strain
    // signal to record (overallConcern !== null) - seed a recent mood
    // pulse for everyone so that's true here.
    const recentIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].forEach(uid =>
      seedDoc(`users/${uid}/mood_pulses/mp1`, { moodLabel: 'calm', createdAt: recentIso }));

    // The manager checks their own team dashboard first, before any org
    // admin has looked at risk-trend today.
    await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));

    const riskTrendRes = await request(app).get(`/api/org/${ORG}/risk-trend`).set(auth('owner_1'));
    expect(riskTrendRes.status).toBe(200);
    // Both teams must be present - proof the day's history entry wasn't
    // already (wrongly) written by team-dashboard with only Team A in it.
    expect(Object.keys(riskTrendRes.body.teamBreakdown).sort()).toEqual(['Team A', 'Team B']);

    const historyPaths = allPaths().filter(p => p.startsWith(`organisations/${ORG}/risk_trend_history/`));
    expect(historyPaths.length).toBe(1);
  });
});
