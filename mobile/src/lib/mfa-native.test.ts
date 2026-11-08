// Native two-factor: session token handling, input validation, failure
// messages and the API client's MFA behaviour.
jest.mock('./firebase', () => ({ auth: { currentUser: null } }));
jest.mock('./app-check', () => ({ getAppCheckToken: async () => 'app-check-token' }));
jest.mock('./config', () => ({ API_BASE_URL: 'https://api.example.test' }));

import { auth } from './firebase';
import { setMfaSessionToken, getMfaSessionToken, clearMfaSessionToken, expireMfaSession, onMfaSessionExpired } from './mfa-session';
import { buildMfaSubmission, describeMfaFailure, extractMfaSessionToken } from './mfa-challenge';
import { secureApiFetch, SecureApiError } from './secure-api';

const signIn = (uid: string | null) => {
  (auth as any).currentUser = uid ? { uid, getIdToken: async () => `id-token-${uid}` } : null;
};
const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body,
});

beforeEach(() => {
  clearMfaSessionToken();
  signIn('user_a');
  (globalThis as any).fetch = jest.fn();
});

describe('MFA session token (memory only, bound to one account)', () => {
  it('is returned only for the account it was issued to', () => {
    setMfaSessionToken('user_a', 'tok-a');
    expect(getMfaSessionToken('user_a')).toBe('tok-a');
    expect(getMfaSessionToken('user_b')).toBeNull();
    expect(getMfaSessionToken(null)).toBeNull();
  });

  it('is cleared on expiry and notifies the app', () => {
    const listener = jest.fn();
    const unsubscribe = onMfaSessionExpired(listener);
    setMfaSessionToken('user_a', 'tok-a');
    expireMfaSession();
    expect(getMfaSessionToken('user_a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('challenge input validation (mirrors the server schema)', () => {
  it('accepts exactly six digits for an authenticator code', () => {
    expect(buildMfaSubmission('code', ' 123 456 ')).toEqual({ ok: true, body: { code: '123456' } });
    expect(buildMfaSubmission('code', '12345').ok).toBe(false);
    expect(buildMfaSubmission('code', '12345a').ok).toBe(false);
  });

  it('accepts an 8-20 character recovery code and never sends both', () => {
    expect(buildMfaSubmission('recovery', ' abcd-efgh ')).toEqual({ ok: true, body: { recoveryCode: 'abcd-efgh' } });
    expect(buildMfaSubmission('recovery', 'short').ok).toBe(false);
  });

  it('explains wrong code, lockout, outage and offline clearly', () => {
    expect(describeMfaFailure(401)).toMatch(/didn't match/);
    expect(describeMfaFailure(429)).toMatch(/wait a few minutes/);
    expect(describeMfaFailure(503)).toMatch(/couldn't finish securing/);
    expect(describeMfaFailure(0)).toMatch(/offline/);
  });

  it('only accepts a response that is verified AND carries a token', () => {
    expect(extractMfaSessionToken({ verified: true, mfaSessionToken: 'tok' })).toBe('tok');
    expect(extractMfaSessionToken({ verified: false, mfaSessionToken: 'tok' })).toBeNull();
    expect(extractMfaSessionToken({ verified: true })).toBeNull();
    expect(extractMfaSessionToken(null)).toBeNull();
  });
});

describe('secureApiFetch and two-factor', () => {
  it("attaches this account's MFA session token, and never another account's", async () => {
    setMfaSessionToken('user_a', 'tok-a');
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));
    await secureApiFetch('/api/org/me');
    expect(((globalThis as any).fetch as jest.Mock).mock.calls[0][1].headers.get('X-MFA-Session-Token')).toBe('tok-a');

    signIn('user_b');
    await secureApiFetch('/api/org/me');
    expect(((globalThis as any).fetch as jest.Mock).mock.calls[1][1].headers.get('X-MFA-Session-Token')).toBeNull();
  });

  it('on MFA_SESSION_REQUIRED: drops the token, returns to the challenge, does not retry', async () => {
    const listener = jest.fn();
    const unsubscribe = onMfaSessionExpired(listener);
    setMfaSessionToken('user_a', 'tok-a');
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(jsonResponse(401, { error: 'Two-factor verification required for this session.', code: 'MFA_SESSION_REQUIRED' }));
    await expect(secureApiFetch('/api/org/me')).rejects.toBeInstanceOf(SecureApiError);
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    expect(getMfaSessionToken('user_a')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('a wrong code is submitted ONCE (no automatic retry that would double-count toward lockout)', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(jsonResponse(401, { error: "That code didn't match. Please try again." }));
    await expect(secureApiFetch('/api/auth/mfa/totp/verify-at-signin', { method: 'POST', data: { code: '000000' }, noAuthRetry: true }))
      .rejects.toMatchObject({ status: 401 });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('ordinary 401s still retry once with a refreshed token', async () => {
    ((globalThis as any).fetch as jest.Mock).mockResolvedValue(jsonResponse(401, { error: 'expired' }));
    await expect(secureApiFetch('/api/org/me')).rejects.toMatchObject({ status: 401 });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(2);
  });
});
