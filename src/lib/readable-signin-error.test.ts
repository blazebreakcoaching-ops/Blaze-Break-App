import { describe, expect, it } from 'vitest';
import { readableSignInError, readablePasswordResetError } from './readable-signin-error';

describe('customer sign-in error messages', () => {
  it('explains the common staging domain failure without exposing internal secrets', () => {
    const result = readableSignInError({ code: 'auth/unauthorized-domain', message: 'private token and secret' });
    expect(result).toMatch(/preview address/);
    expect(result).not.toContain('private token');
  });
  it('explains disabled sign-in methods and blocked popups', () => {
    expect(readableSignInError({code:'auth/operation-not-allowed'})).toContain('not enabled');
    expect(readableSignInError({code:'auth/popup-blocked'})).toContain('pop-ups');
  });
  it('does not reveal whether an email account exists at sign-in', () => {
    const first = readableSignInError({code:'auth/user-not-found'});
    expect(first).toBe(readableSignInError({code:'auth/wrong-password'}));
    expect(readableSignInError({code:'auth/invalid-credential'})).not.toMatch(/account exists/i);
  });
  it('shows a safe reference when Firebase reports an unknown auth error', () => {
    const problem = Object.assign(new Error('sensitive person@example.test'), { code: 'auth/internal-error' });
    expect(readableSignInError(problem)).toContain('reference: auth/internal-error');
    expect(readableSignInError(problem)).not.toContain('person@example.test');
  });
  it('extracts a safe Firebase code from an exception with no code property', () => {
    expect(readableSignInError(new Error('Firebase: Error (auth/unknown-failure).'))).toContain('auth/unknown-failure');
  });
  it('preserves the approved app-generated account-exists error', () => {
    expect(readableSignInError(new Error('An account with this email already exists. Try signing in instead.'))).toContain('Try signing in instead.');
  });
  it('returns a generic message for unexpected errors instead of raw exceptions', () => {
    expect(readableSignInError(new Error('secret key!'))).not.toContain('secret');
    expect(readableSignInError(null)).toContain('could not complete');
  });
});

describe('password recovery errors', () => {
  it('shows a safe rate-limit message instead of exposing provider details', () => {
    const error = Object.assign(new Error('Brevo failure: internal-key'), { status: 429 });
    const result = readablePasswordResetError(error);
    expect(result).toContain('Too many password reset attempts');
    expect(result).not.toContain('Brevo');
    expect(result).not.toContain('internal-key');
  });

  it('explains connection failures without exposing internal URLs', () => {
    const error = Object.assign(new Error('https://internal.service.local:8888'), { status: 0 });
    const result = readablePasswordResetError(error);
    expect(result).toContain('Check your connection');
    expect(result).not.toContain('internal.service');
  });

  it.each([400, 401, 403, 404, 500, 503, 504])(
    'shows generic safe text for HTTP %i',
    (status) => {
      const error = Object.assign(new Error('Provider secret=123, account exists=true'), { status });
      const result = readablePasswordResetError(error);
      expect(result).toContain('Password recovery is unavailable');
      expect(result).not.toContain('Provider');
      expect(result).not.toContain('secret');
      expect(result).not.toContain('account exists');
    },
  );

  it('handles unexpected errors without revealing server text', () => {
    const result = readablePasswordResetError('unexpected server diagnostic: token=123');
    expect(result).toContain('Password recovery is unavailable');
    expect(result).not.toContain('token=123');
  });
});
