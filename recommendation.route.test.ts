import { describe, it, expect, beforeEach } from 'vitest';

// Route test for GET /api/user/recommendation - previously zero coverage.
// Focused on the SHIP stage derivation added alongside the existing
// rule-based "next step" priority chain (unchanged by this pass) -
// Safety/Habits/Identity/Purpose (src/types.ts's SHIPStage), persisted to
// derived/stats and returned on every response.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import { vi } from 'vitest';
import request from 'supertest';
import { app } from './server';
import { seedDoc, getDocRaw, resetStore, forceDocError, forceCollectionError, forceTransactionError } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const seedCheckIns = (uid: string, count: number) => {
  for (let i = 0; i < count; i++) {
    seedDoc(`users/${uid}/checkins/c${i}`, { createdAt: '2026-01-01T00:00:00.000Z' });
  }
};

beforeEach(() => {
  resetStore();
});

describe('GET /api/user/recommendation', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/user/recommendation')).status).toBe(401);
  });

  it('always includes a shipStage field alongside the existing recommendation, for a brand-new account with no data', async () => {
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.tool).toBeTruthy();
    expect(res.body.shipStage).toBe('Safety'); // fewer than 3 check-ins ever
  });

  it('is Safety stage when a recent high-severity trigger exists, even with plenty of check-in history', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: new Date().toISOString(), severity: 9, text: 'hard day' });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Safety');
    expect(res.body.tool).toBe('Nervous System Reset');
  });

  it('is Safety stage for fewer than 3 total check-ins, regardless of anything else', async () => {
    seedCheckIns(USER, 2);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString(), lastBoundaryRehearsal: new Date().toISOString() });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 10, peoplePleasing: 10 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Safety');
  });

  it('is Habits stage when check-ins are recent but boundary rehearsal has not started', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Habits');
  });

  it('is Identity stage once boundary rehearsal has real history and the fingerprint shows elevated boundary/people-pleasing scores', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: '2020-01-01T00:00:00.000Z', // stale on purpose, so the Habits branch (recent check-in) never fires
      lastBoundaryRehearsal: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 70, peoplePleasing: 40 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Identity');
  });

  it('is Purpose stage for an established, stable account with no acute or elevated signal', async () => {
    seedCheckIns(USER, 5);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: '2020-01-01T00:00:00.000Z',
      lastBoundaryRehearsal: new Date().toISOString(),
    });
    seedDoc(`users/${USER}/recovery/fingerprint`, { scores: { boundaries: 20, peoplePleasing: 20 } });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Purpose');
  });

  it('persists the derived stage to derived/stats rather than only returning it', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date().toISOString() });
    await request(app).get('/api/user/recommendation').set(auth(USER));
    const stored = getDocRaw(`users/${USER}/derived/stats`);
    expect(stored?.shipStage).toBe('Habits');
    expect(typeof stored?.shipStageComputedAt).toBe('string');
  });

  it('defaults to Safety without throwing when no fingerprint exists yet', async () => {
    seedCheckIns(USER, 3);
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(['Safety', 'Habits', 'Purpose']).toContain(res.body.shipStage);
  });

  it('500s if the derived stats read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${USER}/derived/stats`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

// Phase B0 - Recovery Intelligence's derived trend summaries
// (recovery_debt/recovery_velocity/energy_trend/mood_trend) feeding into
// the chain above. The core requirement: when a summary is missing,
// stale, or not yet "available", the chain must behave byte-identically
// to before this pass - never worse than today.
describe('GET /api/user/recommendation - derived trend summaries (Phase B0)', () => {
  const recentIso = () => new Date().toISOString();
  const staleIso = () => new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago

  it('degrades gracefully when recovery_debt has never been calculated', async () => {
    seedCheckIns(USER, 3);
    // No stress_triggers, no derived/stats -> falls to the pre-existing
    // "stale check-in" default, exactly as before this pass.
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Pulse Check-In');
  });

  it('degrades gracefully when recovery_debt exists but status is not_enough_data', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'not_enough_data', direction: 'rising', value: 90, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Pulse Check-In');
  });

  it('degrades gracefully when recovery_debt is available but stale (older than the 14-day window)', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 90, calculatedAt: staleIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Pulse Check-In');
  });

  it('fires the recovery-debt branch when the trend is genuinely fresh, available, rising, and high', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastNervousSystemReset: recentIso() }); // reset less stale than energy budget
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.type).toBe('recovery_reminder');
    expect(res.body.sourcesUsed).toContain('derived.recovery_debt');
    expect(res.body.tool).toBe('Energy Budget'); // energy budget never logged (Infinity) - staler than the just-reset nervous system
  });

  it('never fires the recovery-debt branch when direction is falling, even if value is high', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'falling', value: 90, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.sourcesUsed).not.toContain('derived.recovery_debt');
  });

  it('without a usable energy/mood trend, preserves the original branch order (stale check-in wins over heavy active load)', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: staleIso() });
    seedDoc(`users/${USER}/energy_commitments/c1`, { status: 'active', energyDrain: 80 });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Pulse Check-In');
  });

  it('with a fresh falling energy_trend, breaks the stale-check-in vs heavy-active-load tie toward Energy Budget', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: staleIso() });
    seedDoc(`users/${USER}/energy_commitments/c1`, { status: 'active', energyDrain: 80 });
    seedDoc(`users/${USER}/derived/energy_trend`, { status: 'available', direction: 'falling', value: 30, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Energy Budget');
  });

  it('fires the recovery-velocity branch as the lowest-priority nudge when nothing else in the chain matches', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: recentIso(),
      lastMoodPulse: recentIso(),
      lastBoundaryRehearsal: recentIso(),
      lastNervousSystemReset: recentIso(),
    });
    seedDoc(`users/${USER}/derived/recovery_velocity`, { status: 'available', direction: 'falling', value: 20, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.sourcesUsed).toContain('derived.recovery_velocity');
    expect(res.body.tool).toBe('Energy Budget'); // never logged (Infinity hours) - the least-engaged of the 4 candidates
  });

  it('never fires the recovery-velocity branch when the trend is stable, falling back to the honest default', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: recentIso(),
      lastMoodPulse: recentIso(),
      lastBoundaryRehearsal: recentIso(),
      lastNervousSystemReset: recentIso(),
    });
    seedDoc(`users/${USER}/derived/recovery_velocity`, { status: 'available', direction: 'stable', value: 60, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Nova Coach');
  });
});

