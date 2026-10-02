import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for POST /api/responsibility-reset/close - the one-shot
// "CLOSE WITH AGENCY" step of the Responsibility Reset conversation. The
// conversation itself runs through the generic /api/nova/chat route (not
// tested here); this route only ever distils an already-finished
// conversation into three short fields, grounded in what was actually
// said, and must degrade to a clean error rather than inventing a close
// when the model misbehaves.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({
      text: JSON.stringify({
        owns: 'You raised your voice before you had all the facts.',
        notOwns: "Your colleague's decision to escalate it publicly wasn't yours to control.",
        nextMove: 'Send a short, calm follow-up message tomorrow morning.',
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

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

const baseHistory = [
  { role: 'user', parts: [{ text: "I completely ruined the client meeting." }] },
  { role: 'model', parts: [{ text: "What actually happened in the meeting?" }] },
  { role: 'user', parts: [{ text: 'I was 10 minutes late and the deck had an old number in it.' }] },
];

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  h.generateContent.mockImplementation(async () => ({
    text: JSON.stringify({
      owns: 'You raised your voice before you had all the facts.',
      notOwns: "Your colleague's decision to escalate it publicly wasn't yours to control.",
      nextMove: 'Send a short, calm follow-up message tomorrow morning.',
    }),
  }));
});

describe('POST /api/responsibility-reset/close — access control and validation', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/responsibility-reset/close').send({ history: baseHistory });
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty history', async () => {
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p1')).send({ history: [] });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('rejects a history entry with an invalid role', async () => {
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p2')).send({
      history: [{ role: 'system', parts: [{ text: 'hi' }] }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognised field (strict schema)', async () => {
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p3')).send({
      history: baseHistory, extra: 'nope',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized history', async () => {
    const huge = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'model', parts: [{ text: 'x' }] }));
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p4')).send({ history: huge });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/responsibility-reset/close — happy path', () => {
  it('returns the three closing fields', async () => {
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p5')).send({ history: baseHistory });
    expect(res.status).toBe(200);
    expect(res.body.owns).toBeTruthy();
    expect(res.body.notOwns).toBeTruthy();
    expect(res.body.nextMove).toBeTruthy();
  });

  it('builds the prompt from the actual conversation, never inventing it', async () => {
    await request(app).post('/api/responsibility-reset/close').set(auth('p6')).send({ history: baseHistory });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('10 minutes late');
    expect(call.contents).toContain('never invent specifics');
  });

  it('instructs the model never to conclude "it wasn\'t your fault" by default', async () => {
    await request(app).post('/api/responsibility-reset/close').set(auth('p7')).send({ history: baseHistory });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toMatch(/never conclude "it wasn't your fault"/);
  });

  it('always includes the crisis-line safety floor in the prompt', async () => {
    await request(app).post('/api/responsibility-reset/close').set(auth('p8')).send({ history: baseHistory });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('Samaritans on 116 123');
  });

  it('reports a clean error, not a crash, when the model call throws', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p9')).send({ history: baseHistory });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('reports a clean error when the model returns an unexpected shape', async () => {
    h.generateContent.mockImplementationOnce(async () => ({ text: JSON.stringify({ owns: 123 }) }));
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p10')).send({ history: baseHistory });
    expect(res.status).toBe(500);
  });

  it('reports a clean error when a field exceeds its length cap rather than silently truncating', async () => {
    h.generateContent.mockImplementationOnce(async () => ({
      text: JSON.stringify({ owns: 'x'.repeat(500), notOwns: 'fine', nextMove: 'fine' }),
    }));
    const res = await request(app).post('/api/responsibility-reset/close').set(auth('p11')).send({ history: baseHistory });
    expect(res.status).toBe(500);
  });
});
