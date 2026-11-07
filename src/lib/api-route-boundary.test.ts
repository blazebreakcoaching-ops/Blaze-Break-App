import { describe, expect, it } from 'vitest';
import { assertWebApiRoute, assertPublicLegalRoute, assertPublicPasswordRoute } from './api-route-boundary';

const origin = 'https://www.blazebreak.app';
describe('shared legacy web API token destination boundary', () => {
  it.each(['/api/nova/chat', '/api/user/export', '/api/auth/mfa/status', '/api/user/recommendation?week=1'])('allows internal API paths %s', path => {
    expect(assertWebApiRoute(path, origin)).toBe(path);
  });
  it.each(['https://example.com/api/steal', 'http://localhost:8080/api/steal',
    '//example.com/api/steal', '/health', 'api/nova/chat',
    '/api/../admin', '/api/../../secret', '/api/\\evil', '/api/chat\nInjected: header'])('rejects unsafe or foreign paths: %s', path => {
    expect(() => assertWebApiRoute(path, origin)).toThrow();
  });
  it('limits signed-out password recovery to the two approved POST destinations', () => {
    expect(assertPublicPasswordRoute('/api/auth/password-reset/request', origin)).toBe('/api/auth/password-reset/request');
    expect(assertPublicPasswordRoute('/api/auth/password-reset/confirm-notify', origin)).toBe('/api/auth/password-reset/confirm-notify');
    for (const path of ['/api/auth/mfa/status', '/api/user/delete-account',
      '//outside.example/api/auth/password-reset/request',
      'https://outside.example/api/auth/password-reset/request']) {
      expect(() => assertPublicPasswordRoute(path, origin)).toThrow();
    }
  });

  it('limits unauthenticated reads to the legal API', () => {
    expect(assertPublicLegalRoute('/api/legal/documents', origin)).toBe('/api/legal/documents');
    expect(assertPublicLegalRoute('/api/legal/documents/privacy', origin)).toBe('/api/legal/documents/privacy');
    // The actual frontend uses these uppercase/underscore enum IDs.
    for (const id of ['TERMS', 'PRIVACY', 'COOKIE_NOTICE', 'ACCEPTABLE_USE', 'AI_NOTICE']) {
      expect(assertPublicLegalRoute('/api/legal/documents/' + id, origin)).toBe('/api/legal/documents/' + id);
    }
    expect(() => assertPublicLegalRoute('/api/user/export', origin)).toThrow();
  });
});
