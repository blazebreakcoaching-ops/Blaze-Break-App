# Sub-processor register (customer-facing)

This is the customer-facing companion to the engineering-oriented
`docs/VENDOR_REGISTER.md`, which remains the source of truth for
*how* and *why* each vendor is used — this document restates it in the
exact shape a B2B customer or the `B2B_DPA_DRAFT.md` needs: provider,
service, data category, hosting/region, transfer position, and
agreement status. Nothing below is listed unless the underlying code
actually calls it — verified against `docs/VENDOR_REGISTER.md`'s own
audit, not re-guessed.

*Version: 0.1 (draft) · Not yet published*

| Provider | Service | Purpose | Data categories | Hosting/region | Transfer position | Agreement/DPA status |
|---|---|---|---|---|---|---|
| Google Cloud Platform / Firebase | Hosting, database, auth, bot protection, secrets | Core infrastructure — everything the app stores runs through this | All categories in `DATA_INVENTORY.md` | **OWNER INPUT REQUIRED** — confirm configured GCP region(s) | LEGAL REVIEW REQUIRED / OWNER INPUT REQUIRED | LEGAL REVIEW REQUIRED — confirm Google Cloud's standard Data Processing Terms are accepted for this project |
| Google Gemini API (Developer API) | Nova's default AI provider | Chat, voice, diagnose narrative, voice-journal, resentment analysis, live voice | Wellbeing/Nova content per `DATA_INVENTORY.md` | OWNER INPUT REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED — confirm current Gemini API terms accepted |
| Google Vertex AI | Alternate Nova provider (only if `NOVA_CHAT_PROVIDER=vertex`) | Same as above, alternate path | Same | OWNER INPUT REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED |
| Anthropic (Claude API) | Alternate Nova provider (only if `NOVA_CHAT_PROVIDER=claude` and configured) | Same as above, alternate path | Same | OWNER INPUT REQUIRED (Anthropic's own infrastructure) | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED — confirm whether this provider is actually enabled for this deployment; if not currently configured, mark "not in use" rather than "n/a" |
| Twilio | SMS/WhatsApp | Guardian safety alerts, opt-in ally nudges | Phone number, message text | OWNER INPUT REQUIRED | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED — confirm Twilio DPA acceptance |
| Brevo | Transactional email | Password reset, verification, security notices, support replies | Email address, email content | OWNER INPUT REQUIRED (Brevo is an EU-based provider — confirm current data-residency setting) | LEGAL REVIEW REQUIRED | LEGAL REVIEW REQUIRED — confirm Brevo DPA acceptance |
| Web Push (VAPID/browser push services) | Browser push notifications | Stale check-in / recovery-score nudges | Push subscription endpoint | Browser-vendor-operated (Google/Mozilla/etc.), not a Blaze Break vendor relationship in the DPA sense | n/a — standards-based protocol | n/a |
| Slack, Jira (Atlassian), Asana, Calendly, Monday.com | Enterprise OAuth integrations (opt-in, per connecting individual) | Workload/meeting-load signal for org aggregate analytics | Read-only workspace/project/scheduling activity | Each provider's own infrastructure — OWNER INPUT REQUIRED per provider if this level of detail is needed for a specific customer | LEGAL REVIEW REQUIRED per provider | LEGAL REVIEW REQUIRED — confirm each provider's own standard terms cover this OAuth usage pattern |

## Not on this list, confirmed by the underlying vendor audit

- **Stripe, Apple, Google Play** — no live payment integration exists
  (`docs/STRIPE_PRODUCTS.md`, `docs/MOBILE_SUBSCRIPTIONS.md`). Will be
  added the moment either goes live.
- **Any analytics/advertising/tracking vendor** — none integrated
  (`docs/VENDOR_REGISTER.md`).
- **OpenAI** — an API key field exists in `.env.example` but no code
  path calls it. Not a real sub-processor today.

## Keeping this current

This register must be updated the moment a new vendor starts receiving
real customer data — see `docs/VENDOR_REGISTER.md`'s own
"Keeping this current" section, which this document mirrors for the
customer-facing audience.

---

*This document is a first-pass draft. Every "region"/"transfer
position"/"agreement status" cell needs owner or legal input before this
can be shared with a real customer — see `OWNER_LEGAL_INPUTS.md` and
`LEGAL_REVIEW_REQUIRED.md`.*
