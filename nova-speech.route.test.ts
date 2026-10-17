import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST /api/nova/speech - previously zero coverage. Text-
// to-speech via Gemini TTS (GEMINI_TTS_MODEL), always rendered in a
// British English accent per this app's branding. Mirrors
// nova-chat-safety.route.test.ts's mocking pattern for @google/genai.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({
      candidates: [{ content: { parts: [{ inlineData: { data: 'ZmFrZS1hdWRpby1iYXNlNjQ=' } }] } }] as any[],
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
  GoogleGenAI: class { models = { generateContent: h.generateContent }; chats = { create: vi.fn() }; live = { connect: vi.fn() }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore } from './test/fake-firestore';

const USER = 'user_1';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({
    candidates: [{ content: { parts: [{ inlineData: { data: 'ZmFrZS1hdWRpby1iYXNlNjQ=' } }] } }],
  }));
});

describe('POST /api/nova/speech', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/nova/speech').send({ text: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('rejects an empty text payload', async () => {
    const res = await request(app).post('/api/nova/speech').set(auth(USER)).send({ text: '' });
    expect(res.status).toBe(400);
  });

  it('returns base64 audio from the model, voiced in British English', async () => {
    const res = await request(app).post('/api/nova/speech').set(auth(USER)).send({ text: 'Hello Nova' });
    expect(res.status).toBe(200);
    expect(res.body.audio).toBe('ZmFrZS1hdWRpby1iYXNlNjQ=');
    const call = h.generateContent.mock.calls[0][0];
    expect(call.config.speechConfig.languageCode).toBe('en-GB');
    expect(call.contents[0].parts[0].text).toContain('British English accent');
  });

  it('500s if the model returns no audio data', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ candidates: [] as any[] }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/nova/speech').set(auth(USER)).send({ text: 'Hello Nova' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('500s if the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('simulated model outage'); });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/nova/speech').set(auth(USER)).send({ text: 'Hello Nova' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
