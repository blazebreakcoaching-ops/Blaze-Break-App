# Blaze Break — Privacy Notice (DRAFT)

**Status: DRAFT — LEGAL REVIEW REQUIRED before publication.** Grounded
directly in `DATA_INVENTORY.md`, `DATA_FLOW_MAP.md`, and
`DATA_ROLE_ANALYSIS.md` — every claim below should be traceable to one of
those documents. Lawful-basis statements are flagged for legal review,
not asserted as settled.

*Version: 0.1 (draft) · Not yet published · UK English*

## 1. Who we are

See `TERMS_OF_SERVICE.md` §1 for our legal entity details
(**[OWNER INPUT REQUIRED]**). Privacy contact: **[OWNER INPUT REQUIRED]**.

## 2. What personal data we collect

Full detail in `DATA_INVENTORY.md`. In summary:

- **Account data**: email, display name, authentication method, phone
  number if you provide one.
- **Profile and onboarding answers**: role, organisation, your stated
  goal, work context, main energy drain, preferred coaching tone.
- **Wellbeing content** (the sensitive core of the product): check-ins,
  mood pulses, body check-ins, GAD-7 anxiety screening responses,
  Energy Budget entries, recovery plan progress, stress trigger logs,
  boundary rehearsal scripts, voice-journal transcriptions, resentment-
  tracker entries (including raw free-text you write), Burnout
  Fingerprint archetype.
- **Nova conversation content**: your messages to Nova and Nova's
  responses (not persisted as a stored transcript — see §5), plus any
  memory you or Nova (with your consent) saves for future context.
- **Guardian/trusted-contact data**: contact details you choose to add,
  and a record of any alert sent (only ever sent by your own explicit
  action).
- **Billing/entitlement data**: your subscription tier and status. We do
  not currently collect payment card details directly — see §7.
- **Technical/security data**: sign-in records, security audit logs
  (kept for accountability even after account deletion — see §9),
  device/browser information incidental to normal web requests.
- **Organisation data** (if your account is sponsored by an employer):
  your membership record and role within that organisation.

We do **not** collect: payment card numbers, biometric data of any kind,
device GPS location, or data from any third-party analytics/advertising
tracker — none is integrated into this product.

## 3. Why we process it

**LEGAL REVIEW REQUIRED throughout this section** — the purposes below
are accurate descriptions of *why the feature needs the data*; the UK
GDPR Art. 6 (and, for wellbeing/health-adjacent data, Art. 9) lawful
basis for each is a legal determination, not stated here as settled.

| Purpose | Data involved |
|---|---|
| Provide the core service (check-ins, recovery tools, Nova coaching) | Wellbeing content, profile |
| Account security | Auth data, security logs, MFA data |
| Personalise Nova's coaching approach | Onboarding profile, Nova memories (with your consent) |
| Communicate with you (password resets, security notices, support replies) | Email address |
| Guardian safety feature, at your own initiation only | Guardian contacts, alert records |
| Determine subscription access | Entitlement record |
| Organisation licence administration (if applicable) | Organisation membership |
| Aggregate organisation wellbeing reporting (if applicable, and only above a minimum-cohort threshold) | De-identified, aggregated signals only |

