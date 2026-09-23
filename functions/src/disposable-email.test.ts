import { describe, it, expect } from 'vitest';
import { isDisposableEmailDomain } from './disposable-email';

describe('isDisposableEmailDomain', () => {
  it('flags a known disposable-email domain', () => {
    expect(isDisposableEmailDomain('someone@mailinator.com')).toBe(true);
  });

  it('is case-insensitive on the domain', () => {
    expect(isDisposableEmailDomain('someone@Mailinator.COM')).toBe(true);
  });

  it('does not flag an ordinary email address', () => {
    expect(isDisposableEmailDomain('someone@gmail.com')).toBe(false);
    expect(isDisposableEmailDomain('someone@blazebreak.app')).toBe(false);
  });

  it('does not flag a domain that merely contains a disposable domain as a substring', () => {
    expect(isDisposableEmailDomain('someone@notmailinator.com')).toBe(false);
    expect(isDisposableEmailDomain('someone@mailinator.com.evil.example')).toBe(false);
  });

  it('handles malformed input without throwing', () => {
    expect(isDisposableEmailDomain('not-an-email')).toBe(false);
    expect(isDisposableEmailDomain('')).toBe(false);
  });
});
