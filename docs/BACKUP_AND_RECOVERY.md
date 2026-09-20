# Backup and recovery

A confirmed gap before this document existed. Firestore's own backup
capabilities are configured at the GCP project/database level, not in
this codebase — nothing in `firebase.json`, `firestore.rules`,
`firestore.indexes.json`, or `server.ts` turns on or off Firestore
backups, Point-in-Time Recovery (PITR), or any scheduled export. That
means **this document cannot state from the code whether backups are
currently enabled** — it can only describe what's available and what
needs to be confirmed by someone with GCP Console access. That
confirmation is tracked as an action item in
`docs/MANUAL_SECURITY_ACTIONS.md`, not assumed here.

## What this app's database actually is

This project's Firestore database is **Enterprise edition**, and it is a
**named database**, not the `(default)` one — see `docs/DEPLOY.md` §4 for
the operational quirks that come with that (index deployment, bulk
deletes, reserved words in rules). Any backup/PITR configuration must be
applied to this specific named database
(`ai-studio-67723f85-0bfc-4690-ac83-580d6face1fc`, as set in
`firebase.json`), not to a `(default)` database that doesn't hold this
app's data.

## What Firestore offers (GCP-level, not app-level)

Two independent, both-configured-outside-this-codebase mechanisms:

- **Point-in-Time Recovery (PITR).** Lets you query/restore Firestore
  data as it existed at any point within a rolling window (Firestore
  supports up to 7 days). Protects against a bad deploy, a bug that
  wrote or deleted the wrong data, or an accidental
  `bulk-delete`/`recursiveDelete` call — the kind of "our own code did
  something wrong" scenario, not a full database-loss event.
- **Managed exports/scheduled backups.** A full export of the database
  to Cloud Storage, either one-off (`gcloud firestore export`) or on a
  recurring schedule via Firestore's managed backup feature. Protects
  against a longer-horizon or more catastrophic event than PITR's
  window covers, and produces an artifact that can be restored to a new
  database entirely.

Neither is free of cost or effort — PITR and continuous backups both
carry ongoing storage/compute cost proportional to write volume and
retention window, which is part of why this is a decision to make
deliberately rather than something to assume is already on.

## What to actually confirm (this is the real action item)

Someone with access to the GCP Console/`gcloud` for this project needs
to check, for the named database above:

1. Is PITR currently enabled? (`gcloud firestore databases describe
   --database=<id>` shows `pointInTimeRecoveryEnablement`.)
2. Is there a scheduled backup configured? (Firestore's "Backups" page
   in the console, or `gcloud firestore backups schedules list
   --database=<id>`.)
3. If either is off, is it *intentionally* off (a considered cost/risk
   tradeoff) or simply never set up?

This is listed as a manual action, not performed here, because it
requires GCP Console/CLI access this session does not have — see
`docs/MANUAL_SECURITY_ACTIONS.md`.

## What has no backup at all, by design

- **Encrypted secrets that live only in Secret Manager**
  (`MFA_ENCRYPTION_KEY`, `SSO_CONFIG_ENCRYPTION_KEY`, provider API keys).
  Secret Manager itself is durable/replicated, but if a key is rotated
  or deleted, anything it encrypted (TOTP secrets, inline SSO secrets)
  becomes permanently undecryptable — a Firestore backup would restore
  the *ciphertext*, not the ability to read it, if the key itself isn't
  separately preserved. See `docs/INCIDENT_RESPONSE.md`'s secret-rotation
  section for the practical consequence of this.
- **Data a user has explicitly deleted via `POST /api/user/delete-
  account`.** This is intentional — the whole point of that endpoint is
  genuine erasure (GDPR Art. 17), not a soft-delete that can be silently
  recovered. A PITR window would technically make a very recent deletion
  recoverable for that window's duration; that's an accepted side effect
  of PITR protecting against accidental loss generally, not a feature
  this app should build a "restore my deleted account" flow around.

## Recovery — what actually happens if data is lost or corrupted

There is no application-level recovery procedure in this codebase today
(no "restore from snapshot" admin tool, no soft-delete/undo). Recovery
today means restoring from whatever GCP-level backup exists (§ above),
performed via `gcloud`/Console by someone with the right IAM role, not
through this app. If the confirmation in §"What to actually confirm"
finds that nothing is currently backed up, **that is the real gap to
close** — not something this document can retroactively fix by writing
about it.

## Recommendation, stated as a recommendation (not a config change made here)

For an app holding wellbeing/health-adjacent data with real, growing
usage, enabling PITR at minimum is a reasonable, low-effort baseline —
it protects against the most likely real-world incident (a bug or a
mistaken bulk operation), costs less than full scheduled exports, and
requires no application code changes. Scheduled exports to Cloud Storage
are worth adding once the data volume/criticality justifies the
additional cost — a judgment call for whoever owns the GCP billing
decision, not this document.