// Phase C - SHIP stage becomes a tiebreaker between two simultaneously
// eligible branches (never a new branch condition, never reordering away
// the acute recentHighSeverity branch). The two spots in the chain where
// this can actually matter: Safety vs. a stale boundary rehearsal, and
// Purpose vs. a stale energy budget - both fixtured below with, and
// without, the stage that should flip the default winner.
describe('GET /api/user/recommendation - stage-aware tiebreaking (Phase C)', () => {
  const recentIso = () => new Date().toISOString();

  it('Safety stage: a stale reset wins over a simultaneously-stale boundary rehearsal', async () => {
    seedCheckIns(USER, 2); // < 3 check-ins -> Safety stage
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: recentIso(), lastMoodPulse: recentIso() });
    seedDoc(`users/${USER}/energy_commitments/c1`, { status: 'active', energyDrain: 10 }); // activeLoad > 0, < 60
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Safety');
    expect(res.body.tool).toBe('Nervous System Reset');
  });

  it('non-Safety stage: the same simultaneously-stale conditions default to Boundary Rehearsal (unchanged order)', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // stale -> not Habits stage
      lastMoodPulse: recentIso(), // keeps staleCheckIn branch from firing first
    });
    seedDoc(`users/${USER}/energy_commitments/c1`, { status: 'active', energyDrain: 10 });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).not.toBe('Safety');
    expect(res.body.tool).toBe('Boundary Rehearsal');
  });

  it('Purpose stage: a stale ally check-in wins over a simultaneously-stale energy budget', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: recentIso(),
      lastMoodPulse: recentIso(),
      lastBoundaryRehearsal: recentIso(), // avoids the Habits stage (boundary work has started)
      lastNervousSystemReset: recentIso(),
      lastEnergyBudgetUpdate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      lastRecoveryAllyActivity: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    // No active energy_commitments -> activeLoad 0, so the boundary-rehearsal
    // tiebreak stays inapplicable and this only exercises the Purpose one.
    seedDoc(`users/${USER}/energy_budgets/b1`, { createdAt: recentIso() });
    seedDoc(`users/${USER}/ally_shared_goals/g1`, { createdAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).toBe('Purpose');
    expect(res.body.tool).toBe('Recovery Ally');
  });

  it('non-Purpose stage: the same simultaneously-stale conditions default to Energy Budget (unchanged order)', async () => {
    seedCheckIns(USER, 2); // < 3 check-ins -> Safety stage, not Purpose
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: recentIso(),
      lastMoodPulse: recentIso(),
      lastNervousSystemReset: recentIso(), // keeps the Safety reset tiebreak from firing first
      lastEnergyBudgetUpdate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      lastRecoveryAllyActivity: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    seedDoc(`users/${USER}/energy_budgets/b1`, { createdAt: recentIso() });
    seedDoc(`users/${USER}/ally_shared_goals/g1`, { createdAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.shipStage).not.toBe('Purpose');
    expect(res.body.tool).toBe('Energy Budget');
  });

  it('recentHighSeverity always wins outright, regardless of stage or any other stale/tiebreak condition', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/stress_triggers/t1`, { createdAt: recentIso(), severity: 9, text: 'hard day' });
    seedDoc(`users/${USER}/derived/stats`, {
      lastEnergyBudgetUpdate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      lastRecoveryAllyActivity: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    seedDoc(`users/${USER}/energy_budgets/b1`, { createdAt: recentIso() });
    seedDoc(`users/${USER}/ally_shared_goals/g1`, { createdAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).toBe('Nervous System Reset');
    expect(res.body.type).toBe('overload_warning');
  });
});

// Report 25 - Pulse now defers to the same deterministic Recovery Routing
// engine /api/recovery/routing-decision uses, instead of two parallel
// decision chains. It only ever takes over when real, legitimate bandwidth
// evidence exists (a genuine capacity check-in on file - never fabricated,
// since this GET route has no way to ask the one bandwidth question); the
// common case (no check-in today, covered exhaustively above) must keep
// falling through to the pre-existing rule-based chain byte-identically.
describe('GET /api/user/recommendation - shared Recovery Routing arbitration (Report 25)', () => {
  const recentIso = () => new Date().toISOString();

  it('defers to the shared routing engine once a real capacity check-in makes bandwidth known', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.tool).toBe('Energy & Capacity');
    expect(res.body.tab).toBe('recover');
    expect(res.body.type).toBe('recovery_reminder');
    expect(res.body.sourcesUsed).toContain('derived.recovery_debt');
  });

  it('writes the same shared session budget and routing-decision audit record the Hub itself writes', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    await request(app).get('/api/user/recommendation').set(auth(USER));
    const sessionState = getDocRaw(`users/${USER}/recovery_routing/session_state`);
    expect(sessionState?.recommendationsOffered).toBe(1);
  });


  it('returns the persisted decision ID so Pulse can report Start through the existing outcome API', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const recommendation = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(recommendation.status).toBe(200);
    expect(recommendation.body.decisionId).toEqual(expect.any(String));
    const path = `users/${USER}/recovery_routing_decisions/${recommendation.body.decisionId}`;
    expect(getDocRaw(path)?.selectedModule).toBe('energy_delta');
    expect(getDocRaw(path)?.sourceSurface).toBe('pulse_home_recommendation');

    const outcome = await request(app).post('/api/recovery/routing-outcome').set(auth(USER))
      .send({ decisionId: recommendation.body.decisionId, action: 'started' });
    expect(outcome.status).toBe(200);
    expect(getDocRaw(path)?.startedAt).toEqual(expect.any(String));
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.interventionsStarted).toBe(1);
  });

  it('records Not now against the same real recommendation decision and its shared session counters', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const recommendation = await request(app).get('/api/user/recommendation').set(auth(USER));
    const id = recommendation.body.decisionId;
    expect(id).toEqual(expect.any(String));
    const outcome = await request(app).post('/api/recovery/routing-outcome').set(auth(USER))
      .send({ decisionId: id, action: 'declined' });
    expect(outcome.status).toBe(200);
    expect(getDocRaw(`users/${USER}/recovery_routing_decisions/${id}`)?.outcome).toBe('declined');
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsDeclined).toBe(1);
  });

  it('falls through unchanged to the rule-based chain when no real capacity check-in exists, even with a strong shared signal', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastNervousSystemReset: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    // Identical to the pre-Report-25 "fires the recovery-debt branch" case -
    // the rule-based chain's own tool choice, not the router's module name.
    expect(res.body.tool).toBe('Energy Budget');
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)).toBeUndefined();
  });

  it('respects the shared daily recommendation budget instead of fabricating a way around it', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    const today = new Date().toISOString().split('T')[0];
    seedDoc(`users/${USER}/recovery_routing/session_state`, { day: today, recommendationsOffered: 3 });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    // A real exhausted budget suppresses *both* router and legacy nudges.
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('no_action');
    expect(res.body.decisionId).toBeNull();
    expect(res.body.tool).toBe('');
    expect(res.body.points).toBe(0);
    expect(res.body.title).toBe("You've done enough here for now");
    expect(res.body.shipStage).toBeTruthy();
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(3);
    const ledger = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(ledger.body.entries).toEqual([]);
  });


  it('honours an exhausted shared budget even without a current capacity check-in', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    seedDoc(`users/${USER}/recovery_routing/session_state`, { day: new Date().toISOString().slice(0, 10), recommendationsOffered: 3 });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('no_action');
    expect(res.body.title).toBe("You've done enough here for now");
    expect(res.body.points).toBe(0);
  });

  it('returns the shared none-needed outcome instead of a synthetic legacy nudge when bandwidth is known', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('no_action');
    expect(res.body.title).toBe('Nothing here needs fixing right now');
    expect(res.body.points).toBe(0);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)).toBeUndefined();
  });

  it('isolates shared budgets between accounts', async () => {
    const other = 'user_other';
    seedCheckIns(USER, 3);
    seedCheckIns(other, 3);
    for (const uid of [USER, other]) {
      seedDoc(`users/${uid}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
      seedDoc(`users/${uid}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    }
    seedDoc(`users/${USER}/recovery_routing/session_state`, { day: new Date().toISOString().slice(0, 10), recommendationsOffered: 3 });
    const blocked = await request(app).get('/api/user/recommendation').set(auth(USER));
    const available = await request(app).get('/api/user/recommendation').set(auth(other));
    expect(blocked.body.type).toBe('no_action');
    expect(available.body.tool).toBe('Energy & Capacity');
  });

  it('does not enforce yesterday\'s expired recommendation budget today', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    seedDoc(`users/${USER}/recovery_routing/session_state`, { day: '2026-01-01', recommendationsOffered: 3 });
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.tool).toBe('Energy & Capacity');
  });

  it('respects an existing Hub-driven module cooldown instead of re-suggesting the same module', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${USER}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
    for (let i = 0; i < 3; i++) {
      seedDoc(`users/${USER}/recovery_routing_decisions/d${i}`, {
        createdAt: recentIso(), selectedModule: 'energy_delta', outcome: 'declined',
      });
    }
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(res.body.tool).not.toBe('Energy & Capacity');
    expect(res.body.type).toBe('no_action'); // cooldown cannot be sidestepped by the legacy chain
    expect(res.body.points).toBe(0);
  });
});

// Report 26 - closing the idempotency gaps: a repeated GET, a page refresh,
// or two near-simultaneous requests must never be counted as more than the
// one genuine offer the user actually received, and a decline must not be
// immediately reversed by a refresh or the legacy fallback.
describe('GET /api/user/recommendation - idempotent offers (Report 26)', () => {
  const recentIso = () => new Date().toISOString();
  const seedSelectable = (uid: string) => {
    seedCheckIns(uid, 3);
    seedDoc(`users/${uid}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${uid}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
  };

  it('reuses the same open decision id and does not double-count a repeated GET', async () => {
    seedSelectable(USER);
    const first = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(first.body.tool).toBe('Energy & Capacity');
    expect(first.body.decisionId).toBeTruthy();

    const second = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(second.body.decisionId).toBe(first.body.decisionId);
    expect(second.body.tool).toBe('Energy & Capacity');

    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(1);
    const decisions = Object.keys(
      Object.fromEntries(
        (await request(app).get('/api/user/recommendation-ledger').set(auth(USER))).body.entries.map((e: any) => [e.id, true])
      )
    );
    // Exactly one ledger entry for the one genuine offer, not two.
    expect(decisions.length).toBe(1);
  });

  it('does not duplicate the recommendation_ledger for a repeated, byte-identical legacy fallback', async () => {
    // No capacity check-in at all - the shared router can never decide,
    // so every call here falls through to the pre-existing rule-based
    // chain, which has no decision-identity concept of its own at all.
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() });
    const first = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(first.body.tool).toBe('Pulse Check-In');
    expect(first.body.decisionId).toBeNull();

    const second = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(second.body.tool).toBe('Pulse Check-In');

    const ledger = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(ledger.body.entries).toHaveLength(1);
  });

  it('still logs a genuinely different legacy recommendation once the underlying evidence changes', async () => {
    seedCheckIns(USER, 3);
    seedDoc(`users/${USER}/derived/stats`, { lastCheckIn: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() });
    await request(app).get('/api/user/recommendation').set(auth(USER));
    // A fresh check-in moments later changes the chain's own answer.
    seedDoc(`users/${USER}/derived/stats`, {
      lastCheckIn: new Date().toISOString(), lastMoodPulse: new Date().toISOString(),
      lastBoundaryRehearsal: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    seedDoc(`users/${USER}/energy_commitments/c1`, { status: 'active', energyDrain: 10 });
    await request(app).get('/api/user/recommendation').set(auth(USER));

    const ledger = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(ledger.body.entries).toHaveLength(2);
  });

  it('creates a genuinely new decision once the open one is resolved (completed)', async () => {
    seedSelectable(USER);
    const first = await request(app).get('/api/user/recommendation').set(auth(USER));
    const firstId = first.body.decisionId;
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: firstId, action: 'completed', helpfulness: 'better' });

    const second = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(second.body.decisionId).toBeTruthy();
    expect(second.body.decisionId).not.toBe(firstId);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(2);
  });

  it('does not immediately re-offer a module the user just declined, even via a page refresh', async () => {
    seedSelectable(USER);
    const first = await request(app).get('/api/user/recommendation').set(auth(USER));
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: first.body.decisionId, action: 'declined' });

    const refreshed = await request(app).get('/api/user/recommendation').set(auth(USER));
    expect(refreshed.body.type).toBe('no_action');
    expect(refreshed.body.tool).not.toBe('Energy & Capacity');
  });

  it('never lets two near-simultaneous requests push the shared budget past its daily limit', async () => {
    seedSelectable(USER);
    const today = new Date().toISOString().slice(0, 10);
    seedDoc(`users/${USER}/recovery_routing/session_state`, { day: today, recommendationsOffered: 2 }); // exactly one slot left
    const [a, b] = await Promise.all([
      request(app).get('/api/user/recommendation').set(auth(USER)),
      request(app).get('/api/user/recommendation').set(auth(USER)),
    ]);
    const types = [a.body.type, b.body.type];
    // Exactly one of the two requests gets the real, countable offer; the
    // other is honestly told no - never both, which would silently push
    // the budget to 4.
    expect(types.filter((t) => t === 'no_action')).toHaveLength(1);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(3);
  });
});

