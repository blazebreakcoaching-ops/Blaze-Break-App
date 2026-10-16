# Product Intelligence

Batch 1 for the "Product Intelligence" capability from the Operations
Intelligence Hub audit. The audit's own finding was "no analytics/
telemetry pipeline, no usage dashboards, no A/B testing infra." Building
a general-purpose telemetry pipeline or A/B testing framework from
scratch would be substantial, speculative infrastructure - this batch
instead found and used telemetry that already existed.

## What was found

Three features already record real, abstract, privacy-reviewed
usage events per user, entirely unread by anything: `grounding_analytics_events`
(Grounding/Rediscovery), `movement_analytics_events` (Movement Snacks),
and `recovery_recipes_analytics_events` (Recovery Recipes). Each event is
an enum `eventType` plus at most one taxonomy field (category, lens,
movementId, situationKey, stepType), validated server-side against a
fixed allowlist - by the original features' own design, specifically
built to be safe to aggregate (each route's own comment says so: "never
raw emotional text, private Nova content, faith preference, or journal
content"). Confirmed by searching the whole codebase: these three
collections are written to and never read anywhere else, not even by the
user who generated them.

## What's shipped

- `product-intelligence.ts`: a small pure engine -
  `countEventsByType` (most-frequent first), `countByDimension` (counts
  one optional taxonomy field, excluding events where it wasn't
  supplied), and `summarizeFeatureUsage` (bundles the above with a
  reliability-floor flag, reusing `checkCohortSufficiency` the same way
  Recovery Outcomes Intelligence does, and for the same reason: a feature
  with a handful of events shouldn't read as a loud, misleading
  percentage, but the real numbers are never hidden - this is platform-
  wide admin reporting, not per-person data needing withheld).
- `GET /api/admin/product-intelligence`: reads all three collections via
  `collectionGroup` queries bounded to a lookback window (90 days
  default, `?days=` capped at 365), same pattern as `GET
  /api/admin/recovery-outcomes`. Gated behind `content.manage` - same
  reasoning as that route.
- Response gives per-feature totals, an event-type breakdown, and the
  relevant taxonomy breakdown (grounding: category/lens; movement:
  movementId/category; recovery recipes: situationKey/stepType).

## Deliberately not in this batch

- **No Command Centre UI tab.** Same discipline as every other batch
  this session - the data and the route exist, nothing renders it yet.
- **No general-purpose telemetry pipeline or A/B testing framework.**
  This batch used telemetry that already existed; it does not build new
  instrumentation into other features, and does not attempt to build the
  "A/B testing infra" half of the original audit finding at all - that's
  a real, separate, much larger piece of work (experiment assignment,
  variant tracking, statistical significance) with no existing partial
  infrastructure to extend the way these three analytics-event
  collections provided here.
- **No session-level or per-user granularity in the admin view.** This
  is platform-wide aggregate counts only, consistent with how Recovery
  Outcomes Intelligence was scoped.
