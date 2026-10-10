import { describe, it, expect, beforeEach, vi } from 'vitest';

// Work Design Pulse closing checklist (Pulse PR14): one real org, walked
// end to end through every Pulse PR2-13 surface in sequence, as a single
// executable proof the whole effort still works together - not just that
// each route passes its own isolated tests. Mirrors the discipline
// wdi-end-to-end.test.ts already established for the prior Work Design
// Intelligence effort this one extends.
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

const TEAM_A = ['a1', 'a2', 'a3'];
const TEAM_B = ['b1', 'b2', 'b3'];

function connectCalendar(uid: string, metrics: { totalMeetingHours: number; backToBackCount: number; eveningMeetingCount: number; weekendMeetingCount: number }) {
  seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
  seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
  seedDoc(`users/${uid}/live_signals/calendar`, { updatedAt: new Date().toISOString(), ...metrics });
}

beforeEach(() => resetStore());

describe('Work Design Pulse - closing end-to-end checklist', () => {
  it('walks one org through every Pulse PR2-13 surface in sequence', async () => {
    seedDoc(`organisations/${ORG}`, {
      name: 'Acme Co',
      adminUids: ['owner_1'],
      memberUids: ['owner_1', 'mgr_a', 'mgr_b', ...TEAM_A, ...TEAM_B],
      memberTeams: { a1: 'Team A', a2: 'Team A', a3: 'Team A', b1: 'Team B', b2: 'Team B', b3: 'Team B' },
      teamManagers: { mgr_a: ['Team A'], mgr_b: ['Team B'] },
      privacyThreshold: 3,
    });
    [...TEAM_A, ...TEAM_B].forEach((uid) => connectCalendar(uid, { totalMeetingHours: 28, backToBackCount: 10, eveningMeetingCount: 0, weekendMeetingCount: 0 }));

    // PR2: Employee Trust Mirror - calendar signal is already active
    // (connected above), team_voice/intervention_outcomes are not yet;
    // cannotSee is the fixed architectural list.
    const trustMirror1 = await request(app).get(`/api/org/${ORG}/my-privacy-status`).set(auth('a1'));
    expect(trustMirror1.body.canSee.find((c: any) => c.key === 'meeting_pressure').active).toBe(true);
    expect(trustMirror1.body.canSee.find((c: any) => c.key === 'team_voice').active).toBe(false);
    expect(trustMirror1.body.cannotSee).toContain('Your Nova conversations');

    // PR2: Privacy Change Receipts - an admin HR-viewer change is recorded
    // (privacyThreshold is deliberately left at 3 throughout this test so
    // every 3-person team cohort below stays sufficient).
    await request(app).post(`/api/org/${ORG}/hr-viewers`).set(auth('owner_1')).send({ uids: ['owner_1'] });
    const receipts = await request(app).get(`/api/org/${ORG}/privacy-receipts`).set(auth('a1'));
    expect(receipts.body.receipts).toHaveLength(1);

    // PR3: the employee page's own interventions summary starts empty.
    const summary1 = await request(app).get(`/api/org/${ORG}/work-design-interventions-summary`).set(auth('a1'));
    expect(summary1.body.totalTried).toBe(0);
    expect(summary1.body.provenance).toContain('Privacy Gate: Passed');

    // PR4: Work Design Debt Ledger - mandatory owner rule enforced.
    const debt = await request(app).post(`/api/org/${ORG}/work-design-debt`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', description: 'Meetings run long' });
    const debtId = debt.body.debt.id;
    const tooEarly = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a')).send({ status: 'owned' });
    expect(tooEarly.status).toBe(400);
    await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/owner`).set(auth('mgr_a')).send({ ownerUid: 'mgr_a' });
    const nowOwned = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a')).send({ status: 'owned' });
    expect(nowOwned.status).toBe(200);

    // PR5: Employee Burden classification required; Structural Burden
    // Router gives a real primary + alternative.
    const teamDash = await request(app).get(`/api/org/${ORG}/team-dashboard`).set(auth('mgr_a'));
    const teamA = teamDash.body.teams.find((t: any) => t.team === 'Team A');
    expect(teamA.recommendation.primaryActionLabel).not.toBe(teamA.recommendation.alternativeActionLabel);

    // PR6/PR11: start a trial for Team A (also exercises the Action
    // Budget and captures a Pressure Transfer snapshot at start).
    const trialA = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_a'))
      .send({ team: 'Team A', signalKey: 'meeting_pressure', proposedChange: teamA.recommendation.primaryActionLabel, why: teamA.recommendation.why, employeeBurden: teamA.recommendation.primaryActionBurden });
    expect(trialA.status).toBe(200);
    expect(trialA.body.intervention.signalSnapshotAtStart).not.toBeNull();

    // PR11: a second simultaneous trial for Team B still fits the default
    // budget of 3.
    const trialB = await request(app).post(`/api/org/${ORG}/work-design-interventions`).set(auth('mgr_b'))
      .send({ team: 'Team B', signalKey: 'meeting_pressure', proposedChange: 'Cap recurring meetings at 25 minutes by default', why: 'basis', employeeBurden: 'neutral' });
    expect(trialB.status).toBe(200);
    const budget = await request(app).get(`/api/org/${ORG}/action-budget`).set(auth('owner_1'));
    expect(budget.body.currentActiveCount).toBe(2);

    // PR10: "You Said -> We Changed" - link an anonymous suggestion to
    // the in-progress Team A trial.
    await request(app).post(`/api/org/${ORG}/suggestions`).set(auth('a1')).send({ message: 'Meetings run too long' });
    const suggestionsBefore = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('a1'));
    const suggestionId = suggestionsBefore.body.suggestions[0].id;
    await request(app).patch(`/api/org/${ORG}/suggestions/${suggestionId}/respond`).set(auth('owner_1')).send({ linkedInterventionId: trialA.body.intervention.id });
    const suggestionsInProgress = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('a1'));
    expect(suggestionsInProgress.body.suggestions[0].response.type).toBe('in_progress');

    // PR6: resolve Team A's trial with meeting hours genuinely down and
    // evening meetings up over the same window - a real pressure
    // transfer finding.
    TEAM_A.forEach((uid) => connectCalendar(uid, { totalMeetingHours: 14, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0 }));
    const outcomeA = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${trialA.body.intervention.id}/outcome`).set(auth('mgr_a')).send({ outcomeRating: 'useful' });
    expect(outcomeA.body.pressureTransferCheck?.movedTo).toBe('evening_meetings');

    // PR10 again: the loop closes once the trial has a real outcome.
    const suggestionsAfter = await request(app).get(`/api/org/${ORG}/suggestions`).set(auth('a1'));
    expect(suggestionsAfter.body.suggestions[0].response.type).toBe('changed');

    // PR4: now resolve the debt item against that same, genuinely useful
    // trial.
    const resolveDebt = await request(app).patch(`/api/org/${ORG}/work-design-debt/${debtId}/status`).set(auth('mgr_a'))
      .send({ status: 'resolved', linkedInterventionId: trialA.body.intervention.id });
    expect(resolveDebt.status).toBe(200);

    // Resolve Team B's trial too, with a positive outcome, so the
    // pattern spans two teams.
    const outcomeB = await request(app).patch(`/api/org/${ORG}/work-design-interventions/${trialB.body.intervention.id}/outcome`).set(auth('mgr_b')).send({ outcomeRating: 'useful' });
    expect(outcomeB.status).toBe(200);

    // PR8: Evidence Ladder reaches "repeated across teams" and becomes
    // eligible for promotion; promoting it requires the real evidence.
    const whatWorks = await request(app).get(`/api/org/${ORG}/what-works-here`).set(auth('a1'));
    const pattern = whatWorks.body.patterns.find((p: any) => p.signalKey === 'meeting_pressure');
    // Team A's own trial had a real pressure transfer finding (evening
    // meetings rose), so the honest ladder level is "repeated_across_teams"
    // rather than the cleaner "consistent_no_transfer" - still eligible
    // for promotion either way.
    expect(pattern.level).toBe('repeated_across_teams');
    expect(pattern.canPromote).toBe(true);
    const promote = await request(app).post(`/api/org/${ORG}/what-works-here/meeting_pressure/promote`).set(auth('owner_1'));
    expect(promote.status).toBe(200);

    // PR9: Work Design Drift Detector - still low/typical right now, so
    // no drift finding yet (the org-wide snapshot still reflects Team A's
    // post-trial numbers and Team B unchanged).
    const drift1 = await request(app).get(`/api/org/${ORG}/work-design-drift`).set(auth('a1'));
    expect(Array.isArray(drift1.body.findings)).toBe(true);

    // PR7: Policy-to-Practice Gap - declare a policy the org is NOT
    // actually following and confirm the gap is honestly flagged.
    await request(app).post(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1')).send({ type: 'no_evening_meetings', label: 'No evenings' });
    const policies = await request(app).get(`/api/org/${ORG}/workplace-policies`).set(auth('owner_1'));
    expect(policies.body.policies[0].gap).not.toBeNull();
    expect(policies.body.provenance).toContain('Privacy Gate');

    // PR12/PR13: Executive Work Design report carries the narrative,
    // action budget, debt summary, and Local Operating Principle count
    // built from everything above.
    const exec = await request(app).get(`/api/org/${ORG}/executive-work-design`).set(auth('owner_1'));
    expect(exec.body.locked).toBe(false);
    expect(exec.body.localOperatingPrincipleCount).toBe(1);
    expect(exec.body.debtSummary.openDebtCount).toBe(0);
    expect(exec.body.narrative).toContain('Local Operating Principle');

    // PR13: export/API privacy parity - the export route exposes nothing
    // beyond the view route's own fields plus its documented wrapper.
    const exportRes = await request(app).get(`/api/org/${ORG}/executive-work-design/export`).set(auth('owner_1'));
    const viewFields = new Set(Object.keys(exec.body));
    const exportOnlyFields = Object.keys(exportRes.body).filter((k) => !viewFields.has(k));
    expect(new Set(exportOnlyFields)).toEqual(new Set(['orgName', 'generatedAt']));
  });
});
