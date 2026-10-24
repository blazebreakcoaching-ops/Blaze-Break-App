import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Auth } from 'firebase/auth';

// Mock only the three call sites that would otherwise trigger a real OAuth
// popup or network round-trip - GoogleAuthProvider/OAuthProvider/
// FacebookAuthProvider stay the real Firebase classes (constructing one and
// calling addScope() is pure/offline), just with their static
// credentialFromError/credentialFromResult methods replaced by spies, since
// faithfully faking Firebase's internal error-parsing shape would be
// fragile and SDK-version-dependent in a way that testing the actual
// three-step branching logic doesn't require.
vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  class GoogleAuthProvider extends actual.GoogleAuthProvider {
    static override credentialFromError = vi.fn();
    static override credentialFromResult = vi.fn();
  }
  class OAuthProvider extends actual.OAuthProvider {
    static override credentialFromError = vi.fn();
  }
  class FacebookAuthProvider extends actual.FacebookAuthProvider {
    static override credentialFromError = vi.fn();
  }
  return {
    ...actual,
    signInWithPopup: vi.fn(),
    linkWithPopup: vi.fn(),
    signInWithCredential: vi.fn(),
    GoogleAuthProvider,
    OAuthProvider,
    FacebookAuthProvider,
  };
});

import { signInWithPopup, linkWithPopup, signInWithCredential, GoogleAuthProvider, OAuthProvider, FacebookAuthProvider } from 'firebase/auth';
import { signInWithGoogle, signInWithGoogleCalendar, signInWithMicrosoft, signInWithFacebook, revokeGoogleCalendarAccess } from './auth';

const fakeAuth = (currentUser: { isAnonymous: boolean } | null): Auth => ({ currentUser } as unknown as Auth);
const fakeResult = { user: { uid: 'real-uid' } } as any;
const collisionError = Object.assign(new Error('collision'), { code: 'auth/credential-already-in-use' });
const otherError = Object.assign(new Error('nope'), { code: 'auth/popup-closed-by-user' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  { name: 'Google', fn: signInWithGoogle, provider: GoogleAuthProvider },
  { name: 'Microsoft', fn: signInWithMicrosoft, provider: OAuthProvider },
  { name: 'Facebook', fn: signInWithFacebook, provider: FacebookAuthProvider },
])('$name sign-in (three-step anonymous-link/collision-fallback pattern)', ({ fn, provider }) => {
  it('links the provider when the current session is anonymous, rather than signing in fresh', async () => {
    (linkWithPopup as any).mockResolvedValue(fakeResult);
    const result = await fn(fakeAuth({ isAnonymous: true }));
    expect(linkWithPopup).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('signs in directly (not link) when there is no anonymous session', async () => {
    (signInWithPopup as any).mockResolvedValue(fakeResult);
    const result = await fn(fakeAuth(null));
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(linkWithPopup).not.toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('signs in directly when the current session exists but is not anonymous', async () => {
    (signInWithPopup as any).mockResolvedValue(fakeResult);
    await fn(fakeAuth({ isAnonymous: false }));
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(linkWithPopup).not.toHaveBeenCalled();
  });

  it('on a credential-already-in-use collision while linking, signs into the real existing account instead', async () => {
    (linkWithPopup as any).mockRejectedValue(collisionError);
    const extractedCredential = { providerId: 'fake' };
    (provider.credentialFromError as any).mockReturnValue(extractedCredential);
    (signInWithCredential as any).mockResolvedValue(fakeResult);

    const result = await fn(fakeAuth({ isAnonymous: true }));

    expect(provider.credentialFromError).toHaveBeenCalledWith(collisionError);
    expect(signInWithCredential).toHaveBeenCalledWith(expect.anything(), extractedCredential);
    expect(result).toBe(fakeResult);
  });

  it('rethrows the collision error if no credential could be extracted from it', async () => {
    (linkWithPopup as any).mockRejectedValue(collisionError);
    (provider.credentialFromError as any).mockReturnValue(null);

    await expect(fn(fakeAuth({ isAnonymous: true }))).rejects.toBe(collisionError);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });

  it('rethrows any other error unchanged (never silently swallowed)', async () => {
    (linkWithPopup as any).mockRejectedValue(otherError);
    await expect(fn(fakeAuth({ isAnonymous: true }))).rejects.toBe(otherError);
    expect(provider.credentialFromError).not.toHaveBeenCalled();
  });
});

describe('signInWithGoogleCalendar', () => {
  it('requests calendar and gmail scopes and follows the same anonymous-link pattern', async () => {
    (linkWithPopup as any).mockResolvedValue(fakeResult);
    const result = await signInWithGoogleCalendar(fakeAuth({ isAnonymous: true }));
    expect(linkWithPopup).toHaveBeenCalledTimes(1);
    // The provider instance passed to linkWithPopup should carry the
    // calendar/gmail scopes this variant adds beyond signInWithGoogle.
    const providerArg = (linkWithPopup as any).mock.calls[0][1];
    expect(providerArg.scopes).toEqual(expect.arrayContaining([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.readonly',
    ]));
    expect(result).toBe(fakeResult);
  });

  // Phase 5J, directive §3 - calendar.readonly was removed as genuinely
  // redundant (every real caller only ever reads calendars/primary/events,
  // which calendar.events already covers for reading) - this proves it
  // is gone, not just that the two still-needed scopes are present.
  it('no longer requests the redundant calendar.readonly scope', async () => {
    (linkWithPopup as any).mockResolvedValue(fakeResult);
    await signInWithGoogleCalendar(fakeAuth({ isAnonymous: true }));
    const providerArg = (linkWithPopup as any).mock.calls[0][1];
    expect(providerArg.scopes).not.toContain('https://www.googleapis.com/auth/calendar.readonly');
  });

  it('falls back to signing into the real account on a collision, same as signInWithGoogle', async () => {
    (linkWithPopup as any).mockRejectedValue(collisionError);
    const extractedCredential = { providerId: 'fake' };
    (GoogleAuthProvider.credentialFromError as any).mockReturnValue(extractedCredential);
    (signInWithCredential as any).mockResolvedValue(fakeResult);

    const result = await signInWithGoogleCalendar(fakeAuth({ isAnonymous: true }));
    expect(signInWithCredential).toHaveBeenCalledWith(expect.anything(), extractedCredential);
    expect(result).toBe(fakeResult);
  });
});

// Calendar Pilot readiness audit, Task 1 - closes the gap where
// "Disconnect Google Workspace" claimed to revoke the cached access
// token but never actually called Google. This is the real revoke call
// that claim now relies on being true.
describe('revokeGoogleCalendarAccess', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('calls Google\'s real revoke endpoint with the token, and reports success', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const result = await revokeGoogleCalendarAccess('tok_abc');
    expect(result).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe('token=tok_abc');
  });

  it('reports failure (without throwing) when Google rejects the revoke - e.g. the token was already invalid', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(revokeGoogleCalendarAccess('stale_tok')).resolves.toBe(false);
  });

  it('reports failure (without throwing) on a network error - the caller must still be able to sign the user out regardless', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(revokeGoogleCalendarAccess('tok')).resolves.toBe(false);
  });

  it('URL-encodes a token containing special characters rather than sending it raw', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await revokeGoogleCalendarAccess('tok/with+special=chars');
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.body).toBe(`token=${encodeURIComponent('tok/with+special=chars')}`);
  });
});
