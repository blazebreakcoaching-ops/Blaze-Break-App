import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/user/resume-prompt - the "pick up where you
// left off" check. Confirms it only ever surfaces a prompt when there's
// genuine unfinished progress (never for a doc with no known total, and
// never for something already fully completed), picks the single most
// recently-touched candidate when more than one is incomplete, and
// requires authentication like every other user-scoped route.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  return {};
});

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
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { chats = { create: vi.fn() }; models = { generateContent: vi.fn() }; live = { connect: vi.fn() }; },
  Type: {}, Modality: {},
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';
import { getIsoWeekId } from './weekly-goal-tracker';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => resetStore());

describe('GET /api/user/resume-prompt', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/user/resume-prompt')).status).toBe(401);
  });

  it('reports no incomplete work when nothing has ever been saved', async () => {
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('surfaces a genuinely partial Recovery Plan', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a', 'b', 'c'],
      completedIds: ['a'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tool).toBe('Recovery Plan');
    expect(res.body.tab).toBe('plan');
  });

  it('does not surface a Recovery Plan that has been fully completed', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a', 'b'],
      completedIds: ['a', 'b'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('never treats a doc with no known total (allActionIds never recorded) as incomplete - avoids a false positive on old/malformed data', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      completedIds: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('surfaces a genuinely partial diagnosis action plan (unfinished actions OR boundaries)', async () => {
    seedDoc(`users/${USER}/diagnosis_progress/High-Functioning Exhausted`, {
      allActionIds: ['rec_1'],
      allBoundaryIds: ['comm_1'],
      completedActions: ['rec_1'],
      committedBoundaries: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tab).toBe('diagnose');
  });

  it('picks the single most recently-touched candidate when both are incomplete - never surfaces more than one', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a', 'b'], completedIds: [], updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedDoc(`users/${USER}/diagnosis_progress/High-Functioning Exhausted`, {
      allActionIds: ['rec_1'], allBoundaryIds: [], completedActions: [], committedBoundaries: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tab).toBe('diagnose'); // the more recent one
  });

  it('the message never implies a broken streak or something owed', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a', 'b'], completedIds: [], updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.message.toLowerCase()).not.toMatch(/streak|overdue|behind|forgot/);
  });

  it('surfaces a genuinely interrupted Workload Reality Check', async () => {
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      answers: { q1: 'yes' },
      tasks: [],
      completed: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tool).toBe('Workload Reality Check');
    expect(res.body.tab).toBe('recover');
  });

  it('does not surface a completed Workload Reality Check', async () => {
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      answers: { q1: 'yes' },
      tasks: [],
      completed: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('does not surface a Workload Reality Check with nothing entered yet, even if not marked completed', async () => {
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      answers: {}, tasks: [], completed: false, updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('surfaces this week\'s Weekly Goal Tracker cycle when a real goal is unmet', async () => {
    const weekId = getIsoWeekId(new Date());
    seedDoc(`users/${USER}/weekly_habit_cycles/${weekId}`, {
      weekId,
      startedAt: '2026-01-01T00:00:00.000Z',
      goals: [
        { id: 'g1', label: 'Sleep', target: 5, progress: 5, xpAwarded: true },
        { id: 'g2', label: 'Movement', target: 3, progress: 1, xpAwarded: false },
      ],
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tool).toBe('Weekly Goal Tracker');
    expect(res.body.tab).toBe('recover');
  });

  it('does not surface a Weekly Goal Tracker cycle where every goal is already met', async () => {
    const weekId = getIsoWeekId(new Date());
    seedDoc(`users/${USER}/weekly_habit_cycles/${weekId}`, {
      weekId,
      startedAt: '2026-01-01T00:00:00.000Z',
      goals: [{ id: 'g1', label: 'Sleep', target: 5, progress: 5, xpAwarded: true }],
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('never treats a stale, lapsed week\'s cycle as resumable, even with an unmet goal', async () => {
    seedDoc(`users/${USER}/weekly_habit_cycles/2020-W01`, {
      weekId: '2020-W01',
      startedAt: '2020-01-01T00:00:00.000Z',
      goals: [{ id: 'g1', label: 'Sleep', target: 5, progress: 1, xpAwarded: false }],
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('surfaces a genuinely in-progress SHIP Journey stage, using its own dedicated timestamp', async () => {
    seedDoc(`users/${USER}/user_stats/core`, {
      committedActionIds: ['ship_safety_boundary_script'], // 1 of 3 Safety quests
      shipJourneyLastCommittedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z', // deliberately far off - must NOT be used for ordering
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.hasIncomplete).toBe(true);
    expect(res.body.tool).toBe('SHIP Journey');
    expect(res.body.tab).toBe('recover');
    expect(res.body.message).toContain('Safety');
    // Same low-pressure register as the other four sources - never a hint
    // that anything was owed or missed, which matters more here than
    // anywhere else in the app: this is a burnout-recovery tool, and a
    // nudge that reads as guilt-tripping would work directly against what
    // it exists to do.
    expect(res.body.message.toLowerCase()).not.toMatch(/streak|overdue|behind|forgot|should|must/);
  });

  it('never surfaces SHIP Journey for a stage that has never been touched at all, even if the doc exists', async () => {
    seedDoc(`users/${USER}/user_stats/core`, {
      committedActionIds: [], // nothing committed anywhere
      shipJourneyLastCommittedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('never surfaces SHIP Journey once every quest is committed', async () => {
    seedDoc(`users/${USER}/user_stats/core`, {
      committedActionIds: [
        'ship_safety_boundary_script', 'ship_safety_blame_reset', 'ship_safety_digital_blackout',
        'ship_habits_sleep_debt', 'ship_habits_movement_snack', 'ship_habits_checkin_streak',
        'ship_identity_reflect_action', 'ship_identity_fingerprint_recheck', 'ship_identity_resentment_log',
        'ship_purpose_reality_check', 'ship_purpose_weekly_goal', 'ship_purpose_support_circle',
      ],
      shipJourneyLastCommittedAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('never surfaces SHIP Journey without its own dedicated timestamp, even with real partial progress', async () => {
    seedDoc(`users/${USER}/user_stats/core`, {
      committedActionIds: ['ship_safety_boundary_script'],
      // shipJourneyLastCommittedAt missing - e.g. an old stats doc written
      // before this field existed.
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body).toEqual({ hasIncomplete: false });
  });

  it('picks whichever of all five sources was most recently touched', async () => {
    seedDoc(`users/${USER}/recovery_plan_progress/state`, {
      allActionIds: ['a', 'b'], completedIds: [], updatedAt: '2026-01-01T00:00:00.000Z',
    });
    seedDoc(`users/${USER}/workload_reality_check/state`, {
      answers: { q1: 'yes' }, tasks: [], completed: false, updatedAt: '2026-03-01T00:00:00.000Z',
    });
    const weekId = getIsoWeekId(new Date());
    seedDoc(`users/${USER}/weekly_habit_cycles/${weekId}`, {
      weekId, startedAt: '2026-02-01T00:00:00.000Z',
      goals: [{ id: 'g1', label: 'Sleep', target: 5, progress: 1, xpAwarded: false }],
    });
    seedDoc(`users/${USER}/user_stats/core`, {
      committedActionIds: ['ship_safety_boundary_script'],
      shipJourneyLastCommittedAt: '2026-04-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/user/resume-prompt').set(auth(USER));
    expect(res.body.tool).toBe('SHIP Journey'); // the most recent of the four seeded here
  });
});
