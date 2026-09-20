import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route tests for GET /api/signals/executive-report. This endpoint
// previously had no rate limiter and no daily quota at all, despite doing
// a real Gemini generation per request whenever the caller has enough
// real signals logged - a genuine cost/abuse exposure, closed the same
// way as resentment-analysis and manager-coach.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';
  return {
    generateContent: vi.fn(async () => ({ text: 'Solid week of protected focus time.' })),
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
  h.generateContent.mockImplementation(async () => ({ text: 'Solid week of protected focus time.' }));
});

describe('GET /api/signals/executive-report — access control', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/signals/executive-report');
    expect(res.status).toBe(401);
    expect(h.generateContent).not.toHaveBeenCalled();
  });
});

describe('GET /api/signals/executive-report — model call gating', () => {
  it('never calls the model when there is not enough real data', async () => {
    const res = await request(app).get('/api/signals/executive-report').set(auth('empty_user'));
    expect(res.status).toBe(200);
    expect(res.body.hasEnoughData).toBe(false);
    expect(res.body.aiAnalysis).toBeNull();
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it('calls the model and returns real commentary once real signals exist', async () => {
    seedDoc('users/active_user/boundary_scripts/s1', { createdAt: new Date().toISOString() });
    const res = await request(app).get('/api/signals/executive-report').set(auth('active_user'));
    expect(res.status).toBe(200);
    expect(res.body.hasEnoughData).toBe(true);
    expect(res.body.aiAnalysis).toBeTruthy();
    expect(h.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/signals/executive-report — quota enforcement', () => {
  it('enforces the free-tier daily quota once exhausted', async () => {
    seedDoc('users/quota_user/boundary_scripts/s1', { createdAt: new Date().toISOString() });
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/signals/executive-report').set(auth('quota_user'));
      expect(res.status).toBe(200);
    }
    const res = await request(app).get('/api/signals/executive-report').set(auth('quota_user'));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('capability_limit_reached');
    expect(res.body.capability).toBe('executive_report');
    // The 6th call must never have reached the model.
    expect(h.generateContent).toHaveBeenCalledTimes(5);
  });

  it('checks the quota even when there is not enough data to call the model', async () => {
    // The quota is consumed on every allowed request regardless of whether
    // the model ends up being called - confirms the gate runs first.
    for (let i = 0; i < 5; i++) {
      await request(app).get('/api/signals/executive-report').set(auth('quota_empty_user'));
    }
    const res = await request(app).get('/api/signals/executive-report').set(auth('quota_empty_user'));
    expect(res.status).toBe(429);
  });
});
