import { auth, getAppCheckToken } from './firebase';
import { getMfaSessionToken, expireMfaSession } from './mfa-session';
import { assertWebApiRoute, assertPublicLegalRoute, assertPublicPasswordRoute, type PublicPasswordRoute } from './api-route-boundary';

export class SecureApiError extends Error {
  public status: number;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'SecureApiError';
    this.status = status;
    this.details = details;
  }
}

interface SecureApiOptions extends RequestInit {
  data?: any;
}

export async function secureApiFetch(path: string, options: SecureApiOptions = {}, retryCount = 0): Promise<Response> {
  // Fail closed before reading credentials; callers may only target our /api/.
  assertWebApiRoute(path, window.location.origin);
  // Phase 5E (directive §8) browser-level test escape hatch ONLY: a real
  // signed-in Firebase user is not available to the dev-only Playwright
  // preview entry (nhei-phase5-preview-e2e-entry.tsx), which runs against
  // a local mock API server, not real Firestore/Auth - see that file's
  // own header. Gated on BOTH `import.meta.env.DEV` (statically false,
  // dead-code-eliminated out of any production build) AND a window flag
  // only that dev-only entry ever sets, so this can never fire for a real
  // user or in a production bundle.
  const e2eMockAuth = (import.meta as any).env.DEV && (window as any).__E2E_MOCK_AUTH__ === true;
  const user = e2eMockAuth ? null : auth.currentUser;

  if (!e2eMockAuth && !user) {
    throw new SecureApiError("Unauthorized: User not signed in.", 401);
  }

  // Force refresh ID token if retrying
  const forceRefresh = retryCount > 0;
  const idToken = e2eMockAuth ? 'e2e-mock-id-token' : await user!.getIdToken(forceRefresh);

  if (!idToken) {
    throw new SecureApiError("Unauthorized: Could not obtain Firebase Auth ID token.", 401);
  }

  const appCheckToken = await getAppCheckToken(forceRefresh);
  const needsAppCheck = !!(import.meta as any).env?.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!appCheckToken && needsAppCheck && !(import.meta as any).env.DEV) {
    throw new SecureApiError("Protected API unavailable: App Check token could not be generated in this environment.", 403);
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${idToken}`);
  // No-op for an account without 2FA, or before it's been verified this
  // session - the server only enforces this header once it knows the
  // account has 2FA enabled (see authenticateFirebaseUser in server.ts).
  const mfaSessionToken = user ? getMfaSessionToken(user.uid) : null;
  if (mfaSessionToken) {
    headers.set('X-MFA-Session-Token', mfaSessionToken);
  }
  if (appCheckToken) {
    headers.set('X-Firebase-AppCheck', appCheckToken);
  } else if ((import.meta as any).env.DEV) {
    // Only meaningful in genuine local development, where the server's own
    // NODE_ENV check already skips App Check entirely — this header is inert
    // there either way. It is deliberately NOT sent as a fallback for a
    // misconfigured production deployment (missing App Check setup): the
    // server no longer honors this string outside of non-production, so
    // sending it there would just mask the real error with a misleading one.
    headers.set('X-Firebase-AppCheck', "dev-bypass");
  }

  const { data, ...requestInit } = options;
  if (data !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestInit.body = JSON.stringify(data);
  }
  const fetchOptions: RequestInit = {
    ...requestInit,
    headers,
    redirect: 'error', // Auth headers cannot follow an HTTP redirect.
  };

  let response: Response;
  try {
    response = await fetch(path, fetchOptions);
  } catch {
    throw new SecureApiError('Network error. Check your connection and try again.', 0);
  }

  if (response.ok) {
    return response;
  }

  // Handle specific status codes
  const status = response.status;
  
  if ((status === 401 || status === 403) && retryCount < 1) {
    // Retry once with a forced token refresh
    return secureApiFetch(path, options, retryCount + 1);
  }

  let errorMessage = `API Error ${status}`;
  let errorDetails: any = null;
  let errorCode: string | undefined;

  // The body is a one-shot stream. Never call text() after json() fails.
  try {
    const errorData = JSON.parse(await response.text());
    if (typeof errorData?.error === 'string') errorMessage = errorData.error;
    if (errorData?.details !== undefined) errorDetails = errorData.details;
    if (typeof errorData?.code === 'string') errorCode = errorData.code;
  } catch {
    // Do not leak HTML, provider text or stack traces in 5xx responses.
  }

  if (status === 401 || status === 403) {
    if (errorCode === 'MFA_SESSION_REQUIRED') {
      // The signed session token is missing/expired (its 12-hour TTL ran
      // out, or this is a different tab/device) - clear it so the next
      // mfa/status check on a refresh correctly re-challenges, rather than
      // trusting a stale sessionStorage flag that no longer matches what
      // the server will accept.
      if (auth.currentUser) expireMfaSession(auth.currentUser.uid);
      throw new SecureApiError('Two-factor verification is required again for this session.', status, errorDetails);
    }
    throw new SecureApiError(`Unauthorized: ${errorMessage}. Please sign in again.`, status, errorDetails);
  } else if (status === 429) {
    throw new SecureApiError(`Rate Limit Exceeded: ${errorMessage}`, status, errorDetails);
  } else if (status === 413) {
    throw new SecureApiError(`Payload Too Large: ${errorMessage}`, status, errorDetails);
  } else if (status === 400) {
    throw new SecureApiError(`Validation Error: ${errorMessage}`, status, errorDetails);
  } else if (status === 504) {
    throw new SecureApiError(`Timeout: ${errorMessage}`, status, errorDetails);
  }
  
  throw new SecureApiError(errorMessage, status, errorDetails);
}

// For the small set of genuinely public server routes (currently just the
// legal document reads, GET /api/legal/documents and
// /api/legal/documents/:docType) that only require verifyAppCheck server-
// side, never authenticateFirebaseUser - see server.ts. secureApiFetch
// above deliberately throws if nobody's signed in yet, even anonymously,
// because every other route it's used for genuinely does need a real
// user. Reading the Terms & Conditions or Privacy Notice must never
// depend on ANY account existing, not even the invisible anonymous
// session every visitor gets automatically - someone should be able to
// read what they'd be agreeing to before that session is even created,
// the same way they'd expect from any legitimate site's policy pages.
export async function publicApiFetch(path: string): Promise<Response> {
  assertPublicLegalRoute(path, window.location.origin);
  const appCheckToken = await getAppCheckToken();
  const headers = new Headers();
  if (appCheckToken) {
    headers.set('X-Firebase-AppCheck', appCheckToken);
  } else if ((import.meta as any).env.DEV) {
    headers.set('X-Firebase-AppCheck', "dev-bypass");
  }

  let response: Response;
  try {
    response = await fetch(path, { headers, redirect: 'error' });
  } catch {
    throw new SecureApiError('Network error. Check your connection and try again.', 0);
  }

  if (response.ok) {
    return response;
  }

  const status = response.status;
  let errorMessage = `API Error ${status}`;
  try {
    const errorData = JSON.parse(await response.text());
    if (typeof errorData?.error === 'string') errorMessage = errorData.error;
  } catch {
    // A non-JSON error response is not safe to display verbatim.
  }
  throw new SecureApiError(errorMessage, status);
}


/**
 * Forgot-password and password-changed notification are intentionally
 * unauthenticated endpoints. The person may be explicitly signed out, so
 * never require a Firebase Auth ID token for these flows. Keep the routes
 * fixed and allow only App Check, matching the server's anti-enumeration
 * rate-limited POST handlers.
 */
export async function publicPasswordApiFetch(
  path: PublicPasswordRoute,
  data: { email: string },
): Promise<Response> {
  assertPublicPasswordRoute(path, window.location.origin);
  const token = await getAppCheckToken();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('X-Firebase-AppCheck', token);
  else if ((import.meta as any).env.DEV) headers.set('X-Firebase-AppCheck', 'dev-bypass');
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST', headers, body: JSON.stringify({ email: data.email }), redirect: 'error',
    });
  } catch {
    throw new SecureApiError('Network error. Check your connection and try again.', 0);
  }
  if (response.ok) return response;
  let message = 'Password recovery is unavailable right now. Please try again.';
  try {
    const details = JSON.parse(await response.text());
    if (typeof details?.error === 'string') message = details.error;
  } catch {
    // Never display proxy/internal response text.
  }
  throw new SecureApiError(message, response.status);
}
