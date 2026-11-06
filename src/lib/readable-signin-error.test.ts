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
  it('returns a generic message for unexpected errors instead of raw exceptions', () => {
    expect(readableSignInError(new Error('secret key!'))).not.toContain('secret');
    expect(readableSignInError(null)).toContain('could not complete');
  });
});
