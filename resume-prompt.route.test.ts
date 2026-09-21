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
});
