import { describe, it, expect, beforeEach, vi } from 'vitest';

// Regression coverage for two things fixed together: NovaChat.tsx used to
// build its own copy of Nova's saved memories directly from getNovaBrain()
// (unfiltered, no consent check) into the systemInstruction it sends,
// while the server ALSO fetched its own consent-gated copy into
// contextAddendum - so a single chat turn could carry memory content
// twice, with two different filters. The fix removed the client-side
// duplication entirely; the server's getNovaContextAndMetadata is now the
// only place memory content enters the prompt. These tests exercise that
// single remaining path directly: a saved memory appears exactly once when
// consent is on, and not at all when it's off.
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
import { resetStore, seedDoc } from './test/fake-firestore';

const USER = 'user_owner';
const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const MEMORY_CONTENT = 'Prefers Nova to be direct and skip small talk';

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
  seedDoc(`users/${USER}/nova_memories/mem1`, {
    type: 'preference',
    content: MEMORY_CONTENT,
    source: 'Test Fixture',
    confidence: 'high',
    canEdit: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

describe('POST /api/nova/chat - single, consent-gated memory context', () => {
  it('includes a saved memory exactly once when memory consent is on', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, {
      allowNovaMemory: true,
      allowNovaUseSavedMemories: true,
    });

    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
    expect(res.status).toBe(200);

    const instruction: string = h.lastConfig.config.systemInstruction;
    const occurrences = instruction.split(MEMORY_CONTENT).length - 1;
    expect(occurrences).toBe(1);
  });

  it('never includes a saved memory when memory consent is off', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, {
      allowNovaMemory: false,
      allowNovaUseSavedMemories: false,
    });

    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.systemInstruction).not.toContain(MEMORY_CONTENT);
  });

  it('never includes a saved memory when no permissions doc exists at all', async () => {
    // No nova_permissions/current seeded - matches any account somehow
    // still missing one; getNovaContextAndMetadata should return no context.
    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
    expect(res.status).toBe(200);
    expect(h.lastConfig.config.systemInstruction).not.toContain(MEMORY_CONTENT);
  });

  it('a caller-supplied systemInstruction (situational/workload context) still arrives alongside the server-side memory context', async () => {
    seedDoc(`users/${USER}/nova_permissions/current`, {
      allowNovaMemory: true,
      allowNovaUseSavedMemories: true,
    });

    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({
      message: 'Hello Nova',
      systemInstruction: '[SITUATIONAL ONBOARDING CONTEXT]\nGoal: restore energy.',
    });
    expect(res.status).toBe(200);
    const instruction: string = h.lastConfig.config.systemInstruction;
    expect(instruction).toContain('[SITUATIONAL ONBOARDING CONTEXT]');
    expect(instruction).toContain(MEMORY_CONTENT);
  });
});
