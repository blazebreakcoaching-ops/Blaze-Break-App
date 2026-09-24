# Owner legal inputs needed

Every fact below cannot be determined from the codebase and must come
from Tourae Martin (or whoever the business designates) before the
documents in `docs/legal/` can move from draft to publishable. This list
does not block development — placeholders marked
**[OWNER INPUT REQUIRED]** are used consistently across every document
until these are filled in.

## Legal entity

- Legal entity name:
- Trading name: Blaze Break (confirmed already used consistently)
- Business address:
- Registered office (if different):
- Company number (Companies House):
- VAT number (if registered):
- ICO registration number (if applicable — most UK data controllers must
  register; confirm status):

## Contacts

- Privacy contact email:
- Legal contact email:
- Support email (may already exist — `support@blazebreak.app` is used
  elsewhere in the product; confirm this is also the intended legal/
  privacy contact or provide a different one):
- Abuse-reporting contact:

## Product/policy decisions

- Minimum user age:
- Governing-law preference (expected default: England and Wales — confirm):
- Insurance status (cyber liability — see `CYBER_INSURANCE_READINESS.md`):
- Refund commercial preferences (see `CANCELLATION_AND_REFUND_POLICY.md`):
- Coaching cancellation policy (once 1:1/executive coaching is sold
  separately):
- Course cancellation policy (once the Signature Course is sold
  separately):
- B2B payment terms (invoicing cadence, net terms):
- Desired B2B liability cap:
- Proposed SLA targets (see `SERVICE_LEVEL_AND_SUPPORT_SCHEDULE_DRAFT.md`):
- Data-retention decisions (see `DATA_RETENTION_SCHEDULE.md` and the
  existing, more detailed `docs/DATA_RETENTION.md` — Option A/B/C):
- Whether a marketing-consent/newsletter mechanism should be built at
  all (none currently exists in the product — see
  `LEGAL_REVIEW_REQUIRED.md`):

## Infrastructure facts an owner (not engineering) may need to confirm

- Confirm Google Cloud's standard Data Processing Terms have been
  formally accepted for this GCP project (usually a project-level
  setting/click-through, not something visible in the application code).
- Confirm the configured Cloud Logging retention window for this
  project.
- Confirm current Firestore backup/PITR configuration (a specific,
  answerable GCP Console question — see `docs/BACKUP_AND_RECOVERY.md`).

## Do not block development on these

Per the original brief's own instruction: placeholders remain in every
document until these are answered, but engineering work (the versioning
system, Privacy Centre, B2B Legal & Trust area, tests) proceeds in
parallel using `[OWNER INPUT REQUIRED]` markers, not blocked waiting for
them.
