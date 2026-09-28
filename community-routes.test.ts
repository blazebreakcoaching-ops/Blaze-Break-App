import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for the community bridge: GET /api/community/config,
// GET /api/community/resources, and POST /api/grounding/community-draft.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async (_req: any) => ({
      text: JSON.stringify({ draftText: "I'm struggling with feeling responsible for keeping everyone happy. How have others learned to set boundaries?" }),
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

beforeEach(() => {
  resetStore();
  h.generateContent.mockClear();
  delete process.env.COMMUNITY_BASE_URL;
});

describe('GET /api/community/config', () => {
  it('honestly reports disabled when no base URL is configured', async () => {
    const res = await request(app).get('/api/community/config').set(auth('u1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, baseUrl: null });
  });

  it('reports enabled with the configured base URL when set', async () => {
    process.env.COMMUNITY_BASE_URL = 'https://community.example.com';
    const res = await request(app).get('/api/community/config').set(auth('u2'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, baseUrl: 'https://community.example.com' });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/community/config');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/community/resources', () => {
  it('returns an honest empty list rather than fabricated community content', async () => {
    const res = await request(app).get('/api/community/resources').set(auth('u3'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resources: [] });
  });
});

describe('POST /api/grounding/community-draft', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/grounding/community-draft').send({ burdenLabels: ['Work'] });
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('returns a drafted community post on success', async () => {
    const res = await request(app).post('/api/grounding/community-draft').set(auth('u4')).send({ burdenLabels: ['Work', 'Guilt'] });
    expect(res.status).toBe(200);
    expect(res.body.draftText).toBeTruthy();
  });

  it('rejects any field beyond structured labels - no path for raw reflection text to reach the model', async () => {
    const res = await request(app).post('/api/grounding/community-draft').set(auth('u5')).send({
      burdenLabels: ['Work'],
      rawReflectionText: "I feel like I'm destroying myself keeping everyone happy",
    });
    expect(res.status).toBe(400);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('never lets the model address the reader directly or invent personal specifics - instructs against it in the prompt', async () => {
    await request(app).post('/api/grounding/community-draft').set(auth('u6')).send({ burdenLabels: ['Family responsibility'] });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('do not address the reader directly');
    expect(call.contents).toContain('do not invent any specific personal details');
  });

  it('reports a clean error when the model call fails', async () => {
    h.generateContent.mockImplementationOnce(async () => { throw new Error('upstream down'); });
    const res = await request(app).post('/api/grounding/community-draft').set(auth('u7')).send({ burdenLabels: ['Work'] });
    expect(res.status).toBe(500);
  });

  it('includes the crisis-line safety floor', async () => {
    await request(app).post('/api/grounding/community-draft').set(auth('u8')).send({ burdenLabels: ['Work'] });
    const call = h.generateContent.mock.calls[0]![0];
    expect(call.contents).toContain('Samaritans on 116 123');
  });
});
