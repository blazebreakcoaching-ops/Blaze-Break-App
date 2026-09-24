# Blaze Break — Terms of Service (DRAFT)

**Status: DRAFT — LEGAL REVIEW REQUIRED before publication.** This
document describes the Blaze Break product as it is actually built
today, verified against the codebase (`docs/legal/DATA_INVENTORY.md`,
`docs/FREE_PREMIUM_ENTITLEMENTS.md`). It is not a substitute for review
by a qualified UK solicitor, and several fields below are placeholders
the business owner must supply — see `OWNER_LEGAL_INPUTS.md`.

*Version: 0.1 (draft) · Not yet published · UK English*

## 1. Who we are

Blaze Break ("**we**", "**us**", "**Blaze Break**") provides a burnout
recovery and sustainable-performance platform, including a web
application, Nova (our AI-powered coaching assistant), and related
tools.

- Legal entity name: **[OWNER INPUT REQUIRED]**
- Trading name: **Blaze Break**
- Registered office / business address: **[OWNER INPUT REQUIRED]**
- Companies House number: **[OWNER INPUT REQUIRED]**
- Contact: **[OWNER INPUT REQUIRED — support email]**

## 2. What Blaze Break is — and is not

Blaze Break is a private wellbeing, burnout-recovery, and
sustainable-performance coaching platform built around Nova, an AI
conversational coach.

Blaze Break is **not**:
- a medical device or diagnostic tool;
- a substitute for professional medical, psychiatric, or psychological
  care;
- a crisis or emergency service;
- a covert employee-monitoring product (see §14, "For organisation
  users").

See `AI_AND_WELLBEING_NOTICE.md` for more detail on Nova's role and
limits.

## 3. Eligibility and account creation

- You must be at least **[OWNER INPUT REQUIRED — minimum age]** years
  old to create an account.
- Accounts can be created via email and password, or by signing in with
  Google, Microsoft, or Facebook. A brand-new visitor is automatically
  given a temporary, anonymous session so the app is usable before you
  create a permanent account; this anonymous session's data is
  associated with your account the moment you sign up with a real
  method, but is not recoverable if you never do so and later delete or
  lose access to that browser session.
- You are responsible for keeping your account credentials secure,
  including any two-factor authentication recovery codes you are shown.

## 4. Subscription tiers

Blaze Break currently offers, per `docs/FREE_PREMIUM_ENTITLEMENTS.md`:

| Tier | Monthly | Annual |
|---|---|---|
| Free | £0 | — |
| Core | £34.99 | £349 |
| Performance | £49.99 | £499 |
| Executive | £69.99 | £699 |

A **Legacy Premium** tier exists for customers who held an earlier
Premium subscription before this pricing structure launched — see
`docs/LEGACY_CUSTOMER_MIGRATION.md`.

**Honest statement of current implementation:** as of this document's
drafting, Blaze Break has no live, self-service payment processor
integrated (no Stripe, Apple In-App Purchase, or Google Play Billing is
wired up — see `STRIPE_PRODUCTS.md` / `MOBILE_SUBSCRIPTIONS.md` in the
engineering docs). Paid-tier access is provisioned directly by Blaze
Break today, not purchased through an automated checkout. This section
will be revised, and the billing/renewal/cancellation mechanics below
finalised, once a live payment integration exists — see
`CANCELLATION_AND_REFUND_POLICY.md`.

## 5. Billing, renewal, and cancellation (once live billing exists)

Once self-service billing is live via a given provider (Stripe on the
web, Apple on iOS, Google Play on Android):
- Subscriptions renew automatically at the end of each billing period
  unless cancelled before renewal.
- Cancelling stops future renewal; access continues until the end of the
  period already paid for.
- Web/Stripe purchases are managed through your Blaze Break account
  settings. Apple purchases are managed through your Apple ID
  subscription settings; Blaze Break cannot directly issue an Apple
  refund. Google Play purchases are managed through your Google Play
  subscription settings; Blaze Break cannot directly issue a Google Play
  refund.
- See `CANCELLATION_AND_REFUND_POLICY.md` for full detail.

## 6. Acceptable use

You agree to use Blaze Break in accordance with our
`ACCEPTABLE_USE_POLICY.md`, which is incorporated into these Terms by
reference.

## 7. Nova and AI-generated content

Nova is an AI system, not a human coach or clinician. AI-generated
responses can be wrong, incomplete, or not suited to your specific
situation. You are responsible for exercising your own judgement about
any suggestion Nova makes. See `AI_AND_WELLBEING_NOTICE.md` for full
detail, including the deliberate limits on what Nova can do — for
example, Nova never contacts a trusted "Guardian" contact automatically;
every such alert requires your own explicit action
(`docs/GUARDIAN_SUPPORT_SPEC.md`).

## 8. Content ownership

- **Blaze Break's intellectual property**: the Blaze Break name, brand,
  software, Nova's underlying design, and all content we author (guides,
  copy, the recovery-tool designs themselves) remain our property or
  that of our licensors.
