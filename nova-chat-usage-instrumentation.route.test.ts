import { describe, it, expect, beforeEach, vi } from 'vitest';

// PHASE 6B (directive §2) - regression coverage for the real Gemini
// usageMetadata capture, the executeNovaTool usage-metric instrumentation
// (memory search/write, agentic-action proposals), and the new, strictly
// cost-REDUCING maxOutputTokens request field added to POST /api/nova/chat
// this phase. Uses the exact same mocked-@google/genai pattern
// nova-chat-safety.route.test.ts already established - no second mocking
// convention invented here.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    lastConfig: null as any,
    sendMessage: vi.fn(async (): Promise<any> => ({ text: 'ok', functionCalls: [], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } })),
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
import { resetStore, seedDoc, getDocRaw } from './test/fake-firestore';

const USER = 'user_usage_instrumentation';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const MEMORY_CONSENT_GRANTED = { allowNovaMemory: true, allowNovaUseSavedMemories: true };

const todayKey = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } }));
});

describe('POST /api/nova/chat - real Gemini token usage capture', () => {
  it('returns a usage field built from the mocked client\'s real usageMetadata, and writes it to usage_counters', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ modelId: expect.any(String), promptTokens: 50, outputTokens: 20, totalTokens: 70 });
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.novaTextPromptTokens).toBe(50);
    expect(doc?.novaTextOutputTokens).toBe(20);
  });

  it('accumulates tokens across every sendMessage call in a multi-round tool-call turn, not just the first', async () => {
    h.sendMessage
      .mockImplementationOnce(async () => ({
        text: '',
        functionCalls: [{ name: 'search_nova_memories', args: { query: 'x' } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 5 },
      }))
      .mockImplementationOnce(async () => ({ text: 'done', functionCalls: [], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 15 } }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'what do you know about me?' });
    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ modelId: expect.any(String), promptTokens: 70, outputTokens: 20, totalTokens: 90 });
  });

  it('degrades to 0, never throwing, when the mocked client returns no usageMetadata at all', async () => {
    h.sendMessage.mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ modelId: expect.any(String), promptTokens: 0, outputTokens: 0, totalTokens: 0 });
  });

  it('passes a client-supplied maxOutputTokens through to the real generationConfig, clamped by the schema to <= 1024', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello', maxOutputTokens: 256 });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.maxOutputTokens).toBe(256);
  });

  it('rejects a maxOutputTokens above the hard schema ceiling rather than silently clamping it', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello', maxOutputTokens: 999999 });
    expect(res.status).toBe(400);
  });

  it('omits maxOutputTokens from generationConfig entirely when the caller does not send it - no change to existing production behaviour', async () => {
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'hello' });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.maxOutputTokens).toBeUndefined();
  });
});

describe('POST /api/nova/chat - memory and agentic-proposal usage counters (directive §2)', () => {
  it('increments novaMemorySearchCount on a real search_nova_memories call', async () => {
    await seedDoc(`users/${USER}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'search_nova_memories', args: { query: 'x' } }] }))
      .mockImplementationOnce(async () => ({ text: 'done', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'what do you know about me?' });
    expect(res.status).toBe(200);
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.novaMemorySearchCount).toBe(1);
  });

  it('increments novaMemoryWriteCount only when remember_about_user actually saves (consent granted)', async () => {
    await seedDoc(`users/${USER}/nova_permissions/current`, MEMORY_CONSENT_GRANTED);
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'remember_about_user', args: { type: 'preference', content: 'likes short meetings', confidence: 'high' } }] }))
      .mockImplementationOnce(async () => ({ text: 'noted', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'remember this' });
    expect(res.status).toBe(200);
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.novaMemoryWriteCount).toBe(1);
  });

  it('does NOT increment novaMemoryWriteCount when remember_about_user refuses to save (no consent)', async () => {
    // No nova_permissions doc seeded at all - consent defaults closed.
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'remember_about_user', args: { type: 'preference', content: 'x', confidence: 'high' } }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'remember this' });
    expect(res.status).toBe(200);
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.novaMemoryWriteCount).toBeUndefined();
  });

  it('increments agenticProposalCount and the per-tool breakdown for a successful offer_practical_assistance proposal', async () => {
    process.env.NOVA_AGENTIC_JOURNEY_ENABLED = 'true';
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'offer_practical_assistance', args: { reason: 'user asked for help prioritising' } }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'help me prioritise' });
    expect(res.status).toBe(200);
    delete process.env.NOVA_AGENTIC_JOURNEY_ENABLED;
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.agenticProposalCount).toBe(1);
    expect(doc?.agenticProposalsByTool?.offer_practical_assistance).toBe(1);
  });

  it('does NOT increment agenticProposalCount when the agentic flag is off and the tool self-refuses', async () => {
    h.sendMessage
      .mockImplementationOnce(async () => ({ text: '', functionCalls: [{ name: 'offer_practical_assistance', args: { reason: 'anything' } }] }))
      .mockImplementationOnce(async () => ({ text: 'ok', functionCalls: [] }));
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'help me' });
    expect(res.status).toBe(200);
    const doc = await getDocRaw(`users/${USER}/usage_counters/${todayKey()}`);
    expect(doc?.agenticProposalCount).toBeUndefined();
  });
});
