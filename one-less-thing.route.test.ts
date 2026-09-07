import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/nova/one-less-thing - the real Gemini-backed
// replacement for what used to be a client-side keyword match labelled as
// "Nova's Recommendation". These tests pin down: input validation, that the
// model's own output is validated before being trusted (never assumed to
// match the requested shape), and that a misconfigured/failing model path
// degrades to a clean error rather than a crash or a silently wrong answer.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({ text: JSON.stringify({ action: 'Delegate', advice: 'Hand it off.', template: 'Can you take this one?' }) })),
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
  h.generateContent.mockImplementation(async () => ({ text: JSON.stringify({ action: 'Delegate', advice: 'Hand it off.', template: 'Can you take this one?' }) }));
});

describe('POST /api/nova/one-less-thing', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/nova/one-less-thing').send({ task: 'the 3pm review' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty or missing task', async () => {
    expect((await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({ task: '' })).status).toBe(400);
    expect((await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({})).status).toBe(400);
  });

  it('returns the real model analysis on success', async () => {
    const res = await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({ task: 'The quarterly deck' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ action: 'Delegate', advice: 'Hand it off.', template: 'Can you take this one?' });
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    // The user's actual task text reaches the model.
    const callArg = h.generateContent.mock.calls[0][0];
    expect(callArg.contents.parts[0].text).toContain('The quarterly deck');
  });

  it("rejects the model's own output if the action isn't one of the four valid values", async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ action: 'Ignore', advice: 'x', template: 'y' }) }));
    const res = await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({ task: 'something' });
    expect(res.status).toBe(500);
  });

  it('rejects a malformed (non-JSON) model response rather than crashing', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: 'not json' }));
    const res = await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({ task: 'something' });
    expect(res.status).toBe(500);
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/nova/one-less-thing').set(auth(USER)).send({ task: 'something' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
