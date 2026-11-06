import { describe, expect, it } from 'vitest';
import { readableSignInError } from './readable-signin-error';

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
