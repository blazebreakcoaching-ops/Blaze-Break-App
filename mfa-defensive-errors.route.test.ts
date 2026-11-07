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
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev`, auth_time: 1700000000 }),
    getUser: async () => ({ customClaims: {} }),
    setCustomUserClaims: async () => {},
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue, Timestamp: fake.FakeTimestamp };
});

import request from 'supertest';
import { generate as generateOtp } from 'otplib';
import { app } from './server';
import { resetStore, forceDocError, forceDocErrorAfter, forceTransactionError, forceTransactionErrorAfter } from './test/fake-firestore';

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
    // INDEPENDENT REVIEW FOLLOW-UP (2026-11-04): authenticateFirebaseUser's
    // own authoritative MFA-enrollment check now ALSO reads this exact doc
    // path, before the route body below ever runs - a plain forceDocError
    // would make THAT earlier read throw first (misreported as an auth
    // failure), never reaching the route's own read this test means to
    // exercise. skipCount=1 lets that one earlier read through untouched
    // (the account isn't enrolled, so it reads as "not found" - no gate),
    // and only fails the SECOND read, which is this route's own.
    const restore = forceDocErrorAfter(MFA_DOC_PATH, 'get', 1, new Error('simulated Firestore outage'));

    try {
      const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth(UID)).send({ code: '123456' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Could not confirm two-factor setup right now.' });
      expect(errorSpy).toHaveBeenCalled();
      const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(logged.message).toContain('[MFA] enroll/confirm error:');
    } finally {
      // try/finally, not a trailing call: an assertion failure above must
      // never leave this global override active for every test after it -
      // exactly the cascading-failure trap this fix's own test run caught
      // in this file's pre-existing tests.
      restore();
      errorSpy.mockRestore();
    }
  });

  // INDEPENDENT REVIEW FOLLOW-UP (2026-11-04): verification reliability -
  // markFirestoreMfaSessionVerified used to swallow a write failure and let
  // this route report success anyway, leaving an account the user was told
  // is now "verified" with no Firestore-rules-visible session record at
  // all. A genuinely correct code must never be reported as a successful
  // enrollment if this essential record still didn't persist after
  // retrying - and, just as important, enrollment itself (enabled: true,
  // the recovery codes) must NOT be finalised either, so the user's one
  // real recovery path is simply to retry with a fresh code, not a
  // confusing "No two-factor setup in progress" dead end against an
  // enrollment that silently went through anyway.
  it('honestly fails (503, not fake success) and does NOT finalise enrollment when the session-state write never persists', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const startRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth(UID));
    const code = await generateOtp({ secret: startRes.body.secretForManualEntry });
    const restore = forceTransactionError(new Error('simulated Firestore outage'));

    try {
      const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth(UID)).send({ code });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/correct.*couldn't finish securing/i);
      expect(res.body.recoveryCodes).toBeUndefined();
      expect(res.body.mfaSessionToken).toBeUndefined();
    } finally {
      restore();
      errorSpy.mockRestore();
    }

    // The pending secret must still be intact (enrollment never finalised),
    // so the exact same still-valid code can simply be retried, now that
    // the simulated outage above is over.
    const retryRes = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth(UID)).send({ code });
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.recoveryCodes).toHaveLength(8);
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

  // INDEPENDENT REVIEW FOLLOW-UP (2026-11-04): same honesty requirement as
  // enroll/confirm above, for the far more common path (an already-enrolled
  // account signing in again). The code genuinely matched - verifyMfaAttempt
  // above's own lockout-counter transaction succeeds - but the SEPARATE
  // Firestore-rules session record still fails to persist; the route must
  // not report verified:true in that case.
  it('honestly fails (503, not fake success) when the session-state write never persists, even though the code itself was correct', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Enroll fully first, with no forced errors active, so the account is
    // genuinely enrolled before this test exercises the signin path.
    const startRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('signin_defensive_uid'));
    const enrollCode = await generateOtp({ secret: startRes.body.secretForManualEntry });
    await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('signin_defensive_uid')).send({ code: enrollCode });

    // Armed fresh right before this one request: its call-count starts at
    // 0, so skipCount=1 lets exactly verifyMfaAttempt's own lockout-counter
    // transaction (the first transaction THIS request makes) succeed, and
    // fails every transaction after it - i.e. every one of
    // markFirestoreMfaSessionVerified's own retries.
    const signinCode = await generateOtp({ secret: startRes.body.secretForManualEntry });
    const restore = forceTransactionErrorAfter(1, new Error('simulated Firestore outage'));

    try {
      const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('signin_defensive_uid')).send({ code: signinCode });

      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/correct.*couldn't finish securing/i);
      expect(res.body.verified).toBeUndefined();
      expect(res.body.mfaSessionToken).toBeUndefined();
    } finally {
      restore();
      errorSpy.mockRestore();
    }
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
