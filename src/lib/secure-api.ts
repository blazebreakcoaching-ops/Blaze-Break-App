import { auth, getAppCheckToken } from './firebase';

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
  if (appCheckToken) {
    headers.set('X-Firebase-AppCheck', appCheckToken);
  } else if (!needsAppCheck || (import.meta as any).env.DEV) {
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

  try {
    const errorData = await response.json();
    if (errorData.error) {
      errorMessage = errorData.error;
    }
    if (errorData.details) {
      errorDetails = errorData.details;
    }
  } catch (e) {
    // Response is not JSON
    errorMessage = await response.text() || errorMessage;
  }

  if (status === 401 || status === 403) {
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
