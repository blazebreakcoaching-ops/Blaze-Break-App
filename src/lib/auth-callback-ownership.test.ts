import { describe, expect, it } from 'vitest';
import { mayCommitAuthCallback } from './auth-callback-ownership';

describe('auth state transition ownership', () => {
  it('allows the latest event for the authenticated Firebase identity', () => {
    expect(mayCommitAuthCallback(3, 3, 'account-B', 'account-B', false)).toBe(true);
  });

  it('rejects an older account A callback completing after account B signed in', () => {
    expect(mayCommitAuthCallback(1, 2, 'account-A', 'account-B', false)).toBe(false);
  });

  it('rejects an obsolete callback even if the user signs back into the same UID', () => {
    expect(mayCommitAuthCallback(1, 3, 'account-A', 'account-A', false)).toBe(false);
  });

  it('rejects mismatched Firebase state even when the event numbers match', () => {
    expect(mayCommitAuthCallback(5, 5, 'account-A', 'account-B', false)).toBe(false);
  });

  it('rejects callbacks after AuthProvider unmounts', () => {
    expect(mayCommitAuthCallback(5, 5, 'account-A', 'account-A', true)).toBe(false);
  });

  it('allows the current signed-out event without granting an old identity', () => {
    expect(mayCommitAuthCallback(6, 6, null, null, false)).toBe(true);
    expect(mayCommitAuthCallback(6, 6, 'account-A', null, false)).toBe(false);
  });
});
