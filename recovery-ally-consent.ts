// Pure logic for Recovery Ally's mandatory consent step (Master Support
// Circle spec): an invite must never become a live, data-sharing
// relationship just because the recipient opened the link - they have to
// actively accept it first. This file only answers "what state is this
// relationship really in" and "is this invite link still within its
// window" - never decides anything on its own, and never infers consent
// from an action (a page view, a delay) that isn't an explicit choice.

export type ConsentStatus = 'pending' | 'accepted' | 'declined';

const INVITE_WINDOW_DAYS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// A relationship invited before this consent step existed has no
// consentStatus field at all. Treating that as 'accepted' (never as
// 'pending') is a deliberate, one-way grandfather: those allies had
// already been actively using their link, and silently cutting off data
// they could already see - rather than adding a mandatory step going
// forward only - would be the regression, not the fix.
export const effectiveConsentStatus = (raw: string | undefined | null): ConsentStatus =>
  raw === 'pending' || raw === 'declined' ? raw : 'accepted';

// The consent endpoint only ever accepts a decision while the invite is
// still genuinely undecided. Once accepted or declined, that is final
// for this invite - a later "decline" is not how an already-active ally
// leaves (that is Remove Ally/Leave Support Circle, a different, bigger
// action), and a later "accept" on an already-declined invite would be
// contacting someone who already said no.
export const canRespondToConsent = (status: string | undefined | null): boolean =>
  effectiveConsentStatus(status) === 'pending';

export const computeInviteExpiresAt = (now: string): string =>
  new Date(new Date(now).getTime() + INVITE_WINDOW_DAYS * ONE_DAY_MS).toISOString();

// Expiry only ever matters while the invite is still pending - an
// accepted or declined invite is a decided relationship, not a link
// waiting to be clicked, so it has nothing to expire.
export const isInviteExpired = (
  inviteExpiresAt: string | null | undefined,
  consentStatus: string | undefined | null,
  now: string
): boolean => {
  if (effectiveConsentStatus(consentStatus) !== 'pending') return false;
  if (!inviteExpiresAt) return false;
  return new Date(inviteExpiresAt).getTime() <= new Date(now).getTime();
};
