// Server-authoritative legal document registry: versioning + default
// content. See docs/legal/ for the full, internal-audience legal-review
// drafts (TERMS_OF_SERVICE.md, PRIVACY_NOTICE.md, etc.) - those are the
// source of truth for legal review and contain open OWNER INPUT
// REQUIRED / LEGAL REVIEW REQUIRED flags that must never be shown to a
// real user. This file holds the condensed, user-safe versions of the
// same documents: no bracket placeholders, no internal engineering
// commentary, honestly dated as a working draft rather than a finished
// legal instrument.
//
// A document's *authoritative* content lives in Firestore
// (legal_documents/{docType}), published only via the admin-only
// POST /api/admin/legal/:docType/publish route (server.ts) - so it can
// be revised without a code deploy once a real legal review lands. The
// constants below are the fallback used until that first publish
// happens, so the product works correctly (a real, dated, honestly-
// framed document, not a blank screen) from the moment this ships.

export type LegalDocumentType =
  | 'TERMS'
  | 'PRIVACY'
  | 'REFUND'
  | 'ACCEPTABLE_USE'
  | 'AI_NOTICE'
  | 'COOKIE_NOTICE';

export interface LegalDocumentVersion {
  docType: LegalDocumentType;
  title: string;
  version: string;
  effectiveDate: string; // ISO date
  // True if a signed-in user must actively accept this version before
  // continuing - Terms and Privacy at signup; a future material Terms
  // revision would also set this. Most day-to-day updates to an
  // informational notice (AI notice, cookie notice) do not.
  requiresAcceptance: boolean;
  // True if this version changes something substantive enough that an
  // existing user who already accepted an earlier version should be
  // asked to re-accept, rather than the change applying silently.
  materialChange: boolean;
  content: string;
}

// The date these default documents actually first went live - not a
// placeholder. Deliberately a fixed string, not `new Date()`, so the
// "effective date" shown to users doesn't silently drift forward on
// every server restart; a real update requires actually publishing a
// new version via POST /api/admin/legal/:docType/publish (or, before
// that route has ever been used for a given document type, editing
// this constant deliberately).
const TODAY = '2026-09-24';

