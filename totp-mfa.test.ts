import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { generate as generateOtp } from 'otplib';
import {
  generateTotpSecret,
  buildOtpauthUri,
  verifyTotpCode,
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  encryptSecret,
  decryptSecret,
  isTotpLockedOut,
  nextLockoutState,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_LOCKOUT_DURATION_MS,
} from './totp-mfa';

describe('generateTotpSecret / buildOtpauthUri', () => {
  it('produces a non-empty base32 secret', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('produces distinct secrets on repeated calls - never reuse a secret across enrollments', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });

  it('embeds the issuer and account email in the otpauth URI, so any authenticator app labels it correctly', () => {
    const uri = buildOtpauthUri('JBSWY3DPEHPK3PXP', 'person@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('Blaze%20Break');
    expect(uri).toContain('person%40example.com');
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
  });
});

describe('verifyTotpCode: the entire sign-in gate for anyone with 2FA enabled - must be exact', () => {
  it('accepts the correct current code for a secret', async () => {
    const secret = generateTotpSecret();
    const code = await generateOtp({ secret });
    expect(await verifyTotpCode(secret, code)).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const secret = generateTotpSecret();
    const code = await generateOtp({ secret });
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await verifyTotpCode(secret, wrong)).toBe(false);
  });

  it('rejects a code generated against a different secret', async () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const codeForB = await generateOtp({ secret: secretB });
    expect(await verifyTotpCode(secretA, codeForB)).toBe(false);
  });

  it('rejects malformed input (wrong length, non-digits) without throwing', async () => {
    const secret = generateTotpSecret();
    expect(await verifyTotpCode(secret, '12345')).toBe(false);
    expect(await verifyTotpCode(secret, '1234567')).toBe(false);
    expect(await verifyTotpCode(secret, 'abcdef')).toBe(false);
    expect(await verifyTotpCode(secret, '')).toBe(false);
  });

  it('rejects a well-formed code against a garbage secret without throwing', async () => {
    expect(await verifyTotpCode('not-a-real-secret', '123456')).toBe(false);
  });
});

describe('recovery codes', () => {
  it('generates the requested count, each in XXXX-XXXX shape from the unambiguous charset', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it('never generates a duplicate within one batch (astronomically unlikely, but the shape must allow uniqueness)', () => {
    const codes = generateRecoveryCodes(8);
    expect(new Set(codes).size).toBe(8);
  });

  it('normalizes case, whitespace, and the dash before hashing, so a code matches regardless of how it was retyped', () => {
    const raw = 'AB3D-9WXZ';
    expect(normalizeRecoveryCode(raw)).toBe('AB3D9WXZ');
    expect(normalizeRecoveryCode(' ab3d-9wxz ')).toBe('AB3D9WXZ');
    expect(hashRecoveryCode(raw)).toBe(hashRecoveryCode(' ab3d-9wxz '));
  });

  it('hashes different codes to different values', () => {
    expect(hashRecoveryCode('AAAA-1111')).not.toBe(hashRecoveryCode('BBBB-2222'));
  });
});

describe('encryptSecret / decryptSecret: AES-256-GCM round trip for the stored TOTP secret', () => {
  const key = crypto.randomBytes(32);

  it('decrypts back to the original plaintext', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, key);
    expect(decryptSecret(encrypted, key)).toBe(secret);
  });

  it('produces different ciphertext for the same plaintext each time (random IV) - never reveals equality by inspection', () => {
    const secret = generateTotpSecret();
    expect(encryptSecret(secret, key)).not.toBe(encryptSecret(secret, key));
  });

  it('fails to decrypt with the wrong key - the whole point of authenticated encryption', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, key);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decryptSecret(encrypted, wrongKey)).toThrow();
  });

  it('fails to decrypt tampered ciphertext rather than silently returning garbage', () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret, key);
    const tampered = Buffer.from(encrypted, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptSecret(tampered.toString('base64'), key)).toThrow();
  });

  it('rejects a key that is not exactly 32 bytes, for either operation', () => {
    const shortKey = crypto.randomBytes(16);
    expect(() => encryptSecret('x', shortKey)).toThrow();
    expect(() => decryptSecret('irrelevant', shortKey)).toThrow();
  });
});

describe('isTotpLockedOut / nextLockoutState: the durable brute-force backstop on the verify-at-signin endpoint', () => {
  it('is not locked out with no prior lockout timestamp', () => {
    expect(isTotpLockedOut(null)).toBe(false);
  });

  it('is locked out while the stored lockedUntil is still in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isTotpLockedOut(future)).toBe(true);
  });

  it('is not locked out once lockedUntil has passed', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isTotpLockedOut(past)).toBe(false);
  });

  it('resets failedAttempts to 0 and clears lockedUntil on a success, regardless of prior failures', () => {
    expect(nextLockoutState(4, true)).toEqual({ failedAttempts: 0, lockedUntil: null });
  });

  it('increments failedAttempts on a failure without locking out before the threshold', () => {
    const state = nextLockoutState(1, false);
    expect(state.failedAttempts).toBe(2);
    expect(state.lockedUntil).toBeNull();
  });

  it(`locks out for ${MFA_LOCKOUT_DURATION_MS / 60000} minutes once failedAttempts reaches ${MFA_MAX_FAILED_ATTEMPTS}`, () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const state = nextLockoutState(MFA_MAX_FAILED_ATTEMPTS - 1, false, now);
    expect(state.failedAttempts).toBe(MFA_MAX_FAILED_ATTEMPTS);
    expect(state.lockedUntil).toBe(new Date(now.getTime() + MFA_LOCKOUT_DURATION_MS).toISOString());
  });

  it('keeps extending failedAttempts past the threshold if failures continue', () => {
    const state = nextLockoutState(MFA_MAX_FAILED_ATTEMPTS, false);
    expect(state.failedAttempts).toBe(MFA_MAX_FAILED_ATTEMPTS + 1);
    expect(state.lockedUntil).not.toBeNull();
  });
});
