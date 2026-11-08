import { describe, it, expect, beforeEach, vi } from 'vitest';

// Experience level preference: own-uid only, strict validation, default Novice.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return { generateContent: vi.fn(async (_req: any) => ({ text: 'Your energy has dipped. Try one protected break a day this week.' })) };
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next(), ipKeyGenerator: (ip: string) => ip }));
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
    chats = { create: () => ({ sendMessage: vi.fn() }) };
    models = { generateContent: h.generateContent };
    live = { connect: vi.fn() };
  },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const URL = '/api/user/preferences/experience-level';

beforeEach(() => resetStore());

describe('experience level preference', () => {
  it('requires sign-in for both reading and saving', async () => {
    expect((await request(app).get(URL)).status).toBe(401);
    expect((await request(app).put(URL).send({ level: 'expert' })).status).toBe(401);
  });

  it('defaults to Novice, and says no choice has been made', async () => {
    const res = await request(app).get(URL).set(auth('u1'));
    expect(res.body).toEqual({ level: 'novice', chosen: false });
  });

  it('saves to the caller\'s own preferences only; a uid in the body is rejected', async () => {
    expect((await request(app).put(URL).set(auth('bob')).send({ level: 'expert', uid: 'alice' })).status).toBe(400);
    const res = await request(app).put(URL).set(auth('bob')).send({ level: 'mastering' });
    expect(res.status).toBe(200);
    expect(getDocRaw('users/bob/preferences/experience')).toMatchObject({ level: 'mastering' });
    expect(getDocRaw('users/alice/preferences/experience')).toBeUndefined();
    expect((await request(app).get(URL).set(auth('bob'))).body).toEqual({ level: 'mastering', chosen: true });
    expect((await request(app).get(URL).set(auth('alice'))).body.level).toBe('novice');
  });

  it('rejects unknown levels', async () => {
    for (const level of ['admin', 'EXPERT', '', 2, null]) {
      expect((await request(app).put(URL).set(auth('u1')).send({ level })).status).toBe(400);
    }
  });

  it('a corrupted stored value falls back to Novice', async () => {
    seedDoc('users/u1/preferences/experience', { level: 'superuser' });
    expect((await request(app).get(URL).set(auth('u1'))).body).toEqual({ level: 'novice', chosen: false });
  });
});
