import { describe, it, expect } from 'vitest';
import { checkCohortSufficiency, buildLockedAggregateResponse, checkFilteredCohort } from './anonymous-aggregation-engine';

describe('checkCohortSufficiency', () => {
  it('sufficient when cohort size meets the threshold exactly', () => {
    expect(checkCohortSufficiency(5, 5)).toEqual({ sufficient: true, cohortSize: 5, threshold: 5 });
  });

  it('sufficient when cohort size exceeds the threshold', () => {
    expect(checkCohortSufficiency(12, 5).sufficient).toBe(true);
  });

  it('insufficient when cohort size is below the threshold', () => {
    expect(checkCohortSufficiency(4, 5).sufficient).toBe(false);
  });

  it('insufficient for an empty cohort against any positive threshold', () => {
    expect(checkCohortSufficiency(0, 1).sufficient).toBe(false);
  });
});

describe('buildLockedAggregateResponse', () => {
  it('always carries locked:true and echoes the real cohort size and threshold', () => {
    const sufficiency = checkCohortSufficiency(2, 5);
    expect(buildLockedAggregateResponse(sufficiency)).toEqual({ locked: true, cohortSize: 2, threshold: 5 });
  });

  it('merges in route-specific extra fields (e.g. an empty suggestions array) without dropping the core shape', () => {
    const sufficiency = checkCohortSufficiency(2, 5);
    expect(buildLockedAggregateResponse(sufficiency, { suggestions: [] })).toEqual({
      locked: true, cohortSize: 2, threshold: 5, suggestions: [],
    });
  });
});

describe('checkFilteredCohort', () => {
  it('never blocks when the cohort meets the threshold, regardless of filter count', () => {
    expect(checkFilteredCohort(10, 5, 3)).toEqual({ blocked: false, reason: null, message: null });
  });

  it('blocks with the generic small-cohort message when no filters are active', () => {
    const result = checkFilteredCohort(2, 5, 0);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('cohort_too_small');
    expect(result.message).toBe('Not shown — insufficient group size.');
  });

  it('blocks with the distinct over-narrow-filter message when the shortfall followed from active filters', () => {
    const result = checkFilteredCohort(2, 5, 4);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('too_specific');
    expect(result.message).toBe('This view is too specific to display safely.');
  });

  it('the same cohortSize < threshold math applies either way - only the message differs', () => {
    const unfiltered = checkFilteredCohort(2, 5, 0);
    const filtered = checkFilteredCohort(2, 5, 2);
    expect(unfiltered.blocked).toBe(filtered.blocked);
    expect(unfiltered.message).not.toBe(filtered.message);
  });
});
