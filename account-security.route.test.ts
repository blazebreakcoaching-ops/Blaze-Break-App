import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Hoisted setup: runs before server.ts is imported --------------------
// Same pattern as guardian-alert.route.test.ts — server.ts has import-time
// side effects (Firebase init, app.listen() guarded by TEST_MODE), so env
// vars and mocks must be in place before that module is evaluated.
const h = vi.hoisted(() => {
  process.env.TEST_MODE = 'true';
  process.env.NODE_ENV = 'test';
  process.env.BREVO_API_KEY = 'brevo_test_key';
  process.env.APP_URL = 'https://app.blazebreak.example';
  // 32 random bytes, base64 — same shape openssl rand -base64 32 produces.
  process.env.MFA_ENCRYPTION_KEY = 'zP9Q1kM8m8yqjq2r7z1Xw3f0T6a8Zc1s2eYlQwK9O0k=';
  return {
    generateEmailVerificationLink: vi.fn(async (email: string) => `https://app.blazebreak.example/auth/action?mode=verifyEmail&oobCode=fake-code-for-${email}`),
    generatePasswordResetLink: vi.fn(async (email: string) => `https://app.blazebreak.example/auth/action?mode=resetPassword&oobCode=fake-reset-for-${email}`),
    // uid -> customClaims, so setCustomUserClaims/getUser act like a real
    // account-level store across calls within a test instead of no-ops,
    // and a route that reads decodedToken.mfaEnabled after a claims sync
    // sees it. Must live inside vi.hoisted (not a plain top-level const)
    // since the vi.mock factory below runs before ordinary module code.
    claimsStore: new Map<string, Record<string, unknown>>(),
  };
});

// Rate limiters are framework infrastructure, not the handler logic under
// test — same rationale as guardian-alert.route.test.ts.
vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => ({ uid: token, email: `${token}@test.dev`, ...(h.claimsStore.get(token) || {}) }),
    generateEmailVerificationLink: h.generateEmailVerificationLink,
    generatePasswordResetLink: h.generatePasswordResetLink,
    getUser: async (uid: string) => ({ customClaims: h.claimsStore.get(uid) || {} }),
    setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
      h.claimsStore.set(uid, claims);
    },
    revokeRefreshTokens: vi.fn(async () => {}),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});