export const DEFAULT_LEGAL_DOCUMENTS: Record<LegalDocumentType, LegalDocumentVersion> = {
  TERMS: {
    docType: 'TERMS',
    title: 'Terms & Conditions',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: true,
    materialChange: false,
    content: `# Blaze Break Terms & Conditions

*This is a working draft, published in good faith while our full legal review is finalised. We'll let you know if anything material changes.*

## What Blaze Break is

Blaze Break is a burnout recovery and sustainable-performance platform built around Nova, our AI coaching assistant. Blaze Break is not a medical device, a diagnostic tool, a substitute for professional care, or an emergency service. See our AI & Wellbeing Notice for more on Nova's role and limits.

## Your account

You're responsible for keeping your account credentials secure. A new visitor is automatically given a temporary session so the app is usable right away; that session's data becomes permanently yours the moment you create a real account with an email/password or a social sign-in.

## Subscriptions

Blaze Break offers Free, Core, Performance, and Executive tiers. Paid access is currently provisioned directly by us rather than through automated checkout while we finish building self-service billing - we'll update this section the moment that changes, including exactly how billing, renewal, and cancellation work.

## Using Blaze Break responsibly

You agree to our Acceptable Use Policy, which covers things like not attempting to bypass access controls, not abusing other users, and not attempting to access anyone else's data.

## Nova and AI

Nova is AI, not a human coach. She can be wrong. Use your own judgement about anything she suggests. See our AI & Wellbeing Notice.

## Your content, our platform

Content you enter (journal entries, check-ins, recovery plans) stays yours. We process it only as needed to provide the service to you, as described in our Privacy Notice. The Blaze Break brand, software, and Nova's design remain ours.

## If your account is through your employer

Your employer can only ever see aggregate, anonymised participation trends - never your individual conversations, journals, or assessments. This is built into how the product works, not just a promise. See our Privacy Notice.

## Ending your account

You can delete your account at any time in Settings. We may suspend an account for a genuine breach of these terms or for fraud/abuse.

## Changes to these terms

We'll update the version and date shown here whenever these terms change, and ask you to re-accept anything material.

## Questions

Contact us through Settings → Legal & Privacy → Contact Blaze Break.`,
  },
  PRIVACY: {
    docType: 'PRIVACY',
    title: 'Privacy Notice',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: true,
    materialChange: false,
    content: `# Blaze Break Privacy Notice

*This is a working draft, published in good faith while our full legal review is finalised.*

## What we collect

Account details (email, sign-in method), your profile and onboarding answers, and the wellbeing content you create while using the product - check-ins, mood pulses, Energy Budget entries, recovery plans, Nova conversations, and similar. We don't collect payment card details, biometric data, or your device's location, and we don't use any third-party advertising or analytics tracker.

## How Nova uses your information

Your messages to Nova are sent to our AI provider (Google Gemini by default) to generate a response, and aren't kept by us as a permanent saved conversation. Voice-journal entries and resentment-tracker entries are different - those are deliberately saved so you can look back on them, since that's the point of those specific tools. With your permission, Nova can remember specific things about you to make future conversations more useful; you can see, edit, or delete every memory she holds, any time, in Settings.

## Who we share information with

Only the service providers genuinely needed to run Blaze Break: our cloud/hosting provider (Google Cloud/Firebase), our AI provider(s) (Google Gemini, and in some configurations Anthropic or Google Vertex AI), our email provider (Brevo) for account-related emails, and our SMS provider (Twilio) - only ever for messages you yourself choose to send through the Guardian safety feature. If your account is sponsored by an employer, they see only aggregate, anonymised trend figures - never your individual content.

## Your rights

You can download a copy of your data or delete your account at any time in Settings. You can also ask us to correct inaccurate information, and where we rely on your consent (like Nova's memory feature), withdraw it at any time with no penalty. If you believe we've mishandled your data, you can complain to the ICO, the UK's data protection regulator.

## How long we keep things

We currently keep your data until you delete your account. We're working through a more precise retention schedule for different categories of data and will update this notice once that's finalised.

## Changes to this notice

We'll update the version and date shown here whenever this notice changes.

## Questions

Contact us through Settings → Legal & Privacy → Contact Blaze Break.`,
  },
  REFUND: {
    docType: 'REFUND',
    title: 'Cancellation & Refund Policy',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: false,
    materialChange: false,
    content: `# Cancellation & Refund Policy

*Working draft - self-service billing isn't live yet, so this describes how things will work once it is.*

You'll be able to cancel a subscription at any time from your account settings; cancelling stops future renewal, and you keep access until the end of the period you've already paid for. If you subscribe through the Apple App Store or Google Play once mobile billing is available, cancellations and refunds for those purchases go through Apple or Google directly - we can't issue those refunds ourselves. We'll never show "refund issued" for a request that's only been submitted, not actually completed.`,
  },
  ACCEPTABLE_USE: {
    docType: 'ACCEPTABLE_USE',
    title: 'Acceptable Use Policy',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: false,
    materialChange: false,
    content: `# Acceptable Use Policy

By using Blaze Break, you agree not to: break the law; harass or abuse anyone, including a contact reached through the Guardian safety feature; attack or attempt unauthorised access to our systems; bypass subscription limits or rate limits; scrape or automate access to the service; share your account; misuse messaging features to send unwanted or excessive messages; upload malicious content; attempt to access another user's data; interfere with the product's safety mechanisms; or commit fraud, including payment manipulation once live billing exists.`,
  },
  AI_NOTICE: {
    docType: 'AI_NOTICE',
    title: 'AI & Wellbeing Notice',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: false,
    materialChange: false,
    content: `# Nova and AI at Blaze Break

Nova is an AI coach, not a person, a therapist, or a doctor. She can get things wrong or give advice that doesn't fit your situation - trust your own judgement. Nova is here for burnout recovery and sustainable performance support, not a substitute for professional medical or psychological care, and she doesn't diagnose anything.

If you're in crisis or at immediate risk, please contact emergency services (999 in the UK) or a crisis line such as Samaritans (116 123).

Nova never contacts anyone on your behalf automatically - if you've set up a trusted Guardian contact, an alert only ever goes out when you take a clear, explicit action to send it yourself. If your account is through your employer, Nova's conversations with you are never visible to them.

See our Privacy Notice for the full technical detail on how your information reaches Nova.`,
  },
  COOKIE_NOTICE: {
    docType: 'COOKIE_NOTICE',
    title: 'Cookie & Tracking Notice',
    version: '0.1',
    effectiveDate: TODAY,
    requiresAcceptance: false,
    materialChange: false,
    content: `# Cookie & Tracking Notice

Blaze Break doesn't use any third-party advertising or analytics tracker, and doesn't set cookies for tracking purposes. We use a small amount of local browser storage for genuinely functional things - keeping you signed in and remembering your own dashboard layout preferences - never to build an advertising profile or track you across other sites. If that ever changes, we'll update this notice and add a proper consent choice before any new tracking technology runs, not after.`,
  },
};
