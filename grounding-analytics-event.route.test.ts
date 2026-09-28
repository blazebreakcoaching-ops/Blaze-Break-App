import { describe, it, expect, beforeEach, vi } from 'vitest';

// Batch 6 hardening - locks in Phase 2's "raw data never reaches
// analytics" acceptance test for POST /api/grounding/analytics-event.
// The schema (server.ts) is a closed enum + two optional enums with no
// free-text field at all, so this isn't a sanitisation problem to test
// around - it's a structural guarantee: there is no field a raw
// reflection string could ever be assigned to.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = 'test-key-not-a-placeholder';

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
  GoogleGenAI: class { models = { generateContent: vi.fn(async () => ({ text: '{}' })) }; live = { connect: vi.fn() }; },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY', NUMBER: 'NUMBER' },
  Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
}));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => { resetStore(); });

describe('POST /api/grounding/analytics-event', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/grounding/analytics-event').send({ eventType: 'pattern_explored' });
    expect(res.status).toBe(401);
  });

  it('accepts a real event type and records only the allowlisted fields', async () => {
    const res = await request(app).post('/api/grounding/analytics-event').set(auth('u1')).send({
      eventType: 'pattern_explored', category: 'control_responsibility', lens: 'secular',
    });
    expect(res.status).toBe(200);
    const snap = await fakeDb.collection('users').doc('u1').collection('grounding_analytics_events').get();
    expect(snap.docs).toHaveLength(1);
    const data = snap.docs[0]!.data();
    expect(Object.keys(data).sort()).toEqual(['category', 'createdAt', 'eventType', 'lens']);
  });

  it('rejects an unrecognised event type rather than logging it as free-form data', async () => {
    const res = await request(app).post('/api/grounding/analytics-event').set(auth('u2')).send({
      eventType: 'user_typed_this_reflection: I feel like a failure',
    });
    expect(res.status).toBe(400);
  });

  it('rejects any field beyond eventType/category/lens - no path for raw reflection text to reach analytics', async () => {
    const res = await request(app).post('/api/grounding/analytics-event').set(auth('u3')).send({
      eventType: 'grounding_session_completed',
      reflectionText: "I'm carrying my brother's addiction like it's my job to fix it",
    });
    expect(res.status).toBe(400);
    const snap = await fakeDb.collection('users').doc('u3').collection('grounding_analytics_events').get();
    expect(snap.docs).toHaveLength(0);
  });

  it('rejects an invalid category/lens even when eventType is valid', async () => {
    const res = await request(app).post('/api/grounding/analytics-event').set(auth('u4')).send({
      eventType: 'pattern_explored', category: 'made_up_category',
    });
    expect(res.status).toBe(400);
  });
});
