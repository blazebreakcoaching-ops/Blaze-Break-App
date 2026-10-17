import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST /api/movement/analytics-event - previously zero
// coverage. Mirrors grounding-analytics-event.route.test.ts: an event
// NAME plus at most the movement id/category, validated server-side
// against a fixed allowlist, never feedback value or free text.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }) }) }));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, fakeDb, forceCollectionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

beforeEach(() => { resetStore(); });

describe('POST /api/movement/analytics-event', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/movement/analytics-event').send({ eventType: 'movement_started' });
    expect(res.status).toBe(401);
  });

  it('accepts a real event type and records only the allowlisted fields', async () => {
    const res = await request(app).post('/api/movement/analytics-event').set(auth('u1')).send({
      eventType: 'movement_completed', movementId: 'neck_shoulder', category: 'release',
    });
    expect(res.status).toBe(200);
    const snap = await fakeDb.collection('users').doc('u1').collection('movement_analytics_events').get();
    expect(snap.docs).toHaveLength(1);
    const data = snap.docs[0]!.data();
    expect(Object.keys(data).sort()).toEqual(['category', 'createdAt', 'eventType', 'movementId']);
  });

  it('rejects an unrecognised event type', async () => {
    const res = await request(app).post('/api/movement/analytics-event').set(auth('u2')).send({
      eventType: 'user_typed_this_feedback: hated it',
    });
    expect(res.status).toBe(400);
  });

  it('rejects any field beyond eventType/movementId/category', async () => {
    const res = await request(app).post('/api/movement/analytics-event').set(auth('u3')).send({
      eventType: 'movement_feedback_selected',
      feedbackText: "didn't help at all",
    });
    expect(res.status).toBe(400);
    const snap = await fakeDb.collection('users').doc('u3').collection('movement_analytics_events').get();
    expect(snap.docs).toHaveLength(0);
  });

  it('rejects an invalid movementId/category even when eventType is valid', async () => {
    const res = await request(app).post('/api/movement/analytics-event').set(auth('u4')).send({
      eventType: 'movement_started', movementId: 'made_up_movement',
    });
    expect(res.status).toBe(400);
  });

  it('500s if the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/u5/movement_analytics_events', 'add', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/movement/analytics-event').set(auth('u5')).send({ eventType: 'movement_started' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
