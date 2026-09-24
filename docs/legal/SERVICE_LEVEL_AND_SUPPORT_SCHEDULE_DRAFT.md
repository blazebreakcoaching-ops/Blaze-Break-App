# Service Level & Support Schedule (DRAFT)

**Status: DRAFT — COMMERCIAL DECISION REQUIRED on every target below.**
No aggressive enterprise SLA (99.99% uptime, financial service credits)
is proposed here without explicit business approval — these are sensible
starting categories only.

*Version: 0.1 (draft) · Not yet published*

## Support severity categories (proposed)

| Category | Example | Acknowledgement target (DRAFT) | Channel | Escalation |
|---|---|---|---|---|
| **Critical service outage** | The platform is entirely unreachable for all users | **COMMERCIAL DECISION REQUIRED** (e.g. within 4 business hours as a starting proposal) | **[OWNER INPUT REQUIRED — support channel]** | Direct to founder/engineering lead until a formal on-call rotation exists |
| **Serious access/security issue** | A security vulnerability report, or an org's users cannot sign in | COMMERCIAL DECISION REQUIRED (e.g. within 1 business day) | Same | Same |
| **Degraded service** | A specific feature (e.g. Nova Live voice) is slow or intermittently failing | COMMERCIAL DECISION REQUIRED (e.g. within 2 business days) | Same | Same |
| **Ordinary support** | A how-to question, a billing question | COMMERCIAL DECISION REQUIRED (e.g. within 3 business days) | Same | n/a |
| **Feature request** | A suggestion for new functionality | Acknowledged, no committed timeline | Same | n/a |

## Uptime

Blaze Break does **not** currently commit to a specific uptime
percentage or offer financial service credits. **COMMERCIAL DECISION
REQUIRED** if/when this is offered to enterprise customers — this
document will not state 99.9%/99.99% or any other figure until the
business has genuinely assessed its infrastructure's real historical
availability and is prepared to stand behind a number contractually.

## What's actually true about current infrastructure

- Hosted on Google Cloud Run / Firebase — see `docs/SECURITY_ARCHITECTURE.md`
  and `docs/DEPLOY.md` for the real, current deployment model (a single
  Cloud Run service, no documented multi-region failover today).
- No support ticketing system is currently integrated into the product
  — **OWNER INPUT REQUIRED** on the actual support channel(s) to be
  named here (email, a helpdesk tool, etc.).

---

*This document is a first-pass structural draft with every numeric
target explicitly marked as a business decision, not an invented
commitment. See `LEGAL_REVIEW_REQUIRED.md`.*