import request from 'supertest';
import { generate as generateOtp } from 'otplib';
import { app } from './server';
import { resetStore, seedDoc, getDocRaw } from './test/fake-firestore';

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  h.claimsStore.clear();
  h.generateEmailVerificationLink.mockClear();
  h.generateEmailVerificationLink.mockImplementation(
    async (email: string) => `https://app.blazebreak.example/auth/action?mode=verifyEmail&oobCode=fake-code-for-${email}`
  );
  h.generatePasswordResetLink.mockClear();
  h.generatePasswordResetLink.mockImplementation(
    async (email: string) => `https://app.blazebreak.example/auth/action?mode=resetPassword&oobCode=fake-reset-for-${email}`
  );
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('POST /api/auth/verify-email/send', () => {
  it('generates a verification link and emails it via Brevo, embedding the exact link', async () => {
    const res = await request(app).post('/api/auth/verify-email/send').set(auth('person_1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(h.generateEmailVerificationLink).toHaveBeenCalledWith(
      'person_1@test.dev',
      expect.objectContaining({ url: 'https://app.blazebreak.example/auth/action', handleCodeInApp: true })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: 'person_1@test.dev' }]);
    expect(body.htmlContent).toContain('fake-code-for-person_1@test.dev');
    expect(body.textContent).toBeTruthy();
  });

  it('still returns success (soft-fail) if link generation fails — e.g. a missing IAM permission on the server', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.generateEmailVerificationLink.mockRejectedValueOnce(
      new Error('The caller does not have permission; ensure the service account has the Service Account Token Creator role (signBlob).')
    );

    const res = await request(app).post('/api/auth/verify-email/send').set(auth('person_2'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
    // The failure must be logged with an actionable hint, not swallowed silently.
    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toMatch(/serviceAccountTokenCreator/);
    consoleErrorSpy.mockRestore();
  });

  it('rejects with 401 when there is no auth token at all', async () => {
    const res = await request(app).post('/api/auth/verify-email/send');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/password-reset/request — no-enumeration guarantee', () => {
  it('sends a reset email and returns the generic response for a real, resolvable email', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'real@test.dev' });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: 'real@test.dev' }]);
    expect(body.htmlContent).toContain('fake-reset-for-real@test.dev');
  });

  it('returns the byte-for-byte identical response for an email with no account, and sends no email', async () => {
    h.generatePasswordResetLink.mockRejectedValueOnce(Object.assign(new Error('no user'), { code: 'auth/user-not-found' }));

    const resExisting = await request(app).post('/api/auth/password-reset/request').send({ email: 'real@test.dev' });
    const resMissing = await request(app).post('/api/auth/password-reset/request').send({ email: 'ghost@test.dev' });

    expect(resMissing.body).toEqual(resExisting.body);
    expect(resMissing.status).toBe(resExisting.status);
    // Only the real account's send actually reached Brevo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the same generic response even for a malformed email, without ever calling Firebase Auth', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'not-an-email' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.generatePasswordResetLink).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs a distinct, actionable line for a real failure (not auth/user-not-found) without leaking it to the response', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.generatePasswordResetLink.mockRejectedValueOnce(new Error('PERMISSION_DENIED: iam.serviceAccounts.signBlob'));

    const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'real@test.dev' });

    expect(res.status).toBe(200);
    expect(res.body.message).not.toMatch(/permission|signBlob/i);
    const logged = consoleErrorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toMatch(/serviceAccountTokenCreator/);
    consoleErrorSpy.mockRestore();
  });

  it('never requires auth — this is a pre-sign-in endpoint', async () => {
    const res = await request(app).post('/api/auth/password-reset/request').send({ email: 'anon@test.dev' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/password-reset/confirm-notify', () => {
  it('sends a "password changed" notice to the given email with no clickable link in it', async () => {
    const res = await request(app).post('/api/auth/password-reset/confirm-notify').send({ email: 'real@test.dev' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual([{ email: 'real@test.dev' }]);
    expect(body.htmlContent).not.toContain('<a ');
  });

  it('rejects a malformed email with 400', async () => {
    const res = await request(app).post('/api/auth/password-reset/confirm-notify').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/mfa/status', () => {
  it('reports disabled with no enrollment doc at all', async () => {
    const res = await request(app).get('/api/auth/mfa/status').set(auth('fresh_user'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, enrolledAt: null });
  });

  it('reports enabled once a doc says so, and never returns the secret', async () => {
    seedDoc('users/enrolled_user/security/mfa_totp', {
      secretEncrypted: 'totally-encrypted-blob',
      enabled: true,
      enrolledAt: '2026-01-01T00:00:00.000Z',
    });
    const res = await request(app).get('/api/auth/mfa/status').set(auth('enrolled_user'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: true, enrolledAt: '2026-01-01T00:00:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('totally-encrypted-blob');
  });
});

describe('POST /api/auth/mfa/totp/enroll/start', () => {
  it('generates and stores an encrypted pending secret, returning the otpauth URI and manual-entry secret', async () => {
    const res = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('enroll_user'));

    expect(res.status).toBe(200);
    expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(typeof res.body.secretForManualEntry).toBe('string');
    expect(res.body.secretForManualEntry.length).toBeGreaterThan(0);

    const stored = getDocRaw('users/enroll_user/security/mfa_totp');
    expect(stored?.pendingSecretEncrypted).toBeTruthy();
    // The stored value must be encrypted, not the plaintext secret verbatim.
    expect(stored?.pendingSecretEncrypted).not.toBe(res.body.secretForManualEntry);
    // Never persisted as "enabled" from just starting enrollment.
    expect(stored?.enabled).toBeUndefined();
  });

  it('overwrites an earlier abandoned pending secret on a second start', async () => {
    const first = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('restart_user'));
    const second = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('restart_user'));
    expect(first.body.secretForManualEntry).not.toBe(second.body.secretForManualEntry);

    const stored = getDocRaw('users/restart_user/security/mfa_totp');
    // Confirming with the first (now-abandoned) secret must fail.
    const staleCode = await generateOtp({ secret: first.body.secretForManualEntry });
    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('restart_user')).send({ code: staleCode });
    expect(res.status).toBe(400);
    expect(stored?.enabled).toBeUndefined();
  });
});

describe('POST /api/auth/mfa/totp/enroll/confirm', () => {
  it('confirms with the correct code, enables MFA, emails a notice, and returns recovery codes once', async () => {
    const startRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('confirm_user'));
    const code = await generateOtp({ secret: startRes.body.secretForManualEntry });

    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('confirm_user')).send({ code });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recoveryCodes)).toBe(true);
    expect(res.body.recoveryCodes).toHaveLength(8);

    const stored = getDocRaw('users/confirm_user/security/mfa_totp');
    expect(stored?.enabled).toBe(true);
    expect(stored?.pendingSecretEncrypted).toBeNull();
    expect(stored?.secretEncrypted).toBeTruthy();
    // Only hashes are stored server-side, never the plaintext recovery codes.
    expect(stored?.recoveryCodesHashed).toHaveLength(8);
    expect(JSON.stringify(stored?.recoveryCodesHashed)).not.toContain(res.body.recoveryCodes[0]);

    // The "2FA enabled" notice went out via Brevo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).to).toEqual([{ email: 'confirm_user@test.dev' }]);
  });

  it('rejects a wrong 6-digit code and leaves MFA unenabled', async () => {
    const startRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('wrongcode_user'));
    const realCode = await generateOtp({ secret: startRes.body.secretForManualEntry });
    const wrongCode = realCode === '000000' ? '111111' : '000000';

    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('wrongcode_user')).send({ code: wrongCode });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const stored = getDocRaw('users/wrongcode_user/security/mfa_totp');
    expect(stored?.enabled).toBeUndefined();
  });

  it('rejects confirmation with no enrollment ever started', async () => {
    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('never_started_user')).send({ code: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed code (not 6 digits) with 400', async () => {
    await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('malformed_user'));
    const res = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth('malformed_user')).send({ code: 'abcdef' });
    expect(res.status).toBe(400);
  });
});

