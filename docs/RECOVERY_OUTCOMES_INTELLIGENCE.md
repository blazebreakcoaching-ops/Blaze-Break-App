# Recovery Outcomes Intelligence

Batch 1 for the "Recovery Outcomes Intelligence" capability from the
Operations Intelligence Hub audit. Unlike the four batches before this one
(Site Reliability, QA, Data Governance, Security Operations - all hardening
of mechanisms that already existed), this capability did not exist in any
form before this batch: outcome data was recorded per-user only, with no
cross-member aggregation anywhere. This is new feature work, scoped
deliberately narrow - backend data layer only, no UI yet - matching how
every other multi-PR capability in this codebase was built (engine first,
UI in a later, separate batch).

## What this answers

Across the whole member base, which recovery modules does the Routing
Engine recommend, and once recommended, do they actually help? The
underlying data has existed since the Recovery Routing Engine's outcome
loop (`/api/recovery/routing-outcome`) - every recommendation and its
eventual outcome (`declined`/`completed`/`abandoned`) and, when completed,
a helpfulness rating (`better`/`same`/`not_really`/`not_sure`) is already
recorded at `users/{uid}/recovery_routing_decisions`. Nothing aggregated
it across users before this.

## What's shipped

- `recovery-outcomes-intelligence.ts` (`summarizeModuleOutcomes`): pure,
  unit-tested aggregation - per module, recommended/resolved/completed/
  declined/abandoned counts, a completion rate, and a net-positive
  helpfulness rate (`better / (better + same + not_really)`, deliberately
  excluding `not_sure` from the denominator rather than treating it as
  neutral).
- `GET /api/admin/recovery-outcomes` (server.ts): reads via a Firestore
  `collectionGroup` query bounded to a lookback window (90 days default,
  `?days=` up to a 365-day cap) so the read stays bounded as the member
  base grows, then calls the pure engine above. Gated behind the existing
  `content.manage` permission rather than a new one - "is our recovery
  content/modules actually working" is squarely what that permission
  already exists to answer.
- A minimum-sample gate (`sufficientSample`, reusing
  `checkCohortSufficiency` from `anonymous-aggregation-engine.ts`, default
  threshold 20 resolved outcomes) on every module, so a rarely-recommended
  module with 2-3 outcomes doesn't report a misleading "100% helped."
  Framed and tuned as a statistical-reliability floor, not a privacy
  control - reusing the sibling capability's mechanism for a different
  reason, since at platform scale an individual isn't realistically
  identifiable from a module-level aggregate the way they are from a
  12-person org cohort.

## Deliberately not in this batch

- **No Command Centre UI tab.** The route and its data exist; nothing
  renders it yet. This mirrors how the Recovery Routing Engine itself
  shipped (PR1 engine, PR2 server wiring, PR3 UI) and avoids combining a
  new data capability with new UI/navigation design in one batch.
- **No per-archetype or per-org breakdown.** This batch answers "which
  modules help, platform-wide" - slicing by archetype or Fingerprint
  profile is a natural follow-up once the top-level view exists, not
  something to invent speculatively now.
- **No Firestore index changes.** The route's one filter
  (`createdAt >= cutoff`) is a single-field inequality, which Firestore's
  default automatic indexing already covers for collection-group queries
  without an explicit entry in `firestore.indexes.json`.
