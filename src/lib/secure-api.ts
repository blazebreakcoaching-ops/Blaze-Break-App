import { auth, getAppCheckToken } from './firebase';
import { getMfaSessionToken, clearMfaSessionToken } from './mfa-session';

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
  const user = auth.currentUser;
  
  if (!user) {
    throw new SecureApiError("Unauthorized: User not signed in.", 401);
  }

  // Force refresh ID token if retrying
  const forceRefresh = retryCount > 0;
  const idToken = await user.getIdToken(forceRefresh);

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
  const mfaSessionToken = getMfaSessionToken(user.uid);
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

  if (options.data) {
    headers.set('Content-Type', 'application/json');
    options.body = JSON.stringify(options.data);
    delete options.data;
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(path, fetchOptions);
  } catch (error: any) {
    throw new SecureApiError(`Network error: ${error.message}`, 0);
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

  try {
    const errorData = await response.json();
    if (errorData.error) {
      errorMessage = errorData.error;
    }
    if (errorData.details) {
      errorDetails = errorData.details;
    }
    if (errorData.code) {
      errorCode = errorData.code;
    }
  } catch (e) {
    // Response is not JSON
    errorMessage = await response.text() || errorMessage;
  }

  if (status === 401 || status === 403) {
    if (errorCode === 'MFA_SESSION_REQUIRED') {
      // The signed session token is missing/expired (its 12-hour TTL ran
      // out, or this is a different tab/device) - clear it so the next
      // mfa/status check on a refresh correctly re-challenges, rather than
      // trusting a stale sessionStorage flag that no longer matches what
      // the server will accept.
      if (auth.currentUser) clearMfaSessionToken(auth.currentUser.uid);
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
