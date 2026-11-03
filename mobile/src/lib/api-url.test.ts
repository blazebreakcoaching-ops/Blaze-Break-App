import { buildNativeApiUrl } from './api-url';

describe('native authenticated API URL boundaries', () => {
  const origin = 'https://blaze-break.example.com';

  it('builds standard API routes and permitted query strings', () => {
    expect(buildNativeApiUrl(origin, '/api/nova/chat')).toBe(origin + '/api/nova/chat');
    expect(buildNativeApiUrl(origin + '/', '/api/user/recommendation?from=pulse'))
      .toBe(origin + '/api/user/recommendation?from=pulse');
  });

  it.each([
    'https://outside.example/steal',
    '//outside.example/steal',
    '/outside',
    '/api/../../steal',
    '/api/../auth',
    '/api/\\outside',
    '/api/chat\nAuthorization: stolen',
  ])('rejects an unsafe route: %s', (path) => {
    expect(() => buildNativeApiUrl(origin, path)).toThrow();
  });

  it('never uses an implicit production API host when build configuration is missing', () => {
    expect(() => buildNativeApiUrl('', '/api/nova/chat')).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });

  it.each(['http://outside.example', 'javascript:alert(1)', 'https://someone:secret@example.com',
    'https://example.com/extra', 'https://example.com?key=value'])
  ('rejects an unsafe base origin: %s', (base) => {
    expect(() => buildNativeApiUrl(base, '/api/nova/chat')).toThrow();
  });

  it('permits explicit local emulator addresses but not remote HTTP', () => {
    expect(buildNativeApiUrl('http://127.0.0.1:3000', '/api/nova/chat'))
      .toBe('http://127.0.0.1:3000/api/nova/chat');
    expect(buildNativeApiUrl('http://10.0.2.2:3000', '/api/nova/chat'))
      .toBe('http://10.0.2.2:3000/api/nova/chat');
    expect(() => buildNativeApiUrl('http://example.com', '/api/nova/chat')).toThrow();
  });
});
