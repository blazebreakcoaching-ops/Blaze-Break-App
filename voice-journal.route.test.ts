import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/nova/voice-journal. This endpoint had no test
// coverage at all before this file - a pre-existing gap flagged during the
// Nova Questioning Style audit, filled here alongside the safety-floor
// addition (NOVA_ONE_SHOT_SAFETY_FLOOR) that now gets appended to its
// prompt. See resentment-analysis.route.test.ts for the sibling coverage
// on the other one-shot generator that received the same safety floor.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  const okResult = () => ({
    text: JSON.stringify({
      transcription: 'I keep saying yes to everything and I am exhausted.',
      themes: ['overcommitment', 'exhaustion'],
      analysis: "You're volunteering for load nobody asked you to carry.",
      advice: 'Say no to the next request without an apology attached.',
      emotionalTone: 'wired but exhausted',
    }),
  });
  return {
    generateContent: vi.fn(async (_req: any) => okResult()),
    okResult,
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
const body = (overrides: Partial<{ audioData: string; mimeType: string }> = {}) => ({
  audioData: 'ZmFrZS1hdWRpby1ieXRlcw==',
  mimeType: 'audio/webm;codecs=opus',
  ...overrides,
});

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => h.okResult());
});

describe('POST /api/nova/voice-journal — access control', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/nova/voice-journal').send(body());
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects a payload missing the audio data', async () => {
    const res = await request(app).post('/api/nova/voice-journal').set(auth('person_1')).send({ mimeType: 'audio/webm' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects a payload missing the mime type', async () => {
    const res = await request(app).post('/api/nova/voice-journal').set(auth('person_1')).send({ audioData: 'abc' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });
});

describe('POST /api/nova/voice-journal — success and failure handling', () => {
  it('returns the real model analysis on success', async () => {
    const res = await request(app).post('/api/nova/voice-journal').set(auth('person_2')).send(body());
    expect(res.status).toBe(200);
    expect(res.body.transcription).toBeTruthy();
    expect(res.body.advice).toBeTruthy();
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/nova/voice-journal').set(auth('person_3')).send(body());
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('reports a clean error when the model returns an empty response', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: '' }));
    const res = await request(app).post('/api/nova/voice-journal').set(auth('person_4')).send(body());
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});

// Behavioural coverage for NOVA_ONE_SHOT_SAFETY_FLOOR: this is a one-shot
// generator with no conversation turns, so unlike the chat/voice route
// tests there is no "message" to signal crisis with - the safety floor is
// unconditional prompt text appended to every request, exactly mirroring
// how NOVA_SAFETY_INSTRUCTIONS is unconditionally concatenated on the
// conversational surfaces. This locks in that the instruction always
// reaches the model, regardless of what's in the audio.
describe('POST /api/nova/voice-journal — safety floor', () => {
  it('always includes the crisis-line safety floor in the prompt sent to the model', async () => {
    await request(app).post('/api/nova/voice-journal').set(auth('person_5')).send(body());
    const call = h.generateContent.mock.calls[0][0];
    const promptText = call.contents.parts.find((p: any) => typeof p.text === 'string').text as string;
    expect(promptText).toContain('Samaritans on 116 123');
    expect(promptText).toContain('988');
  });

  it('the safety floor forbids fabricating a risk score or clinical classification', async () => {
    await request(app).post('/api/nova/voice-journal').set(auth('person_6')).send(body());
    const call = h.generateContent.mock.calls[0][0];
    const promptText = call.contents.parts.find((p: any) => typeof p.text === 'string').text as string;
    expect(promptText).toContain('Never fabricate clinical facts');
    expect(promptText).toContain('risk score, risk level, or severity classification');
  });
});
