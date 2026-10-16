# Data Governance & Privacy

Batch 1 for the "Data Governance & Privacy" capability from the Operations
Intelligence Hub audit. This batch is a manual audit of the existing GDPR
export/erasure machinery (`/api/user/export`, `/api/user/delete-account`,
`user-data-collections.ts`) plus the one real gap it found - not new
infrastructure, since the foundation here was already real and mostly
sound.

## What was found

`admin_audit_logs` - the top-level collection `logAdminAction` (server.ts)
writes to on every admin action (suspend, role change, entitlement grant) -
held personal data (`actorEmail`, `targetEmail`, `actorUid`, `targetUid`)
that was invisible to both GDPR endpoints and to the existing guardrail
test that is specifically designed to catch exactly this class of gap.

It was missed by both of the guardrail's scanners because `logAdminAction`
builds its `entry` object several lines before passing it to `.add()` by
reference - neither scanner's "look at the field names textually near the
`.add()` call" regex can see field names assigned to a variable earlier.
This is a real, structural limitation of a regex-based scanner, not a bug
in it: catching this class reliably would need an AST-aware scanner that
traces variable references, which is a different (and substantially
bigger) tool than what exists today. Flagging that honestly rather than
claiming the hardened guardrail now catches every case of this shape.

## What's shipped

- `admin_audit_logs` is now classified in `user-data-collections.ts`:
  exported (Art. 15/20) but never erased (Art. 17) - the same reasoning
  already established for the sibling `audit_logs` collection: a
  compliance trail of what an admin did must survive the account it
  describes, or there's no record the action ever happened once the
  account is deleted.
- `StrayUserCollection` now supports a `userIdFields` list (defaulting to
  `['userId']`) instead of assuming every collection uses that one field
  name. `admin_audit_logs` declares `['targetUid', 'actorUid']`, since a
  user can appear in a doc as either the person acted upon or the admin
  who acted - both endpoints now query every declared field and merge
  results by doc id, so a user who is both an admin and the target of
  someone else's action still gets a complete, non-duplicated export.
- `user-data-collections.test.ts` locks in the classification with its own
  test (the existing scanner-based guardrail can't rediscover this one on
  its own, for the reason above) and `user-data-endpoints.route.test.ts`
  proves both endpoints' real behavior against seeded `admin_audit_logs`
  docs: export includes the user's data under either field, erasure
  deliberately keeps it, and another user's entries are never touched.

## Scope note

This was a manual, targeted audit of one specific, well-defined mechanism
(the stray top-level collections the two scanners already exist to guard),
not a full data-flow audit of every collection in the app. The existing
foundation (Firestore rules, `listCollections()`/`recursiveDelete()` for
nested data, the stray-collection registry pattern itself) remains solid
and is what made finding and fixing this gap tractable in one batch.
