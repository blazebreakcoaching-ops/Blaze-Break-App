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
- **No per-archetype breakdown.** This batch answers "which modules
  help, platform-wide" - slicing by archetype or Fingerprint profile is
  a natural follow-up once the top-level view exists, not something to
  invent speculatively now.
- **No Firestore index changes.** The route's one filter
  (`createdAt >= cutoff`) is a single-field inequality, which Firestore's
  default automatic indexing already covers for collection-group queries
  without an explicit entry in `firestore.indexes.json`.

## Why there is no org-scoped (B2B) variant, and will not be one

`recovery_routing_decisions` records which recovery module was
recommended to someone - Breathing Reset, Anxiety Reset, Decompression
Doorway, etc. That is squarely **Lane A, the Private Recovery Vault** -
the exact class of data `docs/TEAM_WELFARE_DASHBOARDS.md` and the
comments above `GET /api/org/:orgId/dashboard` in `server.ts` already
state, deliberately and in hard terms, "must be server-side unreachable
by an organisation-scoped route, not just k-anonymity-aggregated." The
Lane Separation Remediation project (see that doc's history) retired an
earlier feature that let org-facing code read this exact kind of
personal wellbeing signal, for real, documented reasons: it breaks the
product's own safety premise (using a mental-health-adjacent tool stops
being safe the moment an employee's manager could see it), and creates
real DPIA/Betriebsrat exposure under UK ICO and German works-council law.
That document is explicit that even a fully anonymous, no-detail
"activity" metric was rejected for manager/HR views - not only granular
data - so there is no lesser-aggregated version of this that would be
safe to build for an org admin. The platform-admin route above is a
different risk entirely (Blaze Break's own staff doing product analytics
across the whole base, not an employer watching its employees), which is
why it was built and this is not.

## Member-facing variant (also shipped this batch)

`GET /api/recovery/my-outcomes` runs the identical
`summarizeModuleOutcomes` math over just the caller's own
`recovery_routing_decisions` subcollection - "which of my own recommended
modules have actually helped me." This has no Lane A conflict: it is the
person looking at their own data, the same category every other
member-facing recovery feature in this app already reads and writes.
Two differences from the admin route, both deliberate:

- **Lower reliability threshold (3, not 20)** - "have I tried this
  enough times to trust the pattern" is a different question at personal
  scale than "is this platform-wide number statistically noisy."
- **Never hides a module below threshold.** The admin route's
  `sufficientSample` flag exists to withhold an unreliable platform
  figure; for a person's own history, hiding their own data from them
  would be wrong regardless of sample size - the flag here is for an
  eventual UI to show an honest "early days, N tries so far" caveat, not
  a reason to omit the module from the response.