Where we rely on your consent (for example, Nova remembering things
about you, or an organisation's optional analytics participation), you
can withdraw it at any time in Settings — see §11.

## 4. Sensitive / special category information

Much of what Blaze Break processes relates to your mental and emotional
wellbeing, which UK GDPR treats as a special category of data requiring
extra care. **LEGAL REVIEW REQUIRED** to confirm the specific Art. 9
condition relied upon (likely explicit consent, given the product's
opt-in, self-directed nature — but this must be confirmed by a
solicitor, not assumed here).

## 5. How Nova (our AI) uses your information

- Nova is powered by Google's Gemini (our default provider), with
  optional alternative providers (Google Vertex AI, Anthropic Claude)
  depending on configuration — see `docs/API_PROVIDER_MAP.md`.
- **Your Nova chat messages are not stored by us as a saved transcript.**
  They are sent to the AI provider to generate a response and held only
  in your own browser session while you're using the app.
- **Nova Live voice** audio is streamed live to the AI provider for
  real-time conversation and is not recorded or stored by us.
- **Voice-journal entries and resentment-tracker entries are different**
  — these features explicitly save what you write/say (transcription,
  themes, and your raw text, respectively) so you can look back on them,
  and this saved content is what feeds Nova's understanding of your
  situation over time.
- With your consent, Nova can save specific "memories" about you (things
  you've told it, or patterns from your own activity) to make future
  conversations more relevant. You can see, edit, and delete every
  memory Nova holds, at any time, in Settings.
- Content sent to our AI providers is governed by their own published
  data-use terms. Google states content sent through the Gemini API
  (not the free consumer Gemini app) is not used to train its models by
  default; Anthropic states the same for the Claude API. These are the
  providers' own commitments — Blaze Break does not itself control what
  happens to a request after it leaves our servers. See
  `docs/DATA_POLICY.md`.

See `AI_AND_WELLBEING_NOTICE.md` for the plain-English version of this
section.

## 6. Who we share your information with

We only share what's necessary, with the following categories of
service provider (full detail in `SUBPROCESSOR_REGISTER.md` — we do not
use the vague phrase "trusted partners" where the actual providers can
be named):

- **Google Cloud / Firebase** — hosting, database, authentication,
  bot/abuse protection.
- **Google Gemini / Vertex AI, and optionally Anthropic Claude** — Nova's
  AI processing, as described in §5.
- **Brevo** — sends our transactional emails (password resets, security
  notices, support replies) on our behalf.
- **Twilio** — sends SMS messages for the Guardian safety feature and
  opt-in nudges, only ever at your own instruction.
- **Your organisation** (if your account is sponsored by one) — sees
  only aggregate, minimum-cohort-protected figures, never your
  individual content. See §12.
- **Enterprise integration providers** (Slack, Jira, Asana, Calendly,
  Monday.com) — only if you, individually, choose to connect one; only
  read-only workload-activity signals are pulled, and only aggregated,
  threshold-gated figures ever leave that pipeline toward an
  organisation.

We do not sell your personal data. We do not use any third-party
advertising or analytics tracker.

## 7. Payments

Blaze Break does not currently operate a live, self-service payment
system. We do not collect or store payment card details. When payment
processing is introduced (via Stripe, Apple, or Google Play — see
`docs/STRIPE_PRODUCTS.md` / `docs/MOBILE_SUBSCRIPTIONS.md`), this
section will be updated to describe exactly what each processor
receives, which is limited by design to what that processor needs to
handle payment, not passed through Blaze Break's own systems.

## 8. International transfers

**LEGAL REVIEW REQUIRED / OWNER INPUT REQUIRED.** Our infrastructure
runs on Google Cloud; our AI providers (Google, and optionally
Anthropic) may process data outside the UK. The specific transfer
mechanism relied upon (UK International Data Transfer Agreement,
adequacy decision, or otherwise) for each provider must be confirmed
against their current published terms and documented here — not
assumed.

## 9. How long we keep your information

**There is currently no automated data-expiry process for personal
wellbeing content** — see `DATA_RETENTION_SCHEDULE.md` for the honest,
category-by-category picture and the retention decision that still
needs to be made by the business. In short: your data is kept until you
delete your account, except for security audit-log entries, which we
keep as an accountability record even after deletion (see §10).

## 10. Account deletion

You can delete your account at any time in Settings. This permanently
erases your account and virtually all associated personal data,
including every wellbeing record described in §2. Two things are kept
even after deletion:

- **Security audit-log entries** — kept as an accountability record
  (for example, to prove a deletion request was actually carried out),
  never your wellbeing content itself.
- **Data already sent to a third party before your deletion request**
  (an AI response already generated, an email already sent by Brevo, an
  SMS already sent by Twilio) — this has already left our systems and is
  outside our technical control from that point; each provider's own
  retention policy applies to their copy.

See `DATA_FLOW_MAP.md` §6 for the exact technical flow.

## 11. Your rights

Depending on the lawful basis that applies (see §3, LEGAL REVIEW
REQUIRED), you generally have the right to:

- **Access** your data — via "Download My Data" in Settings, or by
  contacting us.
- **Correct** inaccurate data — directly in the app wherever the field
  is editable, or by contacting us.
- **Delete** your data — via "Delete My Account" in Settings (see §10).
- **Restrict or object to** processing in certain circumstances.
- **Data portability**, where the lawful basis is consent or contract.
- **Withdraw consent** at any time, wherever we rely on it (for example,
  Nova's memory feature, or an organisation's optional analytics
  participation) — via the relevant toggle in Settings, with no penalty
  to your account for doing so.
- **Complain to the ICO** (the UK's data protection regulator) if you
  believe we've mishandled your data. ICO registration reference:
  **[OWNER INPUT REQUIRED]**.

## 12. If your account is sponsored by an organisation

Your employer or organisation can see: your account's existence, your
assigned role, your licence status, and — only if the aggregate cohort
clears a minimum-size threshold — de-identified, aggregate participation
and trend figures. They **cannot** see: your Nova conversations, journal
entries, assessments, Energy Budget records, personal recovery plan, or
any other content tied to you by name. This is enforced in the product's
own access-control code, not just a policy promise — see
`DATA_FLOW_MAP.md` §3–§4.

## 13. Children / minimum age

**[OWNER INPUT REQUIRED]** — Blaze Break's minimum user age must be
decided by the business (a burnout-recovery/workplace-performance
product is not inherently designed for or targeted at children, but this
still needs an explicit, stated position).

## 14. Changes to this notice

We'll update the version and effective date shown here whenever this
notice changes, and follow our legal-document versioning process for
anything material — see `TERMS_OF_SERVICE.md` §16.

---

*This document is a first-pass draft prepared by engineering/product
review of the actual Blaze Break codebase. It is not legal advice and
must not be published or relied upon until reviewed by a qualified UK
solicitor. See `LEGAL_REVIEW_REQUIRED.md`.*
