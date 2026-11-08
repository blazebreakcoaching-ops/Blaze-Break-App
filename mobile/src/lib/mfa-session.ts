// Native holder for the server-signed MFA session token (the
// X-MFA-Session-Token the backend requires once an account has 2FA on).
//
// Memory only, never written to disk: like the website's sessionStorage
// copy, a verified session must not survive into a genuinely new app
// session. A cold start, sign-out or account switch therefore asks for a
// fresh code. The token is bound to one uid and is never returned for any
// other account, so switching accounts can never reuse a verification.
type Listener = () => void;

let current: { uid: string; token: string } | null = null;
const expiryListeners = new Set<Listener>();

export function setMfaSessionToken(uid: string, token: string): void {
  if (!uid || !token) return;
  current = { uid, token };
}

export function getMfaSessionToken(uid: string | null | undefined): string | null {
  return uid && current && current.uid === uid ? current.token : null;
}

export function clearMfaSessionToken(): void {
  current = null;
}

/** Called when the backend reports MFA_SESSION_REQUIRED (expired/revoked). */
export function expireMfaSession(): void {
  current = null;
  expiryListeners.forEach((listener) => listener());
}

export function onMfaSessionExpired(listener: Listener): () => void {
  expiryListeners.add(listener);
  return () => { expiryListeners.delete(listener); };
}