// Enrolls a fresh user end-to-end via the real routes and returns the
// secret (for generating live codes), the one-time recovery codes, and the
// session token issued on confirm — once an account has MFA enabled, the
// account-level mfaEnabled claim gates every further authenticated call
// (other than status/verify-at-signin) behind a proven-this-session token,
// so callers that need to hit another gated route afterwards (e.g. disable)
// must attach it.
async function enrollUser(uid: string): Promise<{ secret: string; recoveryCodes: string[]; mfaSessionToken: string }> {
  const startRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth(uid));
  const secret = startRes.body.secretForManualEntry;
  const code = await generateOtp({ secret });
  const confirmRes = await request(app).post('/api/auth/mfa/totp/enroll/confirm').set(auth(uid)).send({ code });
  return { secret, recoveryCodes: confirmRes.body.recoveryCodes, mfaSessionToken: confirmRes.body.mfaSessionToken };
}

describe('POST /api/auth/mfa/totp/verify-at-signin', () => {
  it('accepts a correct current code', async () => {
    const { secret } = await enrollUser('signin_user');
    const code = await generateOtp({ secret });
    const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('signin_user')).send({ code });
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(typeof res.body.mfaSessionToken).toBe('string');
  });

  it('accepts a valid recovery code and marks it used (single-use)', async () => {
    const { recoveryCodes } = await enrollUser('recovery_user');
    const firstUse = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('recovery_user')).send({ recoveryCode: recoveryCodes[0] });
    expect(firstUse.status).toBe(200);

    const secondUse = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('recovery_user')).send({ recoveryCode: recoveryCodes[0] });
    expect(secondUse.status).toBe(401);
  });

  it('accepts a recovery code regardless of case/whitespace/dash formatting', async () => {
    const { recoveryCodes } = await enrollUser('recovery_format_user');
    const messy = ` ${recoveryCodes[0].toLowerCase().replace('-', '')} `;
    const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('recovery_format_user')).send({ recoveryCode: messy });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong code with 401', async () => {
    const { secret } = await enrollUser('wrong_signin_user');
    const realCode = await generateOtp({ secret });
    const wrongCode = realCode === '000000' ? '111111' : '000000';
    const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('wrong_signin_user')).send({ code: wrongCode });
    expect(res.status).toBe(401);
  });

  it('rejects when MFA was never enrolled', async () => {
    const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('never_enrolled_user')).send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('rejects a body with both a code and a recovery code, or neither', async () => {
    const both = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('x')).send({ code: '123456', recoveryCode: 'AAAA-1111' });
    expect(both.status).toBe(400);
    const neither = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('x')).send({});
    expect(neither.status).toBe(400);
  });

  it('locks out after 5 consecutive wrong attempts, rejecting even a subsequently correct code', async () => {
    const { secret } = await enrollUser('lockout_user');
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('lockout_user')).send({ code: '000000' });
      expect(res.status).toBe(401);
    }
    const correctCode = await generateOtp({ secret });
    const lockedRes = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('lockout_user')).send({ code: correctCode });
    expect(lockedRes.status).toBe(429);
  });

  it('resets the failed-attempt counter after a success', async () => {
    const { secret } = await enrollUser('reset_counter_user');
    await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('reset_counter_user')).send({ code: '000000' });
    await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('reset_counter_user')).send({ code: '000000' });
    const goodCode = await generateOtp({ secret });
    const success = await request(app).post('/api/auth/mfa/totp/verify-at-signin').set(auth('reset_counter_user')).send({ code: goodCode });
    expect(success.status).toBe(200);
    const stored = getDocRaw('users/reset_counter_user/security/mfa_totp');
    expect(stored?.failedAttempts).toBe(0);
  });
});

