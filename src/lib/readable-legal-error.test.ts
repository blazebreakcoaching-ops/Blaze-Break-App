import { describe, expect, it } from 'vitest';
import { readableLegalDocumentError } from './readable-legal-error';

describe('public legal document errors', () => {
  it.each([
    [0, 'Check your connection'],
    [403, 'verify this request'],
    [429, 'Too many requests'],
  ])('offers a useful, safe next step for HTTP status %i', (status, hint) => {
    const error = Object.assign(new Error('Private service URL: https://internal.example/token'), { status });
    const message = readableLegalDocumentError(error);
    expect(message).toContain(hint);
    expect(message).not.toContain('internal.example');
    expect(message).not.toContain('token');
  });

  it.each([400, 401, 404, 500, 503, 504])('does not echo backend details for status %i', (status) => {
    const error = Object.assign(new Error('API_KEY=secret, database=user-profile'), { status });
    const message = readableLegalDocumentError(error);
    expect(message).toContain('Could not load this document');
    expect(message).not.toContain('API_KEY');
    expect(message).not.toContain('secret');
    expect(message).not.toContain('user-profile');
  });

  it('handles unexpected thrown strings and objects without reflecting their contents', () => {
    for (const error of [null, 'user-specific internal diagnostics', { message: 'a bearer token' }]) {
      const message = readableLegalDocumentError(error);
      expect(message).toContain('Could not load this document');
      expect(message).not.toContain('internal');
      expect(message).not.toContain('token');
    }
  });
});
