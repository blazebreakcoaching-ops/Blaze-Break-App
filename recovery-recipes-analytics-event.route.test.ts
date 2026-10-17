import { describe, it, expect, beforeEach, vi } from 'vitest';

// Route test for POST /api/recovery-recipes/analytics-event - previously
// zero coverage. Mirrors grounding/movement-analytics-event.route.test.ts:
// an event NAME plus at most the situation/step type, validated
// server-side against a fixed allowlist, never raw emotional text, Nova
// content, faith preference, or journal content.
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

describe('POST /api/recovery-recipes/analytics-event', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/recovery-recipes/analytics-event').send({ eventType: 'recipe_started' });
    expect(res.status).toBe(401);
  });

  it('accepts a real event type and records only the allowlisted fields', async () => {
    const res = await request(app).post('/api/recovery-recipes/analytics-event').set(auth('u1')).send({
      eventType: 'recipe_completed', situationKey: 'hard_meeting', stepType: 'movement',
    });
    expect(res.status).toBe(200);
    const snap = await fakeDb.collection('users').doc('u1').collection('recovery_recipes_analytics_events').get();
    expect(snap.docs).toHaveLength(1);
    const data = snap.docs[0]!.data();
    expect(Object.keys(data).sort()).toEqual(['createdAt', 'eventType', 'situationKey', 'stepType']);
  });

  it('rejects an unrecognised event type', async () => {
    const res = await request(app).post('/api/recovery-recipes/analytics-event').set(auth('u2')).send({
      eventType: 'user_typed_this_journal_entry: feeling numb today',
    });
    expect(res.status).toBe(400);
  });

  it('rejects any field beyond eventType/situationKey/stepType', async () => {
    const res = await request(app).post('/api/recovery-recipes/analytics-event').set(auth('u3')).send({
      eventType: 'recipe_feedback',
      journalText: 'I keep thinking about my brother',
    });
    expect(res.status).toBe(400);
    const snap = await fakeDb.collection('users').doc('u3').collection('recovery_recipes_analytics_events').get();
    expect(snap.docs).toHaveLength(0);
  });

  it('rejects an invalid situationKey/stepType even when eventType is valid', async () => {
    const res = await request(app).post('/api/recovery-recipes/analytics-event').set(auth('u4')).send({
      eventType: 'recipe_started', situationKey: 'made_up_situation',
    });
    expect(res.status).toBe(400);
  });

  it('500s if the write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('users/u5/recovery_recipes_analytics_events', 'add', new Error('simulated Firestore outage'));
    const res = await request(app).post('/api/recovery-recipes/analytics-event').set(auth('u5')).send({ eventType: 'recipe_started' });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    restore();
    errorSpy.mockRestore();
  });
});
