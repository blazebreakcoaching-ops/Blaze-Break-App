import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/recovery-recipes/enhance (Recovery Recipes
// upgrade, Batch 7 - Nova intelligence, section 30). The property under
// test that matters most isn't the happy path - it's that the model can
// never widen what it's allowed to touch: a preferredStepOrder entry that
// wasn't in the request's own optionalStepTypes allowlist is dropped, and
// a reflectionQuestion is never returned unless the request said the
// recipe actually has a reflection step to personalise. The deterministic
// recipe this enhances is already complete without any of this - a
// thrown/invalid model response degrades to a clean 500, never a crash.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({
      text: JSON.stringify({ reason: 'A short, grounded reason tied to this situation.' }),
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
  GoogleGenAI: class { models = { generateContent: h.generateContent }; live = { connect: vi.fn() }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({
    text: JSON.stringify({ reason: 'A short, grounded reason tied to this situation.' }),
  }));
});

describe('POST /api/recovery-recipes/enhance — access control and validation', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').send({ situationKey: 'hard_meeting' });
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an invalid situationKey', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p1')).send({ situationKey: 'not_a_real_situation' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an unrecognised field (strict schema)', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p2')).send({ situationKey: 'hard_meeting', freeText: 'anything the client should never be able to send' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an invalid capacity', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p3')).send({ situationKey: 'hard_meeting', capacity: 'unlimited' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/recovery-recipes/enhance — happy path', () => {
  it('returns the model-provided reason', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p4')).send({ situationKey: 'hard_meeting' });
    expect(res.status).toBe(200);
    expect(res.body.reason).toBe('A short, grounded reason tied to this situation.');
  });

  it('never sends raw free text to the model - only enum labels appear in the prompt', async () => {
    await request(app).post('/api/recovery-recipes/enhance').set(auth('p5')).send({ situationKey: 'hard_meeting', capacity: 'a_little' });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('I had a hard meeting');
    expect(call.contents).toContain('a little');
  });

  it('always includes the crisis-line safety floor in the prompt', async () => {
    await request(app).post('/api/recovery-recipes/enhance').set(auth('p6')).send({ situationKey: 'numb' });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('Samaritans on 116 123');
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p7')).send({ situationKey: 'hard_meeting' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('reports a clean error when the model returns an unparseable shape', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ reason: 123 }) }));
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p8')).send({ situationKey: 'hard_meeting' });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/recovery-recipes/enhance — allowlist enforcement (section 30)', () => {
  it('drops a preferredStepOrder entry the model invents that was never in the request\'s optionalStepTypes', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({
        reason: 'Reason text.',
        preferredStepOrder: ['release', 'rest'], // 'rest' was never offered below
      }),
    }));
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p9')).send({
      situationKey: 'hard_meeting', optionalStepTypes: ['release'],
    });
    expect(res.status).toBe(200);
    expect(res.body.preferredStepOrder).toEqual(['release']);
  });

  it('omits preferredStepOrder entirely when every entry the model returned is invalid', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({ reason: 'Reason text.', preferredStepOrder: ['movement'] }),
    }));
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p10')).send({
      situationKey: 'hard_meeting', optionalStepTypes: ['release'],
    });
    expect(res.status).toBe(200);
    expect(res.body.preferredStepOrder).toBeUndefined();
  });

  it('never returns a reflectionQuestion when the request never said this recipe has a reflection step', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({ reason: 'Reason text.', reflectionQuestion: 'A question nobody asked for.' }),
    }));
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p11')).send({ situationKey: 'hard_meeting' });
    expect(res.status).toBe(200);
    expect(res.body.reflectionQuestion).toBeUndefined();
  });

  it('returns a reflectionQuestion when the request says the recipe has a reflection step', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({ reason: 'Reason text.', reflectionQuestion: 'What would help most right now?' }),
    }));
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p12')).send({ situationKey: 'hard_meeting', hasReflectionStep: true });
    expect(res.status).toBe(200);
    expect(res.body.reflectionQuestion).toBe('What would help most right now?');
  });
});

describe('POST /api/recovery-recipes/enhance — server-verified context', () => {
  it('reads recent situations from the server\'s own Firestore history, never from client input', async () => {
    const uid = 'p13';
    await fakeDb.collection('users').doc(uid).collection('recipeHistory').add({ situationKey: 'setback', createdAt: '2026-01-01T00:00:01.000Z' });
    await request(app).post('/api/recovery-recipes/enhance').set(auth(uid)).send({ situationKey: 'hard_meeting' });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('I have had a setback');
  });

  it('works with no history at all - a brand-new user never breaks the route', async () => {
    const res = await request(app).post('/api/recovery-recipes/enhance').set(auth('p14')).send({ situationKey: 'just_need_reset' });
    expect(res.status).toBe(200);
  });
});
