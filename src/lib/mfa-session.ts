// The client-side half of the server-side MFA session gate (server.ts's
// authenticateFirebaseUser / X-MFA-Session-Token check): a small, shared
// place to read/write the signed token so both auth.tsx (which obtains it
// at sign-in/enrollment time) and secure-api.ts (which must attach it to
// every request) agree on the same sessionStorage key without importing
// from each other.
//
// sessionStorage, not localStorage, deliberately - the same reasoning as
// the rest of this app's MFA session state: a completed verification must
// never silently carry over into a genuinely new browser session on the
// same device/profile.
const mfaSessionTokenKey = (uid: string) => `blazebreak_mfa_session_token_${uid}`;

export function getMfaSessionToken(uid: string): string | null {
  try {
    return sessionStorage.getItem(mfaSessionTokenKey(uid));
  } catch {
    // sessionStorage can be blocked (private browsing, locked-down
    // settings) - callers treat a missing token as "not yet verified",
    // which is the safe direction to fail in.
    return null;
  }
}

export function setMfaSessionToken(uid: string, token: string): void {
  try {
    sessionStorage.setItem(mfaSessionTokenKey(uid), token);
  } catch {
    // Nothing to fall back to - the token just won't survive a refresh.
  }
}

export function clearMfaSessionToken(uid: string): void {
  try {
    sessionStorage.removeItem(mfaSessionTokenKey(uid));
  } catch {
    // Nothing to clear.
  }
}
