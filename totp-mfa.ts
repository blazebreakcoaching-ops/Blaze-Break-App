import crypto from 'crypto';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';

// Pure logic for opt-in TOTP two-factor authentication - kept free of
// Firestore/env I/O so it's genuinely unit-testable, same reasoning as
// guardian-alert.ts and sso-config.ts. server.ts owns reading/writing
// users/{uid}/security/mfa_totp, reading MFA_ENCRYPTION_KEY, and the
// Firestore-backed lockout wrapper around isTotpLockedOut/nextLockoutState
// below (kept here as pure functions so the lockout decision itself is
// testable without a fake Firestore).
//
// This is a fully custom, app-level second factor - not Firebase's native
// Multi-Factor Auth API, which requires a paid Identity Platform upgrade
// this project doesn't have (see docs/SSO_INTEGRATION_PLAN.md, which hits
// the identical tier wall for an unrelated feature). Verification happens
// entirely server-side against a secret this backend generates and stores
// encrypted - the client never sees the plaintext secret after enrollment
// completes.

const ISSUER = 'Blaze Break';

export const generateTotpSecret = (): string => generateSecret();

export const buildOtpauthUri = (secret: string, accountEmail: string): string =>
  generateURI({ secret, issuer: ISSUER, label: accountEmail });

// otplib's default epochTolerance is 0 (current 30s step only) - a small
// tolerance absorbs normal clock drift between the phone and this server
// without meaningfully weakening the code's effective lifetime.
const CLOCK_DRIFT_TOLERANCE_SECONDS = 30;

export const verifyTotpCode = async (secret: string, code: string): Promise<boolean> => {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const result = await verifyOtp({ secret, token: code, epochTolerance: CLOCK_DRIFT_TOLERANCE_SECONDS });
    return result.valid;
  } catch {
    // A malformed secret or plugin error is never a valid code.
    return false;
  }
};

// Recovery codes use a charset with no visually ambiguous characters
// (no 0/O, no 1/I) - 32 symbols, a clean power of two, so mapping a random
// byte to a symbol via modulo introduces no bias.
const RECOVERY_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCodeSegment = (length: number): string => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += RECOVERY_CODE_CHARSET[bytes[i] % RECOVERY_CODE_CHARSET.length];
  }
  return out;
};

export const generateRecoveryCodes = (count = 8): string[] =>
  Array.from({ length: count }, () => `${randomCodeSegment(4)}-${randomCodeSegment(4)}`);

// A submitted recovery code needs to match regardless of how the person
// typed it back (case, stray whitespace, the dash) - normalized before
// hashing so lookups stay a simple hash comparison.
export const normalizeRecoveryCode = (code: string): string =>
  code.trim().toUpperCase().replace(/[\s-]/g, '');

export const hashRecoveryCode = (code: string): string =>
  crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

// AES-256-GCM, IV + auth tag packed ahead of the ciphertext into one
// base64 string - same primitive/shape as sso-config.ts's existing secret
// encryption, this codebase's one other precedent for encrypting a secret
// at rest. The key is always passed in (never read from env here) so this
// stays pure and testable; server.ts's getMfaEncryptionKey() is the only
// place MFA_ENCRYPTION_KEY is read.
const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export const encryptSecret = (plaintext: string, key: Buffer): string => {
  if (key.length !== 32) throw new Error('encryptSecret: key must be exactly 32 bytes (AES-256).');
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
};

export const decryptSecret = (ciphertext: string, key: Buffer): string => {
  if (key.length !== 32) throw new Error('decryptSecret: key must be exactly 32 bytes (AES-256).');
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH_BYTES);
  const authTag = data.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const encrypted = data.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

// Lockout policy for the sign-in-time verify endpoint: five wrong
// codes/recovery codes in a row locks further attempts out for 15 minutes.
// Durable in Firestore (via server.ts's thin wrapper around these two pure
// functions), not express-rate-limit's in-memory store, since that store
// doesn't survive Cloud Run scaling an instance to zero or running more
// than one instance at once.
export const MFA_MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const isTotpLockedOut = (lockedUntil: string | null, now: Date = new Date()): boolean => {
  if (!lockedUntil) return false;
  const until = new Date(lockedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
};

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: string | null;
}

export const nextLockoutState = (
  failedAttempts: number,
  success: boolean,
  now: Date = new Date()
): LockoutState => {
  if (success) return { failedAttempts: 0, lockedUntil: null };
  const attempts = failedAttempts + 1;
  if (attempts >= MFA_MAX_FAILED_ATTEMPTS) {
    return { failedAttempts: attempts, lockedUntil: new Date(now.getTime() + MFA_LOCKOUT_DURATION_MS).toISOString() };
  }
  return { failedAttempts: attempts, lockedUntil: null };
};