- **Your content**: journal entries, check-in responses, recovery plans,
  and anything else you enter remains yours. You grant us the limited
  right to process it as needed to provide the service to you (including
  sending relevant parts to our AI providers as described in
  `PRIVACY_NOTICE.md`), and no more.

## 9. Prohibited conduct

See `ACCEPTABLE_USE_POLICY.md` for the full list — in summary: no
illegal use, no abuse of other users, no attempts to bypass access
controls, rate limits, or subscription tier restrictions, no scraping or
automated abuse, no attempts to access another user's data.

## 10. Service availability

Blaze Break is provided on an "as available" basis. We do not currently
commit to a specific uptime percentage or service-level guarantee for
consumer accounts — **LEGAL REVIEW REQUIRED / COMMERCIAL DECISION
REQUIRED** if one is ever offered. We may perform maintenance that
temporarily affects availability.

## 11. Suspension and termination

We may suspend or terminate an account for a genuine breach of these
Terms or the Acceptable Use Policy, for fraud or abuse, or for
non-payment once live billing exists. You may delete your own account at
any time — see `PRIVACY_NOTICE.md`'s account-deletion section for
exactly what that does.

## 12. Limitation of liability

**[LEGAL REVIEW REQUIRED]** — this section requires a solicitor to draft
an appropriate, UK-law-compliant limitation of liability clause. We do
not state a specific liability cap or exclusion here without that
review, and this Terms draft will not be published with this section
left as a placeholder.

## 13. Indemnity

**[LEGAL REVIEW REQUIRED]** — whether an indemnity clause is appropriate
for a B2C consumer service (as opposed to the B2B MSA, where one is more
standard) needs legal input, not an assumed answer.

## 14. For organisation users

If your access to Blaze Break is sponsored by your employer or another
organisation:
- Your organisation can see only **aggregate**, minimum-cohort-protected
  participation and trend figures — never your individual Nova
  conversations, journal entries, assessments, Energy Budget records,
  personal recovery plan, or any other named-individual wellbeing
  content. This is a structural guarantee enforced in the product, not
  just a policy statement — see `DATA_FLOW_MAP.md` §3 and
  `docs/PRODUCT_SAFETY_PRIVACY.md` §5.
- Your organisation's administrator can see your account's existence,
  your assigned role, and licence status — ordinary account
  administration, not wellbeing content.

## 15. Governing law

**[OWNER INPUT REQUIRED / LEGAL REVIEW REQUIRED]** — Blaze Break
operates from the UK; England and Wales law is the expected default, but
this must be confirmed, not assumed, and stated explicitly once
confirmed.

## 16. Changes to these Terms

We may update these Terms from time to time. See our legal-document
versioning system (`docs/legal/LEGAL_DOCUMENT_VERSIONING.md` once built)
for how version changes are published and, where the change is material,
when we ask you to re-accept.

## 17. Contact

**[OWNER INPUT REQUIRED — legal/support contact email]**

---

*This document is a first-pass draft prepared by engineering/product
review of the actual Blaze Break codebase. It is not legal advice and
must not be published or relied upon until reviewed by a qualified UK
solicitor. See `LEGAL_REVIEW_REQUIRED.md` for the consolidated list of
open items across every legal document in this pack.*
