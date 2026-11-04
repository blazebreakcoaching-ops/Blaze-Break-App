// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expireMfaSession, getMfaSessionToken, MFA_SESSION_REQUIRED_EVENT, setMfaSessionToken } from './mfa-session';

describe('existing MFA session expiry behaviour', () => {
  afterEach(() => {
    sessionStorage.clear();
  });
  it('erases expired session credentials and requests a fresh challenge', () => {
    const uid = 'mfa-test-user';
    const listener = vi.fn();
    window.addEventListener(MFA_SESSION_REQUIRED_EVENT, listener);
    setMfaSessionToken(uid, 'expired-token');
    expect(getMfaSessionToken(uid)).toBe('expired-token');
    expireMfaSession(uid);
    expect(getMfaSessionToken(uid)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(MFA_SESSION_REQUIRED_EVENT, listener);
  });
});
