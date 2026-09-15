import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression test for a real bug found in a product-safety audit:
// POST /api/nova/chat used to compute its system prompt as
// `(systemInstruction || NOVA_SYSTEM_PROMPT) + contextAddendum`, which
// fully REPLACED the crisis-safety instruction whenever a caller supplied
// its own systemInstruction - which every real caller does (NovaChat.tsx
// always sends a non-empty one). That silently dropped the only
// crisis-safety line the main chat surface had, in normal production use,
// not just an edge case. The fix appends a separate, always-included
// NOVA_SAFETY_INSTRUCTIONS constant regardless of what systemInstruction
// the caller supplies. These tests assert the model is always given that
// safety floor, by inspecting the systemInstruction actually passed to the
// (mocked) Gemini client.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    lastConfig: null as any,
    sendMessage: vi.fn(async () => ({ text: 'ok', functionCalls: [] })),
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
  GoogleGenAI: class {
    chats = {
      create: (config: any) => {
        h.lastConfig = config;
        return { sendMessage: h.sendMessage };
      },
    };
    models = { generateContent: vi.fn() };
    live = { connect: vi.fn() };
  },
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
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
});

describe('POST /api/nova/chat - crisis-safety instruction can never be dropped', () => {
  it('includes the crisis-safety floor when no systemInstruction is supplied', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.systemInstruction).toContain('Samaritans on 116 123');
  });

  it('still includes the crisis-safety floor when the caller supplies its own systemInstruction - the exact bug found in audit', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({
      message: 'Hello Nova',
      systemInstruction: 'You are a specialised boundary-rehearsal coach for this one exercise only.',
    });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.systemInstruction).toContain('Samaritans on 116 123');
    expect(h.lastConfig.config.systemInstruction).toContain('You are a specialised boundary-rehearsal coach');
  });

  it('the safety floor instructs against fabricating clinical/biometric facts', async () => {
    await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
    expect(h.lastConfig.config.systemInstruction).toContain('Never fabricate clinical facts');
  });
});
