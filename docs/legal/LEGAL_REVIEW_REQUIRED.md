# Legal review required — consolidated list

Every item across this legal document pack that needs a qualified UK
solicitor's judgement, not an engineering answer. Grouped by document,
cross-referenced so nothing is hidden inside a single file no one
re-opens.

## Cross-cutting

- Exact legal entity name, trading name, address, company number — see
  `OWNER_LEGAL_INPUTS.md` (owner fact, but the correct way to represent
  it in each document is a legal drafting question).
- ICO registration/fee position.
- Minimum customer/user age — product decision, but the correct
  child-safeguarding drafting once decided needs legal review.
- Lawful basis for each personal data category in `DATA_INVENTORY.md`
  (Art. 6, and Art. 9 for special-category/wellbeing data).
- Controller/processor/joint-controller allocation per activity — see
  `DATA_ROLE_ANALYSIS.md`, especially the aggregate-analytics "possible
  joint controller" flag and the enterprise-OAuth-integration ambiguous
  row.
- International transfer mechanism for each provider that may process
  data outside the UK (Google, Anthropic).
- Governing law and jurisdiction.

## `TERMS_OF_SERVICE.md`

- §12 Limitation of liability — no cap/exclusion drafted, deliberately
  left for solicitor drafting.
- §13 Indemnity — whether appropriate at all for a B2C context.
- §15 Governing law.

## `PRIVACY_NOTICE.md`

- §3 Lawful basis table.
- §4 Special category data condition.
- §8 International transfers.
- §13 Minimum age (owner decision, legal drafting once decided).

## `CANCELLATION_AND_REFUND_POLICY.md`

- Statutory UK consumer cancellation rights (Consumer Contracts
  Regulations 2013) as applied to an immediate-access subscription
  service — the interaction between the 14-day cooling-off right and a
  customer's acknowledgement of immediate access needs correct,
  solicitor-drafted wording, not an invented clause.
- Digital-content-specific statutory position, if discrete digital
  products are ever sold outside a subscription.

## `ACCEPTABLE_USE_POLICY.md`

- Reverse-engineering clause — UK-compliant wording (certain reverse-
  engineering rights cannot be excluded by contract under UK law in
  specific circumstances, e.g. interoperability).

## `B2B_MSA_DRAFT.md`

- §8 Confidentiality wording.
- §10 Security warranty language, if any beyond factual description.
- §13 Liability and indemnity — not drafted.
- §14 Insurance representation, contingent on `OWNER_LEGAL_INPUTS.md`'s
  insurance answer.
- §15 Governing law and dispute resolution.
- §16 Precedence order between MSA/Order Form/DPA/SLA.

## `B2B_DPA_DRAFT.md`

- §2 Whether the aggregate-analytics activity needs a formal joint-
  controller arrangement under Art. 26, separate from this processor-
  shaped DPA.
- §9 Sub-processor notice period.
- §10 Contractual breach-notification timeframe.
- §12 Audit rights scope.

## `SERVICE_LEVEL_AND_SUPPORT_SCHEDULE_DRAFT.md`

- Every numeric target is a business decision requiring legal review
  only once figures are actually proposed, to confirm they're stated as
  targets and not accidentally drafted as binding guarantees without the
  business intending that.

## `BLAZE_BREAK_DPIA.md`

- §9's five listed decisions — this DPIA is explicitly not "final"
  until a DPO/solicitor confirms each.
- Whether Nova's coaching output constitutes Art. 22 automated
  decision-making (this DPIA's working position is "no," but that needs
  confirmation, not self-certification).

## `DATA_RETENTION_SCHEDULE.md`

- Statutory minimum retention for billing/accounting records once live
  billing exists (UK tax law implications).
- Security audit-log retention ceiling.

## A real, current product gap worth flagging explicitly

**No marketing-consent or newsletter-signup mechanism currently exists
anywhere in this codebase.** This was checked directly (no code path
collects or gates on marketing consent). This means:
- There is currently no risk of marketing consent being improperly
  bundled with Terms acceptance, because there's no marketing consent
  mechanism to bundle.
- If/when one is built, it must be a genuinely separate, unticked-by-
  default checkbox, never inferred from Terms acceptance or account
  creation — this is a **build requirement**, flagged here so it's not
  missed when that feature is eventually built, not a current violation.

---

*Cross-reference: `OWNER_LEGAL_INPUTS.md` for facts only the business
can supply. This list should be treated as a living document, updated
whenever a new legal document in this pack is drafted or revised.*
