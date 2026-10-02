import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/nova/reset-studio-reframe - the shared
// "Keep the Signal" / "Turn it into something I can say" endpoint behind
// Reset Studio's Rumination Furnace and Pressure Valve. Pins down: input
// validation (including the mode enum), that the model's own output shape
// is validated per mode before being trusted, and that a misconfigured or
// failing model path degrades to a clean error.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({ text: JSON.stringify({ hypothesis: "I didn't feel heard." }) })),
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

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({ text: JSON.stringify({ hypothesis: "I didn't feel heard." }) }));
});

describe('POST /api/nova/reset-studio-reframe', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/nova/reset-studio-reframe').send({ text: 'they never listen to me', mode: 'keep_signal' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty or missing text', async () => {
    expect((await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: '', mode: 'keep_signal' })).status).toBe(400);
    expect((await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ mode: 'keep_signal' })).status).toBe(400);
  });

  it('rejects an invalid mode', async () => {
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'something', mode: 'diagnose_me' });
    expect(res.status).toBe(400);
  });

  it('returns the real model hypothesis for keep_signal', async () => {
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'they never listen to me, I should have said...', mode: 'keep_signal' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hypothesis: "I didn't feel heard." });
    const callArg = h.generateContent.mock.calls[0][0];
    expect(callArg.contents.parts[0].text).toContain('they never listen to me');
  });

  it('rejects a keep_signal response missing the hypothesis field', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ whatHappened: 'x' }) }));
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'something', mode: 'keep_signal' });
    expect(res.status).toBe(500);
  });

  it('returns the real model breakdown for say_what_i_mean', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ whatHappened: 'A', whatMattered: 'B', whatNeedsSaying: 'C' }) }));
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'I am so done with this', mode: 'say_what_i_mean' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ whatHappened: 'A', whatMattered: 'B', whatNeedsSaying: 'C' });
  });

  it('rejects a say_what_i_mean response missing a required field', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ whatHappened: 'A', whatMattered: 'B' }) }));
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'something', mode: 'say_what_i_mean' });
    expect(res.status).toBe(500);
  });

  it('rejects a malformed (non-JSON) model response rather than crashing', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: 'not json' }));
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'something', mode: 'keep_signal' });
    expect(res.status).toBe(500);
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/nova/reset-studio-reframe').set(auth(USER)).send({ text: 'something', mode: 'keep_signal' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
