# Blaze Break — B2B Master Services Agreement (DRAFT)

**Status: DRAFT — LEGAL REVIEW REQUIRED before use with any customer.**
This is a structural first draft only, grounded in the actual
organisation features that exist in the product today
(`docs/ENTERPRISE_RBAC.md`, `docs/PRODUCT_SAFETY_PRIVACY.md` §5). No
commercial or legal position below (liability cap, governing law,
insurance, precise SLA figures) is invented — each is flagged.

*Version: 0.1 (draft) · Not yet published*

## 1. Parties

**Blaze Break** ([legal entity name — OWNER INPUT REQUIRED], of
[registered address — OWNER INPUT REQUIRED]) ("**Blaze Break**")

and

the customer organisation named in the applicable Order Form
("**Customer**").

## 2. Services

Blaze Break provides access to its burnout-recovery and sustainable-
performance platform for Customer's employees/members, comprising the
features described in the applicable Order Form and Blaze Break's then-
current product documentation, including — where ordered — organisation
role-based administration, aggregate wellbeing analytics (subject to
minimum-cohort protection), and enterprise integrations.

## 3. Ordering and licences

- Access is provisioned per named licence, ordered via an Order Form
  referencing this MSA.
- Roles available to Customer's own administrators today:
  **owner, admin, security_admin, billing_admin, connector_admin,
  manager, hr_viewer, member, viewer** — see `docs/ENTERPRISE_RBAC.md`
  for the exact permission matrix. Customer is responsible for assigning
  these roles appropriately within its own organisation.

## 4. Pricing, invoicing, payment

**COMMERCIAL DECISION REQUIRED** — B2B pricing model, invoicing cadence,
and payment terms are not yet defined in this product and must be set
by the business before this section can be completed.

## 5. Implementation and support

See `SERVICE_LEVEL_AND_SUPPORT_SCHEDULE_DRAFT.md`.

## 6. Customer responsibilities

- Customer is responsible for the accuracy of employee/member
  information it provides for licence provisioning.
- Customer's organisation administrators are responsible for role
  assignment within their own organisation and for their own users'
  compliance with Blaze Break's `ACCEPTABLE_USE_POLICY.md`.
- Customer acknowledges and agrees to the employee privacy boundary in
  §9 below, and will not attempt to circumvent it (for example, by
  asking Blaze Break, informally, to disclose an individual employee's
  private wellbeing content — Blaze Break will refuse any such request
  regardless of how it's made).

## 7. Intellectual property

Blaze Break retains all rights in the platform, Nova, and its underlying
technology. Customer retains rights in its own data. Neither party
grants the other rights beyond what's needed to perform this Agreement.

## 8. Confidentiality

**LEGAL REVIEW REQUIRED** — standard mutual confidentiality obligations
are expected here; exact wording needs solicitor drafting.

## 9. Data protection — the employee privacy boundary

This is Blaze Break's core commercial and product principle for B2B
customers, and it is enforced in the product itself, not just promised
in writing (see `docs/PRODUCT_SAFETY_PRIVACY.md` §5 and
`docs/legal/DATA_FLOW_MAP.md` §3):

- Customer, as an organisation, does **not** gain access to any named
  employee's Nova conversations, journal entries, individual
  assessments, private Energy Budget records, personal recovery plans,
  private reflections, personal AI memory, or other individual wellbeing
  content, **regardless of Customer's subscription tier or role
  assignments**.
- Customer may access only: (a) administrative account/licence data
  (who has an account, their role, licence status), and (b) aggregate,
  de-identified wellbeing analytics that clear a minimum-cohort
  threshold, as configured in Customer's own account settings (floor of
  3, default 5 — see `docs/DATA_POLICY.md`).
- Data protection terms specific to processing activities under this
  Agreement are set out in the separate Data Processing Agreement
  (`B2B_DPA_DRAFT.md`), which does **not** treat every processing
  activity as the same controller/processor shape — see
  `DATA_ROLE_ANALYSIS.md`, incorporated by reference.

## 10. Security

See `docs/SECURITY_ARCHITECTURE.md` for Blaze Break's actual technical
security posture. A customer-facing summary is maintained at
`SECURITY_TRUST_OVERVIEW.md` (product implementation pass).
**LEGAL REVIEW REQUIRED** for any specific security warranty/commitment
beyond a factual description of controls actually implemented.

## 11. Service availability, changes, suspension

See `SERVICE_LEVEL_AND_SUPPORT_SCHEDULE_DRAFT.md`. Blaze Break may
suspend access for a genuine breach of this Agreement, non-payment, or a
security risk to the platform or other customers, with notice where
reasonably practicable.

## 12. Termination and post-termination access

**COMMERCIAL DECISION REQUIRED** — notice period, effect on Customer's
own data on termination (export window before deletion), and
post-termination data-return/deletion timeline need to be decided by the
business and documented here, consistent with `DATA_RETENTION_SCHEDULE.md`.

## 13. Liability and indemnity

**LEGAL REVIEW REQUIRED.** No liability cap or indemnity position is
stated here — this needs solicitor drafting appropriate to a UK B2B
SaaS agreement, and should not be invented in this document.

## 14. Insurance

See `CYBER_INSURANCE_READINESS.md`. **OWNER INPUT REQUIRED** on current
coverage before any insurance representation can be made to a customer
in this Agreement.

## 15. Governing law and dispute resolution

**[OWNER INPUT REQUIRED / LEGAL REVIEW REQUIRED]** — expected default is
England and Wales, given Blaze Break's UK-first operation, but must be
confirmed explicitly, not assumed.

## 16. Precedence

Where there is a conflict between this MSA, an Order Form, the DPA, and
any SLA, the order of precedence is: **[OWNER INPUT REQUIRED /
LEGAL REVIEW REQUIRED]** — a sensible default (Order Form > DPA > SLA >
MSA for the specific matters each governs) is common but must be
confirmed as this business's actual intent, not assumed silently.

---

*This document is a first-pass structural draft. It is not legal advice
and must not be used with any customer until reviewed by a qualified UK
solicitor and until every COMMERCIAL DECISION REQUIRED / OWNER INPUT
REQUIRED item is resolved. See `LEGAL_REVIEW_REQUIRED.md`.*
