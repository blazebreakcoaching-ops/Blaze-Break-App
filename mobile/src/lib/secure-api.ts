// RN port of ../../../src/lib/secure-api.ts. Same contract (Bearer +
// X-Firebase-AppCheck headers, 401/403-retry-once-with-forced-refresh),
// adapted for two things web didn't need: an absolute API_BASE_URL
// (native fetch has no same-origin relative path to fall back to) and a
// native App Check token source (see app-check.ts) instead of web's
// reCAPTCHA Enterprise one. MFA-session-token handling is dropped
// entirely - MFA is out of scope for Phase 1, and no mobile account can
// have it enabled yet, so there's nothing to attach.
import { auth } from './firebase';
import { getAppCheckToken } from './app-check';
import { API_BASE_URL } from './config';

export class SecureApiError extends Error {
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'SecureApiError';
    this.status = status;
    this.details = details;
  }
}

interface SecureApiOptions extends RequestInit {
  data?: unknown;
}

export async function secureApiFetch(path: string, options: SecureApiOptions = {}, retryCount = 0): Promise<Response> {
  const user = auth.currentUser;

  if (!user) {
    throw new SecureApiError('Unauthorized: User not signed in.', 401);
  }

  const forceRefresh = retryCount > 0;
  const idToken = await user.getIdToken(forceRefresh);

  if (!idToken) {
    throw new SecureApiError('Unauthorized: Could not obtain Firebase Auth ID token.', 401);
  }

  const appCheckToken = await getAppCheckToken(forceRefresh);

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${idToken}`);
  if (appCheckToken) {
    headers.set('X-Firebase-AppCheck', appCheckToken);
  }

  const { data, ...rest } = options;
  if (data !== undefined) {
    headers.set('Content-Type', 'application/json');
    (rest as RequestInit).body = JSON.stringify(data);
  }

  const fetchOptions: RequestInit = { ...rest, headers };
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SecureApiError(`Network error: ${message}`, 0);
  }

  if (response.ok) {
    return response;
  }

  const status = response.status;

  if ((status === 401 || status === 403) && retryCount < 1) {
    return secureApiFetch(path, options, retryCount + 1);
  }

  let errorMessage = `API Error ${status}`;
  let errorDetails: unknown = null;

  try {
    const errorData = await response.json();
    if (errorData.error) errorMessage = errorData.error;
    if (errorData.details) errorDetails = errorData.details;
  } catch {
    errorMessage = (await response.text()) || errorMessage;
  }

  if (status === 401 || status === 403) {
    throw new SecureApiError(`Unauthorized: ${errorMessage}. Please sign in again.`, status, errorDetails);
  } else if (status === 429) {
    throw new SecureApiError(`Rate Limit Exceeded: ${errorMessage}`, status, errorDetails);
  } else if (status === 400) {
    throw new SecureApiError(`Validation Error: ${errorMessage}`, status, errorDetails);
  }

  throw new SecureApiError(errorMessage, status, errorDetails);
}
