import { describe, it, expect } from 'vitest';
import {
  checkPasswordStrength,
  generateStrongPassword,
  PASSWORD_MIN_LENGTH,
} from './password-strength';

describe('checkPasswordStrength', () => {
  it('rejects passwords shorter than the minimum length', () => {
    const result = checkPasswordStrength('Ab1!Ab1!');
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes(`${PASSWORD_MIN_LENGTH} characters`))).toBe(true);
  });

  it('rejects a long password with only one character category', () => {
    const result = checkPasswordStrength('aaaaaaaaaaaaaaaa');
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('2 of'))).toBe(true);
  });

  it('accepts a long password with two categories (lower + digit)', () => {
    const result = checkPasswordStrength('abcdefgh1234');
    expect(result.valid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('accepts a long password with all four categories', () => {
    const result = checkPasswordStrength('Abcdefg1!2345');
    expect(result.valid).toBe(true);
  });

  it('fails on length alone even with two categories present', () => {
    // 9 characters, two categories (lower + digit) - one char short of
    // the length minimum, so it must still fail.
    expect(checkPasswordStrength('a'.repeat(PASSWORD_MIN_LENGTH - 2) + '1').valid).toBe(false);
  });

  it('fails on category count alone even at the exact minimum length', () => {
    // Exactly PASSWORD_MIN_LENGTH characters, only one category (lowercase).
    expect(checkPasswordStrength('a'.repeat(PASSWORD_MIN_LENGTH)).valid).toBe(false);
  });
});

describe('generateStrongPassword', () => {
  it('always passes the strength check it is meant to satisfy', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateStrongPassword();
      expect(checkPasswordStrength(pw).valid).toBe(true);
    }
  });

  it('contains at least one character from every category, not just enough to scrape by', () => {
    const pw = generateStrongPassword();
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^A-Za-z0-9]/);
  });

  it('produces different passwords on repeated calls (uses real randomness, not a fixed template)', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateStrongPassword()));
    expect(passwords.size).toBe(20);
  });

  it('respects a custom length while still meeting the minimum requirement', () => {
    const pw = generateStrongPassword(24);
    expect(pw.length).toBe(24);
    expect(checkPasswordStrength(pw).valid).toBe(true);
  });

  it('uses the Web Crypto API rather than Math.random', () => {
    const spy = { called: false };
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    // @ts-expect-error - test-only monkeypatch to observe the call
    crypto.getRandomValues = (arr: Uint32Array) => {
      spy.called = true;
      return originalGetRandomValues(arr);
    };
    try {
      generateStrongPassword();
      expect(spy.called).toBe(true);
    } finally {
      crypto.getRandomValues = originalGetRandomValues;
    }
  });
});
