# Blaze Break — Cookie & Tracking Notice (DRAFT)

**Status: DRAFT — LEGAL REVIEW REQUIRED before publication** (for
PECR-compliance sign-off; the technical facts below are verified against
the actual codebase, not assumed).

*Version: 0.1 (draft) · Not yet published · UK English*

## The audit this is based on

Before drafting this notice, the codebase was checked directly for
cookie and tracking technology usage:

- **No `document.cookie` usage anywhere in the application code.** Blaze
  Break's web app does not set cookies directly.
- **No third-party analytics or advertising tracker of any kind is
  integrated** — confirmed in `docs/VENDOR_REGISTER.md` (no Google
  Analytics, Mixpanel, Segment, Sentry, advertising pixel, or similar).
- Firebase Authentication's web SDK (which this app uses) persists your
  signed-in session using browser **IndexedDB**, not a cookie.
- The app uses **`localStorage`** for a small number of genuinely
  functional, strictly-necessary purposes: your Home dashboard widget
  layout preferences, cached onboarding/fingerprint data (as a fallback
  before the server-stored copy loads), and similar per-device
  convenience settings. None of this is used for advertising, cross-site
  tracking, or building a profile of you beyond your own account.

## What this means

Because Blaze Break sets **no non-essential cookies or equivalent
tracking technology**, no cookie-consent banner ("Accept" / "Reject" /
"Manage Preferences") currently exists in the product — there is nothing
non-essential to ask permission for. Under UK PECR (the Privacy and
Electronic Communications Regulations), storage/access technology that
is "strictly necessary" for a service the user has explicitly requested
(such as keeping you signed in, or remembering your own dashboard
layout) does not require prior consent.

**LEGAL REVIEW REQUIRED**: confirm this "strictly necessary" analysis
holds for each specific `localStorage` use listed above, and confirm
whether IndexedDB-based auth persistence needs any notice-level mention
distinct from a cookie policy proper.

## If this changes

The moment any non-essential tracking technology (analytics, an
advertising pixel, a third-party embed that sets its own cookies) is
added to the product, this notice must be rewritten to reflect it, and a
real consent mechanism must be built and enforced **before** that
technology is allowed to run — never a banner that says "Reject" while
the tracker loads anyway. See `COOKIE_CONSENT` implementation guidance
in the product-implementation passes of this legal-pack effort.

## Native app note

If/when Blaze Break ships as a native iOS or Android app (neither exists
in this repository today — see `docs/MOBILE_SUBSCRIPTIONS.md`), web
cookie controls are not relevant there; any equivalent mobile tracking
technology would need its own, separate disclosure and platform-specific
consent mechanism (e.g. Apple's App Tracking Transparency), not a reuse
of this web notice.

---

*This document is a first-pass draft. It is not legal advice. See
`LEGAL_REVIEW_REQUIRED.md`.*