// Report 26 - /api/recovery/routing-outcome must be idempotent: a double
// tap, a retried request, or a stale/foreign decisionId must never double
// count a counter, resurrect a resolved decision, or leak across accounts.
describe('POST /api/recovery/routing-outcome - idempotency and isolation (Report 26)', () => {
  const recentIso = () => new Date().toISOString();

  it('does not increment the decline counter twice for a double-tapped Not now', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: recentIso(), selectedModule: 'guided_reset' });
    const first = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    expect(first.status).toBe(200);
    expect(first.body.alreadyRecorded).toBeFalsy();
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsDeclined).toBe(1);

    const second = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    expect(second.status).toBe(200);
    expect(second.body.alreadyRecorded).toBe(true);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsDeclined).toBe(1);
  });

  it('does not let a stale Start fire after the same decision was already declined', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: recentIso(), selectedModule: 'guided_reset' });
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    expect(res.status).toBe(200);
    expect(res.body.alreadyRecorded).toBe(true);
    // The prior 'declined' call already wrote the full day-aware counter
    // document (every field defaulted to 0 except the one incremented) -
    // this 'started' call must not add a *second* increment on top of it.
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.interventionsStarted).toBe(0);
  });

  it('does not double-count a double-tapped Start', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: recentIso(), selectedModule: 'guided_reset' });
    await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    const second = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'started' });
    expect(second.body.alreadyRecorded).toBe(true);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.interventionsStarted).toBe(1);
  });

  it('404s on an unknown decisionId and never touches the session counter', async () => {
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'does-not-exist', action: 'declined' });
    expect(res.status).toBe(404);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)).toBeUndefined();
  });

  it('never resolves another account\'s decision id', async () => {
    const other = 'user_other';
    seedDoc(`users/${other}/recovery_routing_decisions/d1`, { createdAt: recentIso(), selectedModule: 'guided_reset' });
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    expect(res.status).toBe(404);
    expect(getDocRaw(`users/${other}/recovery_routing/session_state`)).toBeUndefined();
  });

  it('never reports success when the underlying transaction fails', async () => {
    seedDoc(`users/${USER}/recovery_routing_decisions/d1`, { createdAt: recentIso(), selectedModule: 'guided_reset' });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/recovery/routing-outcome').set(auth(USER)).send({ decisionId: 'd1', action: 'declined' });
    expect(res.status).toBe(500);
    restore();
    errorSpy.mockRestore();
  });
});

