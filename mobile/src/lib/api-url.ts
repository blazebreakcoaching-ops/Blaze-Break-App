// The native API sends Firebase Auth and App Check credentials. It must
// never forward either token to a caller-provided absolute URL or a URL
// that escapes the configured /api/ path.
export function buildNativeApiUrl(baseUrl: string, path: string): string {
  if (!baseUrl) throw new Error('Missing EXPO_PUBLIC_API_BASE_URL');
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error('Invalid EXPO_PUBLIC_API_BASE_URL');
  }
  const isLocal = ['localhost', '127.0.0.1', '10.0.2.2'].includes(base.hostname);
  if (!(base.protocol === 'https:' || (base.protocol === 'http:' && isLocal)) ||
      base.username || base.password || base.search || base.hash ||
      (base.pathname !== '/' && base.pathname !== '')) {
    throw new Error('API base must be an HTTPS origin (HTTP only for local emulators)');
  }
  if (!path.startsWith('/api/') || path.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(path)) {
    throw new Error('Only relative /api/ routes are permitted');
  }
  const url = new URL(path, base.origin);
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('API route must remain on the configured API origin');
  }
  return url.toString();
}
