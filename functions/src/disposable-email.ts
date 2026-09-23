// A small, deliberately non-exhaustive blocklist of well-known disposable/
// throwaway email domains, checked at account-creation time. This is NOT
// a full disposable-email-detection API integration (a proper one - e.g.
// checking against a maintained third-party list or service - is real,
// separate infrastructure; see MANUAL_SECURITY_ACTIONS.md, which notes
// it as future work rather than building it here). This just blocks the
// handful of domains most commonly used for signup abuse outright.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'guerrillamail.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
  'trashmail.com',
  'throwawaymail.com',
  'getnada.com',
  'dispostable.com',
  'fakeinbox.com',
  'sharklasers.com',
]);

export const isDisposableEmailDomain = (email: string): boolean => {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
};
