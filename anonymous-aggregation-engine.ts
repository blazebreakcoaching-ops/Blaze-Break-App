// Anonymous Aggregation Engine - the single, reusable gate every
// organisation-facing aggregate route must pass data through before any
// numeric figure reaches a manager/HR/executive view. Pure functions only
// (no Firestore, no React) - this module decides WHETHER a cohort is safe
// to report on; the actual per-route aggregation math stays in server.ts,
// which already does real work here (see computeStrainSnapshotForCohort,
// computeMeetingLoadSnapshotForCohort) that this file does not duplicate.
//
// This formalises a k-anonymity check pattern that already existed,
// correctly, scattered across roughly a dozen call sites in server.ts
// (each reading org.privacyThreshold, comparing it against
// consentingUids.length, and returning {locked:true, cohortSize,
// threshold} below it) - the goal here is ONE place that check is defined,
// not a rewrite of logic that was already working. Only the clearest call
// site (GET /api/org/:orgId/dashboard) is migrated to use it in this PR;
// the rest are deliberately left as a follow-up rather than risking a
// large, hard-to-verify rewrite across every aggregate route at once.

export interface CohortSufficiency {
  sufficient: boolean;
  cohortSize: number;
  threshold: number;
}

// The one real question every org aggregate route has been asking inline:
// is this cohort large enough to report on without risking that a number
// could be traced back to one of the few people behind it?
export const checkCohortSufficiency = (cohortSize: number, threshold: number): CohortSufficiency =>
  ({ sufficient: cohortSize >= threshold, cohortSize, threshold });

// The consistent "we can't show this" response shape every aggregate
// route already converges on by hand - centralised so a future route
// can't accidentally omit a field (e.g. forgetting to echo `threshold`)
// that a dashboard's locked-state UI depends on.
export const buildLockedAggregateResponse = (
  sufficiency: CohortSufficiency,
  extra: Record<string, unknown> = {},
): { locked: true; cohortSize: number; threshold: number } & Record<string, unknown> =>
  ({ locked: true, cohortSize: sufficiency.cohortSize, threshold: sufficiency.threshold, ...extra });

// ---------- Filter-based re-identification guard ----------
//
// A distinct failure mode from "the organisation itself is too small":
// aViewer narrowing filters (Team=Finance + Location=London + Role=
// Analyst + Tenure=<1yr) can shrink an otherwise-safe org-wide cohort down
// to a handful of identifiable people, even though the unfiltered count
// passed the threshold just fine. The spec calls for a distinct message
// here ("This view is too specific to display safely") rather than the
// generic small-organisation message, since the cause and the fix are
// different (choose broader filters, vs nothing to do but wait for more
// people to opt in).
//
// No UI currently applies multiple narrowing filters to an org aggregate
// (per investigation: today's cohort checks only ever narrow by team, a
// single dimension) - so this guard has no real call site yet and is not
// registered as an enforced Protected Core invariant in this PR. It's
// built and fully unit-tested now so the later PR that adds genuine
// multi-dimension filtering (Workplace Intelligence & Governance's team
// comparison view) can wire it in immediately rather than reinventing it
// under time pressure once filtering actually exists.
export interface ReidentificationCheckResult {
  blocked: boolean;
  reason: 'too_specific' | 'cohort_too_small' | null;
  message: string | null;
}

// filterDimensionCount is how many independent narrowing filters are
// active (0 = no filtering, viewing the whole org/team) - used only to
// pick the right message, never to change the underlying threshold math:
// the same cohortSize < threshold comparison applies either way, because
// the privacy risk is identical regardless of why the group ended up
// small.
export const checkFilteredCohort = (
  cohortSize: number,
  threshold: number,
  filterDimensionCount: number,
): ReidentificationCheckResult => {
  if (cohortSize >= threshold) return { blocked: false, reason: null, message: null };
  if (filterDimensionCount > 0) {
    return {
      blocked: true,
      reason: 'too_specific',
      message: 'This view is too specific to display safely.',
    };
  }
  return {
    blocked: true,
    reason: 'cohort_too_small',
    message: 'Not shown — insufficient group size.',
  };
};
