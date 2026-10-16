import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 8: another coherent slice of the ~300-route defensive
// catch-block gap, following Batches 6-7. The Nova voice-session
// continuity routes (messaging-and-voice.route.test.ts) and every GAD-7
// wellbeing route (gad7.route.test.ts) already have deep happy-path
// coverage; none of them had ever exercised the catch block behind it.
// All 10 routes already use GENERIC_SERVER_ERROR + logger.error (closed
// by Security Operations Batch 5's sweep), so again this is pure
// coverage, nothing to fix - just proving the already-correct backstop
// actually fires and actually logs.
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
import { resetStore, seedDoc, forceDocError, forceCollectionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const UID = 'nova_gad7_catch_test_uid';

const GENERIC_BODY = { error: 'Something went wrong on our end. Please try again.' };

function expectGenericFailure(res: any, logSpy: ReturnType<typeof vi.spyOn>, method: string, path: string) {
  expect(res.status).toBe(500);
  expect(res.body).toEqual(GENERIC_BODY);
  expect(logSpy).toHaveBeenCalled();
  const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
  expect(logged.message).toContain(`Unhandled error on ${method} ${path}`);
}

beforeEach(() => {
  resetStore();
});

describe('POST /api/nova/voice-sessions — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/nova_voice_sessions`, 'add', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/nova/voice-sessions').set(auth(UID)).send({ durationMs: 1000, turnCount: 3 });

    expectGenericFailure(res, errorSpy, 'POST', '/api/nova/voice-sessions');
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/nova/voice-sessions — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/nova_voice_sessions`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/nova/voice-sessions').set(auth(UID));

    expectGenericFailure(res, errorSpy, 'GET', '/api/nova/voice-sessions');
    restore();
    errorSpy.mockRestore();
  });
});

describe('PUT /api/wellbeing/gad7/draft — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/wellbeing_drafts/gad7`, 'set', new Error('simulated Firestore outage'));

    const res = await request(app).put('/api/wellbeing/gad7/draft').set(auth(UID)).send({ answers: [-1, -1, -1, -1, -1, -1, -1] });

    expectGenericFailure(res, errorSpy, 'PUT', '/api/wellbeing/gad7/draft');
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/wellbeing/gad7/draft — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/wellbeing_drafts/gad7`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/wellbeing/gad7/draft').set(auth(UID));

    expectGenericFailure(res, errorSpy, 'GET', '/api/wellbeing/gad7/draft');
    restore();
    errorSpy.mockRestore();
  });
});

describe('DELETE /api/wellbeing/gad7/draft — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore delete throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/wellbeing_drafts/gad7`, 'delete', new Error('simulated Firestore outage'));

    const res = await request(app).delete('/api/wellbeing/gad7/draft').set(auth(UID));

    expectGenericFailure(res, errorSpy, 'DELETE', '/api/wellbeing/gad7/draft');
    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/wellbeing/gad7 — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when persisting the assessment throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/gad7_assessments`, 'add', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/wellbeing/gad7').set(auth(UID)).send({ answers: [0, 0, 0, 0, 0, 0, 0] });

    expectGenericFailure(res, errorSpy, 'POST', '/api/wellbeing/gad7');
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/wellbeing/gad7 — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/gad7_assessments`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/wellbeing/gad7').set(auth(UID));

    expectGenericFailure(res, errorSpy, 'GET', '/api/wellbeing/gad7');
    restore();
    errorSpy.mockRestore();
  });
});

describe('PATCH /api/wellbeing/gad7/:id — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when reading the assessment throws', async () => {
    const ASSESSMENT_ID = 'assessment_1';
    seedDoc(`users/${UID}/gad7_assessments/${ASSESSMENT_ID}`, {
      assessmentVersion: 1, answers: [0, 0, 0, 0, 0, 0, 0], score: 0, severity: 'minimal', status: 'completed',
      contextTags: [], createdAt: '2026-01-01T00:00:00.000Z',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/gad7_assessments/${ASSESSMENT_ID}`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).patch(`/api/wellbeing/gad7/${ASSESSMENT_ID}`).set(auth(UID)).send({ contextTags: [] });

    expectGenericFailure(res, errorSpy, 'PATCH', `/api/wellbeing/gad7/${ASSESSMENT_ID}`);
    restore();
    errorSpy.mockRestore();
  });
});

describe('PUT /api/wellbeing/gad7/reminder — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/preferences/gad7_checkin`, 'set', new Error('simulated Firestore outage'));

    const res = await request(app).put('/api/wellbeing/gad7/reminder').set(auth(UID)).send({ choice: 'no_reminders' });

    expectGenericFailure(res, errorSpy, 'PUT', '/api/wellbeing/gad7/reminder');
    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/wellbeing/gad7/reminder — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/preferences/gad7_checkin`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/wellbeing/gad7/reminder').set(auth(UID));

    expectGenericFailure(res, errorSpy, 'GET', '/api/wellbeing/gad7/reminder');
    restore();
    errorSpy.mockRestore();
  });
});