describe('POST /api/auth/mfa/totp/disable', () => {
  it('disables with a correct code, clears the secret and recovery codes, revokes sessions, and emails a notice', async () => {
    const { secret, mfaSessionToken } = await enrollUser('disable_user');
    const code = await generateOtp({ secret });
    fetchMock.mockClear();

    const res = await request(app)
      .post('/api/auth/mfa/totp/disable')
      .set(auth('disable_user'))
      .set('X-MFA-Session-Token', mfaSessionToken)
      .send({ code });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const stored = getDocRaw('users/disable_user/security/mfa_totp');
    expect(stored?.enabled).toBe(false);
    expect(stored?.secretEncrypted).toBeNull();
    expect(stored?.recoveryCodesHashed).toEqual([]);
    // The mfaEnabled claim is synced off, so a plain (no session-token)
    // request from here on is no longer gated.
    expect(h.claimsStore.get('disable_user')?.mfaEnabled).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).to).toEqual([{ email: 'disable_user@test.dev' }]);

    const statusRes = await request(app).get('/api/auth/mfa/status').set(auth('disable_user'));
    expect(statusRes.body.enabled).toBe(false);
  });

  it('disables with a valid recovery code just as well as a TOTP code', async () => {
    const { recoveryCodes, mfaSessionToken } = await enrollUser('disable_recovery_user');
    const res = await request(app)
      .post('/api/auth/mfa/totp/disable')
      .set(auth('disable_recovery_user'))
      .set('X-MFA-Session-Token', mfaSessionToken)
      .send({ recoveryCode: recoveryCodes[0] });
    expect(res.status).toBe(200);
  });

  it('refuses to disable with a wrong code, leaving MFA on', async () => {
    const { secret, mfaSessionToken } = await enrollUser('disable_wrong_user');
    const realCode = await generateOtp({ secret });
    const wrongCode = realCode === '000000' ? '111111' : '000000';

    const res = await request(app)
      .post('/api/auth/mfa/totp/disable')
      .set(auth('disable_wrong_user'))
      .set('X-MFA-Session-Token', mfaSessionToken)
      .send({ code: wrongCode });

    expect(res.status).toBe(401);
    const stored = getDocRaw('users/disable_wrong_user/security/mfa_totp');
    expect(stored?.enabled).toBe(true);
  });

  it('rejects disabling when MFA was never enabled', async () => {
    const res = await request(app).post('/api/auth/mfa/totp/disable').set(auth('not_enabled_user')).send({ code: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejects an enabled account\'s disable/enroll calls without a valid MFA session token, even with a valid ID token', async () => {
    const { secret } = await enrollUser('nosession_user');
    const code = await generateOtp({ secret });

    const disableRes = await request(app).post('/api/auth/mfa/totp/disable').set(auth('nosession_user')).send({ code });
    expect(disableRes.status).toBe(401);
    expect(disableRes.body.code).toBe('MFA_SESSION_REQUIRED');
    const stored = getDocRaw('users/nosession_user/security/mfa_totp');
    expect(stored?.enabled).toBe(true);

    // Also blocks re-enrollment — the takeover path this gate specifically
    // closes: an attacker with a valid-but-unverified token silently
    // overwriting the real authenticator via enroll/start + enroll/confirm.
    const enrollStartRes = await request(app).post('/api/auth/mfa/totp/enroll/start').set(auth('nosession_user'));
    expect(enrollStartRes.status).toBe(401);
    expect(enrollStartRes.body.code).toBe('MFA_SESSION_REQUIRED');
  });

  it('an expired or tampered MFA session token is rejected the same as a missing one', async () => {
    const { secret, mfaSessionToken } = await enrollUser('tampered_user');
    const code = await generateOtp({ secret });
    const tampered = mfaSessionToken.slice(0, -1) + (mfaSessionToken.endsWith('0') ? '1' : '0');

    const res = await request(app)
      .post('/api/auth/mfa/totp/disable')
      .set(auth('tampered_user'))
      .set('X-MFA-Session-Token', tampered)
      .send({ code });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MFA_SESSION_REQUIRED');
  });
});
