import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 12: GET /api/signals/blend and POST /api/signals/recovery-explain
// had ZERO test coverage of any kind before this file - not just their
// catch blocks, unlike every other route in this QA-coverage series.
// Covers a minimal real happy path for each (enough to prove the route
// actually does what its comment says) plus the defensive catch block,
// consistent with the rest of this series. computeBlend itself is a pure
// function already covered by archetype-scoring.test.ts - this file is
// about the route's own Firestore orchestration and drift-nudge logic,
// not re-proving the blend math.
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
import { seedDoc, resetStore, forceDocError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
});

describe('GET /api/signals/blend', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/signals/blend');
    expect(res.status).toBe(401);
  });

  it('reports no blend when the quiz baseline has never been completed', async () => {
    const res = await request(app).get('/api/signals/blend').set(auth('fresh_user'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ blend: null, hasQuizBaseline: false });
  });

  it('nudges the blend toward meeting-heavy archetypes when the calendar signal shows 5+ back-to-backs', async () => {
    seedDoc('users/busy_user/diagnostics/latest', {
      archScores: { 'Founder on Fire': 10, 'Manager in the Middle': 10, 'Crisis Sprinter': 10 },
      computedAt: '2026-01-01T00:00:00.000Z',
    });
    seedDoc('users/busy_user/live_signals/calendar', { backToBackCount: 6 });

    const res = await request(app).get('/api/signals/blend').set(auth('busy_user'));
    expect(res.status).toBe(200);
    expect(res.body.hasQuizBaseline).toBe(true);
    expect(res.body.hasCalendarSignal).toBe(true);
    expect(res.body.driftNotes.length).toBeGreaterThan(0);
    expect(res.body.driftNotes[0]).toContain('back-to-back');
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/fresh_user/diagnostics/latest', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/signals/blend').set(auth('fresh_user'));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not compute archetype blend.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Signals] blend error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/signals/recovery-explain', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/signals/recovery-explain').send({});
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await request(app).post('/api/signals/recovery-explain').set(auth('user_1')).send({ energyLevel: 'high' });
    expect(res.status).toBe(400);
  });

  it('starts from a baseline of 50 and applies self-report factors with no real signals present', async () => {
    const res = await request(app).post('/api/signals/recovery-explain').set(auth('user_1')).send({ energyLevel: 80 });
    expect(res.status).toBe(200);
    expect(res.body.hasRealSignals).toBe(false);
    expect(res.body.score).toBe(65); // 50 baseline + 15 for energyLevel > 60
    expect(res.body.factors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Baseline', delta: 50, source: 'self-report' }),
      expect.objectContaining({ label: 'Energy check-in above 60%', delta: 15, source: 'self-report' }),
    ]));
  });

  // The defensive catch block behind the happy paths above.
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError('users/user_1/live_signals/calendar', 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/signals/recovery-explain').set(auth('user_1')).send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not compute explainable recovery score.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Signals] recovery-explain error:');

    restore();
    errorSpy.mockRestore();
  });
});
