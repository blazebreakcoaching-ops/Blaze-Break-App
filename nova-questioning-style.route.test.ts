import { describe, it, expect, beforeEach, vi } from 'vitest';

// Coverage for the new Nova Questioning Style module - a user-chosen lens
// on HOW Nova asks questions (Operator/Board Member/Mentor/Pre-Mortem),
// read fresh from users/{uid}/user_stats/core.profile.questioningStyle and
// injected into the prompt server-side (never trusted from the client).
// These tests exercise /api/nova/chat directly; the same
// getNovaQuestioningStyleAddendum function is also called from the Nova
// Live voice route, but that route has no test coverage at all in this
// repo (a pre-existing gap, not one introduced here) - see
// buildNovaQuestioningStyleModule for a plain unit-level check of the
// text-building logic itself, independent of either route.
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

const chat = () => request(app).post('/api/nova/chat').set(auth(USER)).send({ message: 'Hello Nova' });
const instruction = () => h.lastConfig.config.systemInstruction as string;

beforeEach(() => {
  resetStore();
  h.lastConfig = null;
  h.sendMessage.mockClear();
  h.sendMessage.mockImplementation(async () => ({ text: 'ok', functionCalls: [] }));
});

describe('POST /api/nova/chat - questioning style module', () => {
  it('adds no module at all when no style is set (default, unchanged behaviour)', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { fullName: 'Test User' } });

    const res = await chat();
    expect(res.status).toBe(200);
    expect(instruction()).not.toContain('NOVA QUESTIONING STYLE');
  });

  it('adds no module when there is no user_stats/core doc at all', async () => {
    const res = await chat();
    expect(res.status).toBe(200);
    expect(instruction()).not.toContain('NOVA QUESTIONING STYLE');
  });

  it('adds the Operator style block when selected', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { questioningStyle: 'operator' } });

    const res = await chat();
    const text = instruction();
    expect(res.status).toBe(200);
    expect(text).toContain('NOVA QUESTIONING STYLE');
    expect(text).toContain('STYLE: OPERATOR');
    expect(text).not.toContain('STYLE: BOARD MEMBER');
    expect(text).not.toContain('STYLE: MENTOR');
    expect(text).not.toContain('STYLE: PRE-MORTEM');
  });

  it('adds only the Pre-Mortem block when that style is selected, not the others', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { questioningStyle: 'pre_mortem' } });

    const res = await chat();
    const text = instruction();
    expect(res.status).toBe(200);
    expect(text).toContain('STYLE: PRE-MORTEM');
    expect(text).not.toContain('STYLE: OPERATOR');
  });

  it('ignores an invalid/garbage style value rather than erroring', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { questioningStyle: 'therapist_mode' } });

    const res = await chat();
    expect(res.status).toBe(200);
    expect(instruction()).not.toContain('NOVA QUESTIONING STYLE');
  });

  it('always includes the deference-to-safety boundary alongside the style', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { questioningStyle: 'mentor' } });

    const res = await chat();
    const text = instruction();
    expect(res.status).toBe(200);
    expect(text).toContain('drop this style entirely and follow the safety instructions');
  });

  // Behavioural, not just structural: proves NOVA_SAFETY_INSTRUCTIONS
  // itself (not just the style module's own deference clause) still
  // reaches the model even when a style is active and the user's actual
  // message signals crisis - i.e. there is no code path, conditional on
  // message content or chosen style, that could ever drop it. The merge
  // line (`... + NOVA_SAFETY_INSTRUCTIONS`) is unconditional string
  // concatenation today, so this locks that invariant in against a future
  // refactor rather than testing a live conditional that exists now.
  it('a crisis-signalling message still reaches the model with the real safety floor present, alongside an active style', async () => {
    seedDoc(`users/${USER}/user_stats/core`, { profile: { questioningStyle: 'operator' } });

    const res = await request(app).post('/api/nova/chat').set(auth(USER)).send({
      message: "I don't want to be here anymore, I've been thinking about ending it.",
    });
    const text = instruction();
    expect(res.status).toBe(200);
    expect(text).toContain('Samaritans on 116 123');
    expect(text).toContain('STYLE: OPERATOR');
  });
});
