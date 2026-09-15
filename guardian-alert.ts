// Pure logic for Guardian Support Tier 1 (docs/GUARDIAN_SUPPORT_SPEC.md),
// kept free of Firestore/Twilio I/O so it's genuinely unit-testable without
// a live backend - same reasoning as nova-tools.ts and org-risk-trend.ts.
//
// Every function here is deterministic and makes no judgement about a
// user's state. Per the non-negotiable safety constraint governing this
// feature: no risk scoring, no inference, no classification of anyone's
// mental state, in any form - numeric, categorical, implicit, or proxy.
// This module exists to answer "is this contact actually a guardian" and
// "what does the message say", never "is this person in danger."

export interface GuardianCandidate {
  id?: string;
  name?: string;
  isGuardian?: boolean;
  role?: string;
  contactMethod?: string;
}

// Roles the product's own UI (NovaGuardianRelay.tsx) treats as permanently
// disabled for Guardian alerts - "organizational managers and peers are
// strictly prohibited from receiving Guardian crisis intercepts" per its
// own copy. That was previously enforced only by disabling the &lt;option&gt;
// in a &lt;select&gt; - a client crafting (or a bug constructing) a contact
// record with role: 'manager' AND isGuardian: true could still pass the
// old isRealGuardian check, since isGuardian === true was checked with OR,
// independently of role. Checked here explicitly so the real enforcement
// point (server-side, immediately before every send) can't be bypassed by
// any client-side data shape, regardless of how it was constructed.
const DISALLOWED_GUARDIAN_ROLES = ['manager', 'peer'];

// A contact counts as a real guardian only if explicitly marked as one -
// either the isGuardian flag or one of the two guardian roles - AND its
// role isn't one this product has decided may never receive a Guardian
// alert. This is the entire "consent" gate for Tier 1: the user already
// authorised this person by adding them to their own guardian list. There
// is no separate inference step and none should ever be added here.
export const isRealGuardian = (contact: GuardianCandidate | undefined | null): boolean => {
  if (!contact) return false;
  if (contact.role && DISALLOWED_GUARDIAN_ROLES.includes(contact.role)) return false;
  return contact.isGuardian === true || contact.role === 'primary_guardian' || contact.role === 'backup_guardian';
};

// Same E.164-ish pattern already used server-side and in NovaGuardianRelay.tsx
// for outbound Twilio sends - kept in sync deliberately, not reinvented here.
export const isValidGuardianPhone = (phone: string | undefined | null): boolean =>
  typeof phone === 'string' && /^\+[1-9]\d{6,14}$/.test(phone);

// The exact Tier 1 message template from docs/GUARDIAN_SUPPORT_SPEC.md §B.1 -
// deliberately not personalised beyond the sender's first name, since the
// spec requires the message to always state (a) who is asking, (b) that
// it's a call request, and (c) that it came from Blaze Break, and none of
// that should be editable away.
export const buildGuardianCallRequestMessage = (senderFirstName: string): string => {
  const name = senderFirstName?.trim() || 'A Blaze Break user';
  return `${name} has asked you to call them as soon as you can. This is a support request sent from their Blaze Break app. Please try to contact them directly.`;
};

// Extracts a real first name from a full name, falling back honestly
// rather than guessing - an empty or whitespace-only name produces the
// same generic fallback buildGuardianCallRequestMessage already uses.
export const extractFirstName = (fullName: string | undefined | null): string => {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return 'A Blaze Break user';
  return trimmed.split(/\s+/)[0];
};

// The scheduled/recurring "nudge" messaging system (a user arranges in
// advance for automatic, unattended SMS/WhatsApp messages to a chosen
// contact on a schedule, processed by a cron job with no per-send user
// action) is exactly docs/GUARDIAN_SUPPORT_SPEC.md's own "Tier 3"
// capability shape - a planned communication arrangement configured ahead
// of time. The spec declares Tier 3 "[REVIEW - research only, do not
// build]" and "permanently out of scope... not deferred pending approval.
// It is excluded" until ten named governance workstreams (clinical,
// safeguarding, legal) and a documented, tested kill-switch exist. None of
// that review has happened. This flag is that kill-switch: it defaults to
// OFF (unlike toolsAreEnabled's default-on/opt-out pattern in
// nova-tools.ts) precisely because Tier 3 has no standing approval to be
// on by default - an operator must explicitly opt in by setting
// NUDGE_SCHEDULER_ENABLED=true, which should not happen until that review
// exists. Gates both creating new schedules and the cron job actually
// sending anything, so the feature is fully inert (not just quietly
// failing to send) while disabled.
export const nudgeSchedulerIsEnabled = (envValue: string | undefined): boolean => envValue === 'true';

export interface CooldownCheck {
  onCooldown: boolean;
  msRemaining: number;
}

// Pure cooldown arithmetic - the actual "has this been sent recently"
// Firestore query lives in server.ts; this just answers, given a known
// last-sent time and the current time, whether the cooldown window has
// elapsed. now is a parameter (not Date.now() called internally) so this
// is deterministic and testable without faking the clock.
export const checkCooldown = (lastSentAt: number | null, now: number, cooldownMs: number): CooldownCheck => {
  if (lastSentAt === null) return { onCooldown: false, msRemaining: 0 };
  const elapsed = now - lastSentAt;
  if (elapsed >= cooldownMs) return { onCooldown: false, msRemaining: 0 };
  return { onCooldown: true, msRemaining: cooldownMs - elapsed };
};
