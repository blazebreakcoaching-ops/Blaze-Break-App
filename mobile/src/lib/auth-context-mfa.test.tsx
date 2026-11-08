import React from 'react';
import { act, create } from 'react-test-renderer';

// Account switching, expiry and in-flight changes must never let an
// account with two-factor on reach app screens without its own code.
let authListener: ((u: any) => Promise<void> | void) | null = null;
const mockAuth: { currentUser: any } = { currentUser: null };
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: any) => { authListener = cb; return () => {}; },
  signInAnonymously: jest.fn(), linkWithCredential: jest.fn(), signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(), signOut: jest.fn(async () => {}), EmailAuthProvider: { credential: jest.fn() },
}));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn(async () => ({ exists: () => true })), setDoc: jest.fn() }));
jest.mock('./firebase', () => ({
  // Read lazily: jest.mock is hoisted above the mockAuth declaration.
  auth: { get currentUser() { return mockAuth.currentUser; } },
  getDb: async () => ({}),
}));
const mockFetch = jest.fn();
jest.mock('./secure-api', () => {
  class SecureApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }
  return { SecureApiError, secureApiFetch: (...args: unknown[]) => mockFetch(...args) };
});

import { AuthProvider, useAuth } from './auth-context';
import { expireMfaSession, getMfaSessionToken, clearMfaSessionToken } from './mfa-session';

const account = (uid: string, mfaEnabled: boolean) => ({
  uid, isAnonymous: false, displayName: null,
  getIdTokenResult: async () => ({ claims: { mfaEnabled } }),
});
let ctx: ReturnType<typeof useAuth>;
const Probe = () => { ctx = useAuth(); return null; };
const switchTo = async (user: any) => {
  mockAuth.currentUser = user;
  await act(async () => { await authListener!(user); });
};

beforeEach(async () => {
  clearMfaSessionToken();
  mockFetch.mockReset();
  await act(async () => { create(<AuthProvider><Probe /></AuthProvider>); });
});

describe('native two-factor gate', () => {
  it('holds a 2FA account at the challenge, then clears it after a verified code', async () => {
    await switchTo(account('alice', true));
    expect(ctx.securityGate).toBe('mfa_required');
    mockFetch.mockResolvedValue({ json: async () => ({ verified: true, mfaSessionToken: 'tok-alice' }) });
    let result: string | null = 'unset';
    await act(async () => { result = await ctx.verifyMfa('code', '123456'); });
    expect(result).toBeNull();
    expect(ctx.securityGate).toBe('clear');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/mfa/totp/verify-at-signin',
      { method: 'POST', data: { code: '123456' }, noAuthRetry: true });
  });

  it("switching to another 2FA account does NOT inherit the first account's verification", async () => {
    await switchTo(account('alice', true));
    mockFetch.mockResolvedValue({ json: async () => ({ verified: true, mfaSessionToken: 'tok-alice' }) });
    await act(async () => { await ctx.verifyMfa('code', '123456'); });
    await switchTo(account('bob', true));
    expect(ctx.securityGate).toBe('mfa_required');
    expect(getMfaSessionToken('bob')).toBeNull();
    expect(getMfaSessionToken('alice')).toBeNull();
  });

  it('if the account changes while the code is being checked, the token is discarded', async () => {
    await switchTo(account('alice', true));
    mockFetch.mockImplementation(async () => {
      mockAuth.currentUser = account('mallory', true);
      return { json: async () => ({ verified: true, mfaSessionToken: 'tok-alice' }) };
    });
    let result: string | null = null;
    await act(async () => { result = await ctx.verifyMfa('code', '123456'); });
    expect(result).toMatch(/account changed/);
    expect(getMfaSessionToken('mallory')).toBeNull();
    expect(ctx.securityGate).toBe('mfa_required');
  });

  it('an expired 2FA session sends the same account back to the challenge', async () => {
    await switchTo(account('alice', true));
    mockFetch.mockResolvedValue({ json: async () => ({ verified: true, mfaSessionToken: 'tok-alice' }) });
    await act(async () => { await ctx.verifyMfa('code', '123456'); });
    expect(ctx.securityGate).toBe('clear');
    await act(async () => { expireMfaSession(); });
    expect(ctx.securityGate).toBe('mfa_required');
  });

  it('a wrong code keeps the account at the challenge with the reason', async () => {
    await switchTo(account('alice', true));
    const { SecureApiError } = jest.requireMock('./secure-api');
    mockFetch.mockRejectedValue(new SecureApiError("That code didn't match.", 401));
    let result: string | null = null;
    await act(async () => { result = await ctx.verifyMfa('code', '000000'); });
    expect(result).toMatch(/didn't match/);
    expect(ctx.securityGate).toBe('mfa_required');
  });

  it('a response without a token is never treated as verified', async () => {
    await switchTo(account('alice', true));
    mockFetch.mockResolvedValue({ json: async () => ({ verified: true }) });
    await act(async () => { await ctx.verifyMfa('code', '123456'); });
    expect(ctx.securityGate).toBe('mfa_required');
  });

  it('accounts without 2FA are not challenged', async () => {
    await switchTo(account('carol', false));
    expect(ctx.securityGate).toBe('clear');
  });
});
