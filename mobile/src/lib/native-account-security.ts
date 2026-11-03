// Native app does not yet implement TOTP or recovery-code challenge.
// Firebase ID tokens can still be issued for email/password users who
// have MFA enabled on the website. Detect the server's existing claim
// and prevent native UI + Firestore reads until verification is available.
// IMPORTANT: this client UX gate is not a Firestore security boundary.
export type NativeAccountSecurity = 'clear' | 'mfa_required' | 'unverified';

export function classifyNativeAccountSecurity(
  isAnonymous: boolean, claims: Record<string, unknown>,
): NativeAccountSecurity {
  return !isAnonymous && claims.mfaEnabled === true ? 'mfa_required' : 'clear';
}
