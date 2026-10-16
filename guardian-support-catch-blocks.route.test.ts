import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 7: the next coherent slice of the ~300-route defensive
// catch-block gap (docs/QA_COVERAGE.md baseline, item 1), following QA
// Batch 6's MFA routes. These 4 routes - feedback/submit,
// guardian/support-event, guardian/alerts, guardian/contacts/:id/
// test-ping - already have deep happy-path coverage elsewhere
// (guardian-alert.route.test.ts, guardian-support-invitation.route.test.ts)
// but none of them had ever exercised the "Firestore itself threw"
// backstop. Each already returns its own safe, non-leaking message there,
// so this is pure coverage, nothing to fix.
//
// Deliberately NOT in this batch: POST /api/support/request and
// POST /api/twilio/send, two other sites on the same uncovered-catch
// list. Both are structurally unreachable under current code: every
// Firestore/Brevo/Twilio call their try blocks make already swallows its
// own errors and returns a typed failure result rather than throwing
// (postToBrevoEmail logs-and-returns-false; sendTwilioMessage's own
// try/catch returns { success: false, error }). Forcing their outer
// catch to fire would mean faking a JS engine-level error with no real
// analogue, not exercising a real failure mode - a different problem
// from the one this batch is closing.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { resetStore, seedDoc, forceCollectionError, forceDocError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const UID = 'guardian_catch_test_uid';

beforeEach(() => {
  resetStore();
});

describe('POST /api/feedback/submit — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError('feedback_submissions', 'add', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/feedback/submit').set(auth(UID)).send({ category: 'general', message: 'Loved the app.' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to submit feedback' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[FEEDBACK] Error processing submission:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/guardian/support-event — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore write throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/guardian_support_events`, 'add', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/guardian/support-event').set(auth(UID)).send({ eventType: 'invitation_shown' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not record that.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Guardian support event] error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('GET /api/guardian/alerts — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceCollectionError(`users/${UID}/guardian_alerts`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/guardian/alerts').set(auth(UID));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('Unhandled error on GET /api/guardian/alerts');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/guardian/contacts/:id/test-ping — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when resolving the contact throws', async () => {
    const CONTACT_ID = 'guardian_1';
    seedDoc(`users/${UID}/support_circle/${CONTACT_ID}`, {
      name: 'Sam Guardian',
      isGuardian: true,
      role: 'primary_guardian',
      contactMethod: '+447700900123',
      notificationPreference: 'sms',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(`users/${UID}/support_circle/${CONTACT_ID}`, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post(`/api/guardian/contacts/${CONTACT_ID}/test-ping`).set(auth(UID)).send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Something went wrong on our end. Please try again.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[Guardian test ping] error:');

    restore();
    errorSpy.mockRestore();
  });
});
