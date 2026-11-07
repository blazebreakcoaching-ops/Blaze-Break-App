import { describe, it, expect, beforeEach, vi } from 'vitest';

// PHASE 6B.1 FINAL CORRECTIONS (Priority 3) - "Validate the selected
// thinking level against the chosen model... add tests demonstrating
// that unsupported combinations are rejected." Isolated into its own
// file (rather than added to nova-chat-usage-instrumentation.route.test.ts)
// because it needs GEMINI_TEXT_MODEL_OVERRIDE=gemini-3.8-flash set BEFORE
// server.ts is first imported in this test worker - setting that in a
// shared file would change every other test in it onto a different
// configured model than they assume. Uses the exact same mocked-
// @google/genai pattern every other *.route.test.ts file already
// establishes - no second mocking convention invented here.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  process.env.GEMINI_TEXT_MODEL_OVERRIDE = 'gemini-3.8-flash';
  return {
    lastConfig: null as any,
    sendMessage: vi.fn(async (): Promise<any> => ({ text: 'ok', functionCalls: [], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } })),
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
import { GEMINI_TEXT_MODEL } from './ai-model-registry';
import { resetStore } from './test/fake-firestore';

const USER = 'user_thinking_level_validation';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
});

describe('POST /api/nova/chat - per-model thinking-level validation (Phase 6B.1 final corrections, Priority 3)', () => {
  it('sanity check: this file really is running with gemini-3.8-flash configured', () => {
    expect(GEMINI_TEXT_MODEL).toBe('gemini-3.8-flash');
  });

  it('rejects thinkingLevel=MINIMAL with 400 when the configured model is gemini-3.8-flash - never silently normalised to a different level', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello', thinkingLevel: 'MINIMAL' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/gemini-3\.8-flash/);
    expect(res.body.error).toMatch(/LOW, MEDIUM, HIGH/);
    // Rejected BEFORE any model call was attempted.
    expect(h.sendMessage).not.toHaveBeenCalled();
  });

  it('accepts thinkingLevel=LOW/MEDIUM/HIGH for gemini-3.8-flash and forwards it unchanged to the real generationConfig', async () => {
    for (const level of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      h.sendMessage.mockClear();
      const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello', thinkingLevel: level });
      expect(res.status).toBe(200);
      expect(h.lastConfig.config.thinkingConfig.thinkingLevel).toBe(level);
    }
  });

  it('omitting thinkingLevel entirely still works normally (no restriction applies to an unset field)', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.thinkingConfig).toBeUndefined();
  });
});
