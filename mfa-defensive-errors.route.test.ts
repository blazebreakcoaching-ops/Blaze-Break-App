import { describe, it, expect, beforeEach, vi } from 'vitest';

// QA Batch 6: the "something unexpected threw" backstop behind each MFA
// route's already-tested happy path (account-security.route.test.ts covers
// the happy paths and validation errors; this file is only the catch
// block). Picked as the first slice of the ~300-route defensive-catch-block
// gap flagged in docs/QA_COVERAGE.md's baseline - security-critical,
// self-contained, and every route here already has its own specific,
// safe, non-leaking client-facing message (confirmed in Security
// Operations Batch 3's audit), so there's nothing to fix here, only to
// prove: that the right status/message pair is actually returned, and
// that the real error is actually captured via logger.error rather than
// silently dropped.
vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.MFA_ENCRYPTION_KEY = 'zP9Q1kM8m8yqjq2r7z1Xw3f0T6a8Zc1s2eYlQwK9O0k=';
});

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev` }),
    getUser: async () => ({ customClaims: {} }),
    setCustomUserClaims: async () => {},
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});

import request from 'supertest';
import { app } from './server';
import { resetStore, forceDocError, forceTransactionError } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
const UID = 'mfa_defensive_test_uid';
const MFA_DOC_PATH = `users/${UID}/security/mfa_totp`;

beforeEach(() => {
  resetStore();
});

describe('GET /api/auth/mfa/status — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the Firestore read throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(MFA_DOC_PATH, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).get('/api/auth/mfa/status').set(auth(UID));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not check two-factor status right now.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[MFA] status error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/auth/mfa/totp/enroll/start — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when persisting the pending secret throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(MFA_DOC_PATH, 'set', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth(UID)).send({});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not start two-factor setup right now.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[MFA] enroll/start error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/auth/mfa/totp/enroll/confirm — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when reading the pending-enrollment doc throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceDocError(MFA_DOC_PATH, 'get', new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth(UID)).send({ code: '123456' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not confirm two-factor setup right now.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[MFA] enroll/confirm error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/auth/mfa/totp/verify-at-signin — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the verification transaction throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceTransactionError(new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth(UID)).send({ code: '123456' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not verify your code right now.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[MFA] verify-at-signin error:');

    restore();
    errorSpy.mockRestore();
  });
});

describe('POST /api/auth/mfa/totp/disable — defensive catch block', () => {
  it('returns a generic 500 and logs the real error when the verification transaction throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restore = forceTransactionError(new Error('simulated Firestore outage'));

    const res = await request(app).post('/api/auth/mfa/totp/disable').set(auth(UID)).send({ code: '123456' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not turn off two-factor authentication right now.' });
    expect(errorSpy).toHaveBeenCalled();
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged.message).toContain('[MFA] disable error:');

    restore();
    errorSpy.mockRestore();
  });
});
