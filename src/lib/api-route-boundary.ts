export function assertWebApiRoute(path: string, origin: string): string {
  if (typeof path !== 'string' || !path.startsWith('/api/') ||
      path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error('Only relative Blaze Break /api/ routes are permitted');
  }
  let base: URL, resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(path, base);
  } catch {
    throw new Error('Invalid Blaze Break API URL');
  }
  if (!['http:', 'https:'].includes(base.protocol) ||
      base.username || base.password || base.pathname !== '/' ||
      base.search || base.hash || resolved.origin !== base.origin ||
      !resolved.pathname.startsWith('/api/')) {
    throw new Error('API requests must stay on the Blaze Break origin');
  }
  // Keep relative URLs unchanged so existing Playwright intercepts work.
  return path;
}
export function assertPublicLegalRoute(path: string, origin: string): string {
  assertWebApiRoute(path, origin);
  if (!/^\/api\/legal\/documents(?:\/[A-Za-z][A-Za-z0-9_-]*)?(?:\?.*)?$/.test(path)) {
    throw new Error('Public API is restricted to Blaze Break legal documents');
  }
  return path;
}


export type PublicPasswordRoute =
  | '/api/auth/password-reset/request'
  | '/api/auth/password-reset/confirm-notify';

export function assertPublicPasswordRoute(path: string, origin: string): PublicPasswordRoute {
  assertWebApiRoute(path, origin);
  if (path !== '/api/auth/password-reset/request' &&
      path !== '/api/auth/password-reset/confirm-notify') {
    throw new Error('Public password API only permits fixed reset endpoints');
  }
  return path;
}