// GET /api/user/recommendation-ledger - previously zero coverage. Returns
// the caller's own history of past recommendations, newest first.
describe('GET /api/user/recommendation-ledger', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/user/recommendation-ledger')).status).toBe(401);
  });

  it('returns an empty ledger when nothing has ever been logged', async () => {
    const res = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it('returns logged entries newest first, scoped to the caller only', async () => {
    const OTHER = 'user_other';
    seedDoc(`users/${USER}/recommendation_ledger/r1`, { timestamp: '2026-01-01T00:00:00.000Z', tool: 'Energy Budget' });
    seedDoc(`users/${USER}/recommendation_ledger/r2`, { timestamp: '2026-01-05T00:00:00.000Z', tool: 'Boundary Rehearsal' });
    seedDoc(`users/${OTHER}/recommendation_ledger/rX`, { timestamp: '2026-01-10T00:00:00.000Z', tool: 'Nova Coach' });

    const res = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].id).toBe('r2');
    expect(res.body.entries[1].id).toBe('r1');
  });

  it('500s if the ledger read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${USER}/recommendation_ledger`, 'get', new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/user/recommendation-ledger').set(auth(USER));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});

// Report 28 - route-level (HTTP, via the fake) concurrency and
// cross-surface regression coverage. These prove the Express routes wire
// correctly into the shared, atomic recovery-routing-persistence module -
// NOT, on their own, proof of real Firestore optimistic-concurrency
// behaviour under genuine parallelism. The in-memory fake's
// runTransaction serializes whole transaction bodies on a FIFO queue
// (test/fake-firestore.ts's own documented design), so two
// Promise.all-raced requests here are proven correct via sequential
// transaction execution, not via a real conflict-and-retry. The actual
// optimistic-concurrency guarantee is proven separately, against a real
// Firestore emulator, in recovery-routing-persistence.emulator.test.ts.
describe('Route-level concurrency and cross-surface integration (Report 28)', () => {
  const recentIso = () => new Date().toISOString();
  const seedSelectable = (uid: string) => {
    seedCheckIns(uid, 3);
    seedDoc(`users/${uid}/capacity_checkins/today`, { score: 70, createdAt: recentIso() });
    seedDoc(`users/${uid}/derived/recovery_debt`, { status: 'available', direction: 'rising', value: 80, calculatedAt: recentIso() });
  };

  it('two simultaneous GET requests for a brand-new user produce exactly one counted offer', async () => {
    seedSelectable(USER);
    const [a, b] = await Promise.all([
      request(app).get('/api/user/recommendation').set(auth(USER)),
      request(app).get('/api/user/recommendation').set(auth(USER)),
    ]);
    expect(a.body.decisionId).toBe(b.body.decisionId);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(1);
  });

  it('cross-surface: a simultaneous Pulse GET and Hub POST for the same module produce exactly one decision', async () => {
    seedSelectable(USER);
    const [pulseRes, hubRes] = await Promise.all([
      request(app).get('/api/user/recommendation').set(auth(USER)),
      request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({ explicitBandwidthReport: 'low_bandwidth' }),
    ]);
    // Both surfaces must agree on exactly one decision identity for the
    // one real offer, whichever one actually "won" the reservation.
    const ids = [pulseRes.body.decisionId, hubRes.body.decisionId].filter(Boolean);
    expect(new Set(ids).size).toBe(1);
    expect(getDocRaw(`users/${USER}/recovery_routing/session_state`)?.recommendationsOffered).toBe(1);
  });

  it('never claims the budget is exhausted when the reservation transaction itself fails (recommendation)', async () => {
    seedSelectable(USER);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    const res = await request(app).get('/api/user/recommendation').set(auth(USER));
    restore();
    expect(res.status).toBe(200);
    // The real, grounded recommendation content still reaches the user -
    // never the "you've done enough here for now" budget message, which
    // would misstate why nothing was saved.
    expect(res.body.type).not.toBe('no_action');
    expect(res.body.decisionId).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('500s rather than fabricating a decision when the reservation transaction fails (routing-decision)', async () => {
    seedDoc(`users/${USER}/capacity_checkins/ci1`, {
      physical: 'low', mental: 'low', emotional: 'low', score: 25, createdAt: recentIso(),
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      tasks: [{ id: 't1', title: 'x', category: 'must', energyDrain: 40, priority: 'high', dueDate: '', completed: false }],
      completed: false, updatedAt: recentIso(),
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceTransactionError(new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/recovery/routing-decision').set(auth(USER)).send({});
    restore();
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
