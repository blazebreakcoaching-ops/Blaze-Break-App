// Pure helpers for the native two-factor challenge. Mirrors the server's
// MfaCodeOrRecoverySchema: EITHER a 6-digit authenticator code OR an 8-20
// character recovery code, never both.
export type MfaMode = 'code' | 'recovery';

export type MfaSubmission =
  | { ok: true; body: { code: string } | { recoveryCode: string } }
  | { ok: false; message: string };

export function buildMfaSubmission(mode: MfaMode, raw: string): MfaSubmission {
  if (mode === 'code') {
    const code = raw.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) return { ok: false, message: 'Enter the 6-digit code from your authenticator app.' };
    return { ok: true, body: { code } };
  }
  const recoveryCode = raw.trim();
  if (recoveryCode.length < 8 || recoveryCode.length > 20) {
    return { ok: false, message: 'Enter one of your recovery codes exactly as it was given to you.' };
  }
  return { ok: true, body: { recoveryCode } };
}

// Maps a failed verification to what the person should know and do. The
// server deliberately does not say whether the code was wrong or 2FA is
// missing, so neither does this.
export function describeMfaFailure(status: number): string {
  if (status === 401) return "That code didn't match. Check your authenticator app and try again.";
  if (status === 429) return 'Too many incorrect attempts. Please wait a few minutes before trying again.';
  if (status === 503) return "Your code was correct, but we couldn't finish securing this session. Please try again in a moment.";
  if (status === 0) return "You appear to be offline. Connect and try again; you haven't been signed in yet.";
  return "We couldn't check your code right now. Please try again.";
}

export interface MfaVerifyResponse { verified?: unknown; mfaSessionToken?: unknown }

// A response only counts when the server says verified AND issued a token.
export function extractMfaSessionToken(body: MfaVerifyResponse | null | undefined): string | null {
  return body && body.verified === true && typeof body.mfaSessionToken === 'string' && body.mfaSessionToken.length > 0
    ? body.mfaSessionToken : null;
}
