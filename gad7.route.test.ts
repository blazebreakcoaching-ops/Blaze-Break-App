import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the GAD-7 wellbeing endpoints. The point beyond basic
// correctness: this is health data, so the tests pin down that it validates
// strictly, scores with the standard bands, stays PRIVATE to the caller -
// another user can never read it - and that drafts/context/reminders are
// kept separate from the locked score itself.
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
import { resetStore } from './test/fake-firestore';

const USER = 'user_owner';
const OTHER = 'user_other';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const minimal = [0, 0, 0, 0, 0, 0, 0];
const severe = [3, 3, 3, 3, 3, 3, 3];

beforeEach(() => resetStore());

describe('POST /api/wellbeing/gad7', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/wellbeing/gad7').send({ answers: minimal })).status).toBe(401);
    expect((await request(app).get('/api/wellbeing/gad7')).status).toBe(401);
  });

  it('scores a valid submission with the standard bands and support flag', async () => {
    const min = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal });
    expect(min.status).toBe(200);
    expect(min.body.score).toBe(0);
    expect(min.body.severity).toBe('minimal');
    expect(min.body.suggestsSupport).toBe(false);
    expect(min.body.id).toBeTruthy();

    const sev = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: severe });
    expect(sev.body.score).toBe(21);
    expect(sev.body.severity).toBe('severe');
    expect(sev.body.suggestsSupport).toBe(true); // >=10
  });

  it('rejects malformed submissions (wrong length, out of range, extra fields)', async () => {
    expect((await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [0, 1, 2] })).status).toBe(400);
    expect((await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [0, 1, 2, 3, 0, 1, 4] })).status).toBe(400);
    expect((await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal, note: 'should be rejected' })).status).toBe(400);
  });

  it('accepts the optional impairment answer', async () => {
    const res = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal, impairment: 2 });
    expect(res.status).toBe(200);
  });

  it('clears any in-progress draft once a check-in completes', async () => {
    await request(app).put('/api/wellbeing/gad7/draft').set(auth(USER)).send({ answers: [1, -1, -1, -1, -1, -1, -1] });
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal });
    const draft = await request(app).get('/api/wellbeing/gad7/draft').set(auth(USER));
    expect(draft.body.draft).toBeNull();
  });
});

describe('GET /api/wellbeing/gad7 — private history', () => {
  it('returns the caller’s own assessments, newest first, without raw answers', async () => {
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [1, 1, 1, 0, 0, 0, 0] }); // 3
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [2, 2, 2, 2, 2, 1, 1] }); // 12
    const res = await request(app).get('/api/wellbeing/gad7').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(2);
    for (const a of res.body.assessments) {
      expect(a).not.toHaveProperty('answers');
      expect(Object.keys(a).sort()).toEqual(['contextTags', 'createdAt', 'id', 'impairment', 'score', 'severity']);
    }
  });

  it("NEVER exposes one user's GAD-7 data to another user", async () => {
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: severe });
    const res = await request(app).get('/api/wellbeing/gad7').set(auth(OTHER));
    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(0);
  });
});

describe('draft check-ins: incomplete, never scored, resumable', () => {
  it('requires authentication', async () => {
    expect((await request(app).put('/api/wellbeing/gad7/draft').send({ answers: [-1, -1, -1, -1, -1, -1, -1] })).status).toBe(401);
  });

  it('saves and resumes a partial draft without scoring it', async () => {
    const put = await request(app).put('/api/wellbeing/gad7/draft').set(auth(USER)).send({ answers: [2, 1, -1, -1, -1, -1, -1] });
    expect(put.status).toBe(200);
    const get = await request(app).get('/api/wellbeing/gad7/draft').set(auth(USER));
    expect(get.body.draft.answers).toEqual([2, 1, -1, -1, -1, -1, -1]);

    const history = await request(app).get('/api/wellbeing/gad7').set(auth(USER));
    expect(history.body.assessments).toHaveLength(0); // no trend entry from a draft
  });

  it('rejects a draft with an out-of-range answer', async () => {
    expect((await request(app).put('/api/wellbeing/gad7/draft').set(auth(USER)).send({ answers: [4, -1, -1, -1, -1, -1, -1] })).status).toBe(400);
  });

  it('can be explicitly discarded', async () => {
    await request(app).put('/api/wellbeing/gad7/draft').set(auth(USER)).send({ answers: [1, -1, -1, -1, -1, -1, -1] });
    await request(app).delete('/api/wellbeing/gad7/draft').set(auth(USER));
    const get = await request(app).get('/api/wellbeing/gad7/draft').set(auth(USER));
    expect(get.body.draft).toBeNull();
  });

  it("NEVER exposes one user's draft to another user", async () => {
    await request(app).put('/api/wellbeing/gad7/draft').set(auth(USER)).send({ answers: [3, -1, -1, -1, -1, -1, -1] });
    const get = await request(app).get('/api/wellbeing/gad7/draft').set(auth(OTHER));
    expect(get.body.draft).toBeNull();
  });
});

describe('PATCH /api/wellbeing/gad7/:id — context tags + privacy authorization only', () => {
  it('never touches the locked score/answers; only context/authorization fields', async () => {
    const created = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal });
    const id = created.body.id;
    const patch = await request(app).patch(`/api/wellbeing/gad7/${id}`).set(auth(USER)).send({
      contextTags: ['work_pressure', 'sleep'],
      novaPatternLearningAuthorized: true,
    });
    expect(patch.status).toBe(200);
    const history = await request(app).get('/api/wellbeing/gad7').set(auth(USER));
    expect(history.body.assessments[0].contextTags).toEqual(['work_pressure', 'sleep']);
  });

  it('rejects an invalid context tag', async () => {
    const created = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal });
    const res = await request(app).patch(`/api/wellbeing/gad7/${created.body.id}`).set(auth(USER)).send({ contextTags: ['not_a_real_tag'] });
    expect(res.status).toBe(400);
  });

  it('404s on a check-in the caller does not own', async () => {
    const created = await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: minimal });
    const res = await request(app).patch(`/api/wellbeing/gad7/${created.body.id}`).set(auth(OTHER)).send({ contextTags: ['sleep'] });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/wellbeing/gad7/reminder — optional, fortnightly, pull-based', () => {
  it('computes a ~14-day next-suggested date for "two_weeks"', async () => {
    const res = await request(app).put('/api/wellbeing/gad7/reminder').set(auth(USER)).send({ choice: 'two_weeks' });
    expect(res.status).toBe(200);
    const days = (Date.parse(res.body.nextSuggestedAt) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
  });

  it('stores null for "no_reminders"', async () => {
    const res = await request(app).put('/api/wellbeing/gad7/reminder').set(auth(USER)).send({ choice: 'no_reminders' });
    expect(res.body.nextSuggestedAt).toBeNull();
    const get = await request(app).get('/api/wellbeing/gad7/reminder').set(auth(USER));
    expect(get.body.reminderChoice).toBe('no_reminders');
  });

  it('rejects an invalid choice', async () => {
    const res = await request(app).put('/api/wellbeing/gad7/reminder').set(auth(USER)).send({ choice: 'daily' });
    expect(res.status).toBe(400);
  });
});
