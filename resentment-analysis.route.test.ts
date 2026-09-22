import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/nova/resentment-analysis. This endpoint
// previously had no server-side cost/abuse control at all - any signed-in
// account could call it (a real Gemini generation per request) unlimited
// times. The point of these: authentication is required, the daily
// entitlement quota is enforced once exhausted, and a failing model call
// degrades to a clean error rather than a crash.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({
      text: JSON.stringify({
        yesMeantNo: 'They agreed to cover the shift when they meant to say no.',
        unclear: 'The deadline was never actually confirmed in writing.',
        unappreciated: 'The extra hours went unmentioned in the team update.',
        missingBoundary: "I can't take on more this week without moving something else.",
      }),
    })),
  };
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
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent: h.generateContent }; live = { connect: vi.fn() }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({
    text: JSON.stringify({
      yesMeantNo: 'They agreed to cover the shift when they meant to say no.',
      unclear: 'The deadline was never actually confirmed in writing.',
      unappreciated: 'The extra hours went unmentioned in the team update.',
      missingBoundary: "I can't take on more this week without moving something else.",
    }),
  }));
});

describe('POST /api/nova/resentment-analysis — access control', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/nova/resentment-analysis').send({ log: 'venting text' });
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty log', async () => {
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_1')).send({ log: '' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });
});

describe('POST /api/nova/resentment-analysis — quota and failure handling', () => {
  it('returns the real model analysis on success', async () => {
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_2')).send({ log: 'venting text' });
    expect(res.status).toBe(200);
    expect(res.body.missingBoundary).toBeTruthy();
  });

  it('enforces the free-tier daily quota once exhausted', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_3')).send({ log: `venting ${i}` });
      expect(res.status).toBe(200);
    }
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_3')).send({ log: 'one too many' });
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('capability_limit_reached');
    expect(res.body.capability).toBe('resentment_analysis');
    // The 6th call must never have reached the model.
    expect(h.generateContent).toHaveBeenCalledTimes(5);
  });

  it("does not let one account's usage affect another's quota", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/nova/resentment-analysis').set(auth('person_4')).send({ log: `venting ${i}` });
    }
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_5')).send({ log: 'fresh account' });
    expect(res.status).toBe(200);
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_6')).send({ log: 'venting text' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  // Previously this shape wasn't validated at all - the raw JSON.parse
  // output went straight to the client, and the only backstop was
  // firestore.rules silently rejecting the eventual client write. Now the
  // route itself refuses an out-of-shape model response.
  it('reports a clean error instead of forwarding an unexpectedly-shaped model response', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ yesMeantNo: 12345 }) }));
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_7')).send({ log: 'venting text' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('reports a clean error instead of forwarding a field that exceeds firestore.rules\' length cap', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ missingBoundary: 'x'.repeat(301) }) }));
    const res = await request(app).post('/api/nova/resentment-analysis').set(auth('person_8')).send({ log: 'venting text' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

// Behavioural coverage for NOVA_ONE_SHOT_SAFETY_FLOOR: this route is a
// one-shot generator, not a conversation, so the safety floor is
// unconditional prompt text appended to every request - the model, not the
// server, decides whether the user's venting warrants a different response.
// This locks in that the instruction always reaches the model regardless of
// what was actually vented about, mirroring how NOVA_SAFETY_INSTRUCTIONS is
// unconditionally concatenated on the conversational surfaces.
describe('POST /api/nova/resentment-analysis — safety floor', () => {
  it('always includes the crisis-line safety floor in the prompt sent to the model', async () => {
    await request(app).post('/api/nova/resentment-analysis').set(auth('person_9')).send({ log: 'my manager keeps piling on extra work' });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Samaritans on 116 123');
    expect(call.contents).toContain('988');
  });

  it('the safety floor forbids fabricating a risk score or clinical classification', async () => {
    await request(app).post('/api/nova/resentment-analysis').set(auth('person_10')).send({ log: 'venting text' });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Never fabricate clinical facts');
    expect(call.contents).toContain('risk score, risk level, or severity classification');
  });

  it('still includes the safety floor when the vented content itself signals distress', async () => {
    await request(app).post('/api/nova/resentment-analysis').set(auth('person_11')).send({
      log: "I don't see the point anymore, I just want it all to stop.",
    });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Samaritans on 116 123');
  });
});

// Negative coverage: this is pattern extraction from the user's own raw
// text, not a question or decision put to them, so neither the
// questioning-cadence module nor the style-TONE module belongs here - a
// deliberate exclusion (see the AUDIT comment above
// getNovaStyleToneAddendum in server.ts), not an oversight. This locks
// that in so a future change can't silently start applying style here.
describe('POST /api/nova/resentment-analysis — style is never applied here', () => {
  it("does not apply the user's chosen style, questioning or tone, even when one is set", async () => {
    seedDoc('users/person_12/user_stats/core', { profile: { questioningStyle: 'operator' } });
    await request(app).post('/api/nova/resentment-analysis').set(auth('person_12')).send({ log: 'venting text' });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).not.toContain('NOVA QUESTIONING STYLE');
    expect(call.contents).not.toContain('NOVA STYLE');
    expect(call.contents).not.toContain('TONE: OPERATOR');
    expect(call.contents).not.toContain('STYLE: OPERATOR');
  });
});
