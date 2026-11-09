import { describe, it, expect } from 'vitest';
import { summarizeModuleOutcomes, summarizePlatformModuleOutcomes, summarizeAdaptiveOutcomes, RoutingDecisionRecord } from './recovery-outcomes-intelligence';

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

describe('summarizePlatformModuleOutcomes (rate denominator gate)', () => {
  it('masks misleading early rates on administrator views', () => {
    const rows = [decision({ outcome: 'completed', helpfulness: 'better' })];
    const [platform] = summarizePlatformModuleOutcomes(rows);
    expect(platform).toMatchObject({ resolved: 1, completionRate: null, netPositiveRate: null, sufficientSample: false });
    // Personal reporting remains unchanged: a user may see early own data.
    const [personal] = summarizeModuleOutcomes(rows, 3);
    expect(personal).toMatchObject({ resolved: 1, completionRate: 1, netPositiveRate: 1, sufficientSample: false });
  });
  it('does not reveal a rate from one rating despite enough completed interventions', () => {
    const rows = [
      decision({ outcome: 'completed', helpfulness: 'better' }),
      ...Array.from({ length: 19 }, () => decision({ outcome: 'completed', helpfulness: 'not_sure' })),
    ];
    const [summary] = summarizePlatformModuleOutcomes(rows);
    expect(summary).toMatchObject({ resolved: 20, completionRate: 1, sufficientSample: true, netPositiveRate: null });
  });
  it('shows rates when both their own denominators are sufficiently large', () => {
    const rows = Array.from({ length: 20 }, (_, i) => decision({
      outcome: 'completed', helpfulness: i < 10 ? 'better' : 'same',
    }));
    expect(summarizePlatformModuleOutcomes(rows)[0]).toMatchObject({
      resolved: 20, completionRate: 1, netPositiveRate: 0.5,
    });
  });
});

describe('summarizeAdaptiveOutcomes (evidence not inference)', () => {
  it('compares recorded adapted/standard outcomes, not legacy unknowns', () => {
    const rows = [
      decision({ outcome: 'completed', helpfulness: 'better', adaptiveLearningUsed: true }),
      decision({ outcome: 'completed', helpfulness: 'same', adaptiveLearningUsed: true }),
      decision({ outcome: 'completed', helpfulness: 'not_really', adaptiveLearningUsed: false }),
      decision({ outcome: 'completed', helpfulness: 'not_really', adaptiveLearningUsed: false }),
      decision({ outcome: 'completed', helpfulness: 'better' }),
      decision({ outcome: 'completed', helpfulness: 'not_sure' }),
      decision({ selectedModule: null, outcome: 'completed', helpfulness: 'better', adaptiveLearningUsed: true }),
    ];
    const c = summarizeAdaptiveOutcomes(rows, 2);
    expect(c.adapted).toMatchObject({ rated: 2, positive: 1, positiveRate: 0.5, sufficientSample: true });
    expect(c.standard).toMatchObject({ rated: 2, positive: 0, positiveRate: 0, sufficientSample: true });
    expect(c.unknownProvenance).toBe(1);
    expect(c.caveat).toContain('not causal');
  });
  it('does not show rates below the sample threshold', () => {
    const c = summarizeAdaptiveOutcomes([decision({ outcome: 'completed', helpfulness: 'better', adaptiveLearningUsed: true })]);
    expect(c.adapted).toMatchObject({ rated: 1, positiveRate: null, sufficientSample: false });
    expect(c.standard).toMatchObject({ rated: 0, positiveRate: null, sufficientSample: false });
  });
});
