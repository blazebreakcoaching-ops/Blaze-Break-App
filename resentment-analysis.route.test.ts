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
    generateContent: vi.fn(async () => ({
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
import { resetStore } from './test/fake-firestore';

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
