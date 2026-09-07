import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the GAD-7 wellbeing endpoints. The point beyond basic
// correctness: this is health data, so the tests pin down that it validates
// strictly, scores with the standard bands, and stays PRIVATE to the caller -
// another user can never read it, and it only lives under the user document.
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
});

describe('GET /api/wellbeing/gad7 — private history', () => {
  it('returns the caller’s own assessments, newest first', async () => {
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [1, 1, 1, 0, 0, 0, 0] }); // 3
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: [2, 2, 2, 2, 2, 1, 1] }); // 12
    const res = await request(app).get('/api/wellbeing/gad7').set(auth(USER));
    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(2);
    for (const a of res.body.assessments) {
      // Only summary fields are returned - not the raw per-item answers.
      expect(Object.keys(a).sort()).toEqual(['createdAt', 'id', 'score', 'severity']);
    }
  });

  it("NEVER exposes one user's GAD-7 data to another user", async () => {
    await request(app).post('/api/wellbeing/gad7').set(auth(USER)).send({ answers: severe });
    const res = await request(app).get('/api/wellbeing/gad7').set(auth(OTHER));
    expect(res.status).toBe(200);
    expect(res.body.assessments).toHaveLength(0);
  });
});
