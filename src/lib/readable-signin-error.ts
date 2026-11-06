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
};

export function readableSignInError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  return AUTH_ERROR_MESSAGES[code] ??
    'We could not complete sign-in. Please try again or contact support if it continues.';
}
