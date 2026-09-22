import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/nova/diagnose's AI narrative step - previously
// untested. Scoped specifically to the style-TONE addition
// (getNovaStyleToneAddendum): the diagnose narrative is a 3-4 sentence
// coaching analysis addressed directly to the user about their own result,
// so it's one of the two "APPLY" surfaces for style tone, not the
// questioning-cadence module (it never asks the user a question - see the
// AUDIT comment above getNovaStyleToneAddendum in server.ts). This does not
// attempt to cover the deterministic archetype/scoring logic itself
// (archetype-scoring.test.ts already does), only the AI-narrative prompt
// construction.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({ text: 'Your workload is the leak. Patch it before it patches you.' })),
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
import { resetStore, seedDoc } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({ text: 'Your workload is the leak. Patch it before it patches you.' }));
});

describe("POST /api/nova/diagnose — narrative style tone", () => {
  it('adds no style tone text when the user has never chosen a style (default, unchanged behaviour)', async () => {
    const res = await request(app).post('/api/nova/diagnose').set(auth('person_1')).send({ answers: {} });
    expect(res.status).toBe(200);
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    const promptText = h.generateContent.mock.calls[0][0].contents as string;
    expect(promptText).not.toContain('NOVA STYLE');
  });

  it("adds the user's chosen style tone block", async () => {
    seedDoc('users/person_2/user_stats/core', { profile: { questioningStyle: 'pre_mortem' } });
    const res = await request(app).post('/api/nova/diagnose').set(auth('person_2')).send({ answers: {} });
    expect(res.status).toBe(200);
    const promptText = h.generateContent.mock.calls[0][0].contents as string;
    expect(promptText).toContain('TONE: PRE-MORTEM');
    expect(promptText).not.toContain('TONE: MENTOR');
  });

  it('ignores an invalid stored style rather than erroring', async () => {
    seedDoc('users/person_3/user_stats/core', { profile: { questioningStyle: 'therapist_mode' } });
    const res = await request(app).post('/api/nova/diagnose').set(auth('person_3')).send({ answers: {} });
    expect(res.status).toBe(200);
    const promptText = h.generateContent.mock.calls[0][0].contents as string;
    expect(promptText).not.toContain('NOVA STYLE');
  });

  it('never applies the questioning-cadence module here (no question is ever asked in this prompt)', async () => {
    seedDoc('users/person_4/user_stats/core', { profile: { questioningStyle: 'operator' } });
    await request(app).post('/api/nova/diagnose').set(auth('person_4')).send({ answers: {} });
    const promptText = h.generateContent.mock.calls[0][0].contents as string;
    expect(promptText).toContain('TONE: OPERATOR');
    expect(promptText).not.toContain('NOVA QUESTIONING STYLE');
    expect(promptText).not.toContain('HOW TO ASK, REGARDLESS OF STYLE');
  });
});
