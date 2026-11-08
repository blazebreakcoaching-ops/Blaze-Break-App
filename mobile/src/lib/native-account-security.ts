// Detects accounts with two-factor on (server mfaEnabled claim) so the app
// shows the native challenge (MfaChallengeScreen) before any app screen or
// Firestore read. The server and Firestore rules enforce it independently.
export type NativeAccountSecurity = 'clear' | 'mfa_required' | 'unverified';

export function classifyNativeAccountSecurity(
  isAnonymous: boolean, claims: Record<string, unknown>,
): NativeAccountSecurity {
  return !isAnonymous && claims.mfaEnabled === true ? 'mfa_required' : 'clear';
}
