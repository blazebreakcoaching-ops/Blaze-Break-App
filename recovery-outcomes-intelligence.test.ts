import { describe, it, expect } from 'vitest';
import { summarizeModuleOutcomes, RoutingDecisionRecord } from './recovery-outcomes-intelligence';

const decision = (overrides: Partial<RoutingDecisionRecord>): RoutingDecisionRecord => ({
  selectedModule: 'breathing_reset',
  ...overrides,
});

describe('summarizeModuleOutcomes', () => {
  it('ignores decisions with no selected module (NONE outcomes)', () => {
    const summaries = summarizeModuleOutcomes([decision({ selectedModule: null })]);
    expect(summaries).toEqual([]);
  });

  it('counts recommended/resolved/completed/declined/abandoned correctly', () => {
    const decisions = [
      decision({ outcome: 'completed', helpfulness: 'better' }),
      decision({ outcome: 'completed', helpfulness: 'same' }),
      decision({ outcome: 'declined' }),
      decision({ outcome: 'abandoned' }),
      decision({ outcome: undefined }), // recommended but never resolved
    ];
    const [summary] = summarizeModuleOutcomes(decisions, 1);
    expect(summary.module).toBe('breathing_reset');
    expect(summary.recommended).toBe(5);
    expect(summary.resolved).toBe(4); // excludes the unresolved one
    expect(summary.completed).toBe(2);
    expect(summary.declined).toBe(1);
    expect(summary.abandoned).toBe(1);
    expect(summary.completionRate).toBe(0.5); // 2/4
  });

  it('computes netPositiveRate excluding not_sure from the denominator', () => {
    const decisions = [
      decision({ outcome: 'completed', helpfulness: 'better' }),
      decision({ outcome: 'completed', helpfulness: 'better' }),
      decision({ outcome: 'completed', helpfulness: 'same' }),
      decision({ outcome: 'completed', helpfulness: 'not_really' }),
      decision({ outcome: 'completed', helpfulness: 'not_sure' }),
    ];
    const [summary] = summarizeModuleOutcomes(decisions, 1);
    expect(summary.helpfulness).toEqual({ better: 2, same: 1, not_really: 1, not_sure: 1 });
    // better=2 / (better+same+not_really=4) = 0.5, not_sure excluded entirely
    expect(summary.netPositiveRate).toBe(0.5);
  });

  it('returns null rates when there is no data to compute them from', () => {
    const [summary] = summarizeModuleOutcomes([decision({ outcome: undefined })], 1);
    expect(summary.completionRate).toBeNull();
    expect(summary.netPositiveRate).toBeNull();
  });

  it('gates sufficientSample on the resolved count, not the raw recommended count', () => {
    const decisions = [
      decision({ outcome: 'completed', helpfulness: 'better' }),
      decision({ outcome: undefined }),
      decision({ outcome: undefined }),
      decision({ outcome: undefined }),
    ];
    // 4 recommended, but only 1 resolved - below a threshold of 2.
    const [summary] = summarizeModuleOutcomes(decisions, 2);
    expect(summary.resolved).toBe(1);
    expect(summary.sufficientSample).toBe(false);

    const [sufficientSummary] = summarizeModuleOutcomes(decisions, 1);
    expect(sufficientSummary.sufficientSample).toBe(true);
  });

  it('separates modules and sorts by recommended count, most first', () => {
    const decisions = [
      decision({ selectedModule: 'anxiety_reset', outcome: 'completed', helpfulness: 'better' }),
      decision({ selectedModule: 'breathing_reset', outcome: 'completed', helpfulness: 'better' }),
      decision({ selectedModule: 'breathing_reset', outcome: 'declined' }),
    ];
    const summaries = summarizeModuleOutcomes(decisions, 1);
    expect(summaries.map((s) => s.module)).toEqual(['breathing_reset', 'anxiety_reset']);
    expect(summaries[0].recommended).toBe(2);
    expect(summaries[1].recommended).toBe(1);
  });

  it('defaults to DEFAULT_OUTCOME_SAMPLE_THRESHOLD (20) when no threshold is given', () => {
    const decisions = Array.from({ length: 19 }, () => decision({ outcome: 'completed', helpfulness: 'better' }));
    const [summary] = summarizeModuleOutcomes(decisions);
    expect(summary.sufficientSample).toBe(false);
    expect(summary.sampleThreshold).toBe(20);
  });
});
