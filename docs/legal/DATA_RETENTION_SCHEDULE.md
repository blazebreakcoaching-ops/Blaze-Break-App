# Data retention schedule

Category-by-category companion to the existing, more discursive
`docs/DATA_RETENTION.md` (which explains *why* this is an open decision
and lays out options A/B/C — read that first). This document is the
schedule shape the spec asks for; it does not re-decide anything
`docs/DATA_RETENTION.md` already correctly left open.

*Version: 0.1 (draft) · Not yet published*

**The honest headline, unchanged from `docs/DATA_RETENTION.md`: there is
no automated retention/expiry job anywhere in this codebase today.**
Every "Retention period" cell below that isn't a hard technical fact is
marked **OWNER DECISION REQUIRED** — no arbitrary number is invented
here.

| Category | Current technical reality | Retention period |
|---|---|---|
| Account data (auth, profile) | Kept until account deletion | Until deletion — **OWNER DECISION REQUIRED** on whether an inactivity-based expiry should apply (Option B in `docs/DATA_RETENTION.md`) |
| Authentication records (Firebase Auth) | Kept until account deletion | Until deletion |
| Subscription/entitlement records | Kept until account deletion | Until deletion. **OWNER DECISION REQUIRED**: once live billing exists, whether billing/accounting records need to be retained longer than the account itself for statutory accounting-record purposes (UK tax law typically requires 6 years for business records — **LEGAL REVIEW REQUIRED**) |
| Accounting/payment records | **None exist today** — no live payment processor | n/a until billing is built |
| Journals, assessments, GAD-7, Energy Budget, recovery plans, Nova conversation-adjacent content (voice-journal, resentment logs) | Kept until account deletion | Until deletion — **OWNER DECISION REQUIRED**, this is the category `docs/DATA_RETENTION.md` is most directly about |
| Nova memories | Kept until deleted by the user or the account | Until deletion (user-controlled, deletable individually at any time) |
| Voice/audio | **Never persisted** — processed live, discarded | n/a |
| Uploaded files | **None exist** — no Cloud Storage usage anywhere in this codebase | n/a |
| Organisation membership | Kept until membership removed or org deleted | Until removal |
| Aggregate organisation analytics | Kept as long as the org exists | **OWNER DECISION REQUIRED** — whether historical aggregate trend data should itself expire |
| Notification logs (push subscriptions, SMS/email send records) | Kept until account deletion | Until deletion |
| Security/audit logs | **Deliberately NOT deleted on account deletion** — kept as an accountability trail | **OWNER DECISION REQUIRED** on an eventual retention ceiling (e.g. 2 years, 6 years) rather than indefinite — flagged in `docs/DATA_RETENTION.md`, not yet decided |
| Support records | Routed through Brevo, not separately persisted by Blaze Break beyond the send | Per Brevo's own retention — see `SUBPROCESSOR_REGISTER.md` |
| Marketing records | **No marketing-consent mechanism currently exists in the product** — this is a real product gap, see `LEGAL_REVIEW_REQUIRED.md` | n/a until built |
| Deleted-account remnants | `recursiveDelete` + the `STRAY_USER_COLLECTIONS` registry — see `DATA_FLOW_MAP.md` §6 | Erased at deletion, except the audit-log exception above |
| Backups | See `docs/BACKUP_AND_RECOVERY.md` | **OWNER INPUT REQUIRED** — confirm current Firestore backup/PITR configuration and how long a deleted user's data could still exist in a backup snapshot; this must be stated honestly in the Privacy Notice once known, not omitted |

## What this schedule does not do

It does not pick a number for any `OWNER DECISION REQUIRED` row. See
`docs/DATA_RETENTION.md` for the full reasoning behind each option and
why "no decision yet" is itself the thing being flagged as the risk,
not a specific missing engineering feature.

---

*This document is a first-pass draft. See `LEGAL_REVIEW_REQUIRED.md`
and `OWNER_LEGAL_INPUTS.md`.*
