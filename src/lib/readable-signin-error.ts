// User-facing messages for staging and production authentication failures.
// Keep raw Firebase error details out of the UI, logs and support reports.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/unauthorized-domain': 'This preview address is not authorised for sign-in. Ask the Blaze Break team to enable this staging address.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in this environment.',
  'auth/admin-restricted-operation': 'Creating accounts is currently disabled for this environment.',
  'auth/invalid-api-key': 'Sign-in is not configured correctly for this environment.',
  'auth/app-not-authorized': 'This app address is not authorised to use sign-in.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled. You can try again whenever you are ready.',
  'auth/cancelled-popup-request': 'Another sign-in window interrupted this attempt. Please try again.',
  'auth/account-exists-with-different-credential': 'This email already uses another sign-in method. Try the method you used originally.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/credential-already-in-use': 'This sign-in is already connected to another account.',
  'auth/invalid-credential': 'We could not sign you in with those details. If you use a staging test account, check its email and password.',
  'auth/wrong-password': 'We could not sign you in with those details. Please check and try again.',
  'auth/user-not-found': 'We could not sign you in with those details. Please check and try again.',
  'auth/invalid-email': 'Please check the email address and try again.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'The sign-in service could not be reached. Check your connection and try again.',
  'auth/configuration-not-found': 'This sign-in provider has not been configured for this Firebase environment.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/operation-not-supported-in-this-environment': 'This environment does not support this sign-in method. Try email sign-in.',
  'auth/unauthorized-continue-uri': 'The preview address is not authorised for this sign-in flow.',
};

export function readableSignInError(error: unknown): string {
  const supplied = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : '';
  // Only the following exact app-authored message is permitted verbatim.
  if (message === 'An account with this email already exists. Try signing in instead.') return message;
  const suppliedCode = typeof supplied === 'string' && /^auth\/[a-z][a-z0-9-]{1,63}$/.test(supplied) ? supplied : '';
  const code = suppliedCode || (message.match(/\bauth\/[a-z][a-z0-9-]{1,63}\b/)?.[0] ?? '');
  if (Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)) return AUTH_ERROR_MESSAGES[code];
  if (code) return 'We could not complete sign-in (reference: ' + code + '). Please contact support with this reference only.';
  return 'We could not complete sign-in. Please try again or contact support if it continues.';
}


// Password recovery uses our Brevo-backed API, not Firebase's public
// sign-in errors. Its network/server exceptions may contain internal
// provider details, which should never appear in a visitor's UI.
// Surface a small set of actionable messages by HTTP status only.
export function readablePasswordResetError(error: unknown): string {
  const status = error && typeof error === 'object' && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 429) {
    return 'Too many password reset attempts. Please try again later.';
  }
  if (status === 0) {
    return 'Could not reach the password reset service. Check your connection and try again.';
  }
  return 'Password recovery is unavailable right now. Please try again later or contact support.';
}
