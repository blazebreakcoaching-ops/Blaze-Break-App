# Blaze Break — B2B Data Processing Agreement (DRAFT)

**Status: DRAFT — LEGAL REVIEW REQUIRED before use with any customer.**
Because Blaze Break's controller/processor role genuinely varies by
processing activity (see `DATA_ROLE_ANALYSIS.md`, incorporated by
reference and **not** re-derived here), this DPA is scoped explicitly to
the activities where Customer is likely the controller and Blaze Break
the processor — it does not force every activity into a processor
relationship where that doesn't fit.

*Version: 0.1 (draft) · Not yet published*

## 1. Subject matter and duration

This DPA applies for the term of the MSA (`B2B_MSA_DRAFT.md`) between
Blaze Break and Customer, and covers the processing activities listed in
Annex A.

## 2. Scope — what this DPA covers, and what it deliberately does not

**Covered** (per `DATA_ROLE_ANALYSIS.md`'s B2B table, "Customer likely
controller / Blaze Break likely processor" rows):
- Licence/account provisioning (employee email address for account
  creation).
- Org audit-log recording of Customer's own administrative actions.

**Explicitly not forced into this DPA as a simple processor
relationship** — see `DATA_ROLE_ANALYSIS.md` for the reasoning:
- An individual employee's private wellbeing engagement with Blaze
  Break/Nova, which Blaze Break determines the purposes and means of
  independently.
- The aggregate org-analytics computation, which may be a **joint
  controller** scenario rather than a simple processor one —
  **LEGAL REVIEW REQUIRED** to determine whether a separate joint-
  controller arrangement (UK GDPR Art. 26) is needed for this activity
  specifically.

## 3. Nature and purpose of processing

Provisioning and administering employee access to the Blaze Break
platform on Customer's instruction, and maintaining an audit trail of
Customer's own administrative actions for Customer's accountability.

## 4. Categories of personal data

Employee/member email address, name (where provided), assigned role,
licence status, and administrative action metadata (who did what, when
— never the content of any wellbeing feature).

## 5. Categories of data subjects

Customer's employees or members who are provisioned a Blaze Break
licence.

## 6. Controller obligations

Customer warrants it has a lawful basis for providing employee data for
licence provisioning and for any instruction it gives Blaze Break under
this DPA.

## 7. Processor obligations

Blaze Break will:
- process personal data covered by this DPA only on Customer's
  documented instructions (including for the purposes set out here);
- ensure personnel with access are subject to confidentiality
  obligations;
- implement appropriate technical and organisational security measures
  — see `docs/SECURITY_ARCHITECTURE.md` for what's actually implemented;
- assist Customer with data subject rights requests concerning covered
  data, to the extent Blaze Break can (noting that most individual
  wellbeing content is outside this DPA's scope per §2, because Blaze
  Break is not processing it as Customer's processor);
- notify Customer of a personal data breach affecting covered data
  without undue delay — see §10;
- delete or return covered data at the end of the engagement, per
  `DATA_RETENTION_SCHEDULE.md` and the MSA's termination provisions;
- make available information reasonably necessary to demonstrate
  compliance with this DPA.

## 8. Confidentiality

See `B2B_MSA_DRAFT.md` §8.

## 9. Sub-processors

See `SUBPROCESSOR_REGISTER.md` for the current list of vendors that
process data as part of providing the Blaze Break service. Blaze Break
will notify Customer of a new sub-processor before it begins processing
Customer's covered data, giving Customer a reasonable opportunity to
object — **[OWNER INPUT REQUIRED / LEGAL REVIEW REQUIRED — set the exact
notice period, e.g. 14 or 30 days]**.

## 10. Personal data breach notification

**LEGAL REVIEW REQUIRED / COMMERCIAL DECISION REQUIRED** — the exact
contractual notification timeframe (UK GDPR requires the controller to
notify the ICO within 72 hours of becoming aware, which places pressure
on how quickly a processor must notify the controller) needs to be set
deliberately, not left unstated. See `docs/INCIDENT_RESPONSE.md` for
Blaze Break's actual internal incident-response process today.

## 11. International transfers

See `PRIVACY_NOTICE.md` §8 — **LEGAL REVIEW REQUIRED / OWNER INPUT
REQUIRED**, same open item, not duplicated as a separate decision here.

## 12. Audit rights

**COMMERCIAL DECISION REQUIRED** — whether Customer receives a right to
audit (and on what terms — documentation review vs. an on-site/technical
audit) is a commercial decision the business needs to make, informed by
what's proportionate for Blaze Break's likely customer size and this
product's actual security posture.

## 13. Deletion / return of data on termination

See `B2B_MSA_DRAFT.md` §12 and `DATA_RETENTION_SCHEDULE.md`.

---

## Annex A — Processing activities covered by this DPA

| Activity | Data | Purpose | Duration |
|---|---|---|---|
| Licence provisioning | Employee email, assigned role | Grant/manage platform access | Term of the MSA |
| Org audit logging | Admin action metadata | Customer's own accountability record | Term of the MSA + retention per `DATA_RETENTION_SCHEDULE.md` |

---

*This document is a first-pass structural draft. It is not legal advice
and must not be used with any customer until reviewed by a qualified UK
solicitor. See `LEGAL_REVIEW_REQUIRED.md` and `DATA_ROLE_ANALYSIS.md`.*
