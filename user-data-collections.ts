// Single source of truth for top-level Firestore collections that hold a
// user's personal data keyed by a `userId` FIELD, rather than being nested
// under users/{uid}.
//
// Why this file exists: the GDPR export and account-deletion endpoints in
// server.ts enumerate a user's data via listCollections()/recursiveDelete()
// on their users/{uid} document. Those two calls reach every SUBcollection
// under the user - but they cannot see a top-level collection that merely
// stores a userId field on each document. Such a collection is therefore
// invisible to both endpoints unless it's handled by hand, which silently
// produces either an incomplete export (a portability failure the user
// can't detect) or data that survives a deletion the UI promised was total
// (an erasure failure).
//
// This has already bitten us twice - anxiety_reset_events and audit_logs
// were each found missing after the fact. The guardrail test
// (user-data-collections.test.ts) scans server.ts and fails if any
// top-level collection queried by a userId field is neither declared here
// nor listed as a deliberate structural exemption below - so the NEXT
// feature that adds one cannot slip through unclassified.

export interface StrayUserCollection {
  name: string;
  // Included in the GDPR data export (Art. 15/20). Effectively always true
  // for a collection holding the user's own personal data.
  exportOnRequest: boolean;
  // Erased when the user deletes their account (Art. 17). Usually true. The
  // documented exception is a compliance/audit trail that must outlive the
  // account it records.
  eraseOnDeletion: boolean;
  reason?: string;
}

export const STRAY_USER_COLLECTIONS: StrayUserCollection[] = [
  {
    name: 'anxiety_reset_events',
    exportOnRequest: true,
    eraseOnDeletion: true,
  },
  {
    name: 'audit_logs',
    exportOnRequest: true,
    eraseOnDeletion: false,
    reason:
      "Compliance trail - records events like 'deletion completed'. It must " +
      'survive the account it describes to serve as proof the erasure ' +
      'happened, so it is exported but deliberately not erased.',
  },
];

// Top-level collections that ARE queried by a userId field but are NOT the
// user's own personal data to export or erase wholesale. Listed explicitly
// so the guardrail test can tell a deliberate, reasoned exemption apart
// from a newly-added collection nobody has classified yet.
export const NON_PERSONAL_USERID_COLLECTIONS: string[] = [
  // The user root document itself - already handled directly via
  // userRef/recursiveDelete in both endpoints, not as a stray collection.
  'users',
  // Organisation records. Membership is queried by userId, but an org is
  // shared data owned by the organisation, not the individual's to erase
  // when they delete their own account (their membership is removed
  // separately by the deletion endpoint).
  'organisations',
];

export const collectionsForExport = (): string[] =>
  STRAY_USER_COLLECTIONS.filter((c) => c.exportOnRequest).map((c) => c.name);

export const collectionsForErasure = (): string[] =>
  STRAY_USER_COLLECTIONS.filter((c) => c.eraseOnDeletion).map((c) => c.name);
