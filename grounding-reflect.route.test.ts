import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/grounding/reflect (Faith & Values Grounding,
// Stage 3). The most important property under test here isn't the happy
// path - it's that for the islamic lens, the curated verse and both
// questions ALWAYS come from grounding-content.ts's ISLAMIC_THEMES pool,
// never from the model, no matter what the model returns. The model is
// only ever asked for a short contextual reflectionText in that branch.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async () => ({
      text: JSON.stringify({
        reflectionText: 'A grounded reflection tied to what they actually said.',
        firstQuestion: 'What is genuinely within your responsibility here?',
        secondQuestion: "What outcome are you still trying to control?",
      }),
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
import { resetStore } from './test/fake-firestore';
import { ISLAMIC_THEMES } from './grounding-content';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const baseBody = {
  lens: 'secular',
  burdenLabels: ['Work'],
  controllableItems: ['My actions'],
  uncontrollableItems: ['The final outcome'],
};

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({
    text: JSON.stringify({
      reflectionText: 'A grounded reflection tied to what they actually said.',
      firstQuestion: 'What is genuinely within your responsibility here?',
      secondQuestion: "What outcome are you still trying to control?",
    }),
  }));
});

describe('POST /api/grounding/reflect — access control and validation', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/grounding/reflect').send(baseBody);
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an invalid lens', async () => {
    const res = await request(app).post('/api/grounding/reflect').set(auth('p1')).send({ ...baseBody, lens: 'astrology' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('requires an islamicThemeId for the islamic lens', async () => {
    const res = await request(app).post('/api/grounding/reflect').set(auth('p2')).send({ ...baseBody, lens: 'islamic' });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });
});

describe('POST /api/grounding/reflect — non-islamic lenses', () => {
  it('returns the model reflection and both questions as-is', async () => {
    const res = await request(app).post('/api/grounding/reflect').set(auth('p3')).send(baseBody);
    expect(res.status).toBe(200);
    expect(res.body.reflectionText).toBeTruthy();
    expect(res.body.firstQuestion).toBeTruthy();
    expect(res.body.secondQuestion).toBeTruthy();
    expect(res.body.verse).toBeUndefined();
  });

  it('never fabricates specifics the user did not mention - prompt is grounded only in the submitted fields', async () => {
    await request(app).post('/api/grounding/reflect').set(auth('p4')).send(baseBody);
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Work');
    expect(call.contents).toContain('do not invent specifics they didn\'t mention');
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/grounding/reflect').set(auth('p5')).send(baseBody);
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('always includes the crisis-line safety floor in the prompt', async () => {
    await request(app).post('/api/grounding/reflect').set(auth('p6')).send(baseBody);
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Samaritans on 116 123');
    expect(call.contents).toContain('988');
  });
});

describe('POST /api/grounding/reflect — islamic lens curated-content lock-in', () => {
  it('returns the exact curated verse and questions for the chosen theme, not anything the model produced', async () => {
    const res = await request(app).post('/api/grounding/reflect').set(auth('p7')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'tawakkul',
    });
    expect(res.status).toBe(200);
    const theme = ISLAMIC_THEMES.tawakkul;
    expect(res.body.firstQuestion).toBe(theme.prompt);
    expect(res.body.secondQuestion).toBe(theme.followUp);
    expect(res.body.verse).toEqual(theme.verses[0]);
  });

  it('still returns the curated questions/verse even if the model tries to return its own fabricated ones', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({
        reflectionText: 'contextual reflection',
        // A misbehaving model attempting to inject its own scripture/questions -
        // none of this should ever reach the response.
        firstQuestion: 'A fabricated question the model made up',
        secondQuestion: 'Another fabricated question',
        verse: { reference: 'Made up 1:1', translation: 'fabricated text', translator: 'nobody', scholarReviewed: true },
      }),
    }));
    const res = await request(app).post('/api/grounding/reflect').set(auth('p8')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'sabr',
    });
    expect(res.status).toBe(200);
    const theme = ISLAMIC_THEMES.sabr;
    expect(res.body.firstQuestion).toBe(theme.prompt);
    expect(res.body.secondQuestion).toBe(theme.followUp);
    expect(res.body.verse).toEqual(theme.verses[0]);
    expect(res.body.verse.reference).not.toBe('Made up 1:1');
  });

  it("only ever asks the model for reflectionText in the islamic branch - never asks it to produce a question or verse", async () => {
    await request(app).post('/api/grounding/reflect').set(auth('p9')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'shukr',
    });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('"reflectionText"');
    expect(call.contents).not.toContain('"firstQuestion"');
    expect(call.contents).not.toContain('"secondQuestion"');
  });

  it('instructs the model never to add Qur\'an/Hadith text beyond what is given, never to claim divine knowledge, and never to issue a ruling', async () => {
    await request(app).post('/api/grounding/reflect').set(auth('p10')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'qadr',
    });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toContain('Do not quote, paraphrase, or reference any Qur\'an verse or Hadith other than the one given');
    expect(call.contents).toContain('Do not claim to know why Allah caused any specific event');
    expect(call.contents).toContain('Do not issue a religious ruling, fatwa');
  });

  it('instructs the model never to suggest hardship, abuse, or unsafe conditions should simply be tolerated as a matter of faith', async () => {
    await request(app).post('/api/grounding/reflect').set(auth('p11')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'rahmah',
    });
    const call = h.generateContent.mock.calls[0][0];
    expect(call.contents).toMatch(/abuse, danger, exploitation, or unsafe working conditions/);
  });

  it('surfaces the pending-scholar-review status on the returned verse', async () => {
    const res = await request(app).post('/api/grounding/reflect').set(auth('p12')).send({
      ...baseBody, lens: 'islamic', islamicThemeId: 'salah',
    });
    expect(res.body.verse.scholarReviewed).toBe(false);
  });
});
