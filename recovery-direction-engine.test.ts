import { describe, it, expect } from 'vitest';
import {
  computeCapacityTrend, computeDemandReductionTrend, computeRecoveryDirection, explainRecoveryDirection,
  CapacitySample,
} from './recovery-direction-engine';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const sample = (score: number, daysAgo: number): CapacitySample => ({ score, atMs: NOW - daysAgo * DAY });

describe('computeCapacityTrend', () => {
  it('is null (insufficient) with fewer than the minimum samples per half', () => {
    const samples = [sample(50, 10), sample(55, 2)];
    expect(computeCapacityTrend(samples).trend).toBeNull();
  });

  it('detects a clear rising trend', () => {
    const samples = [sample(30, 13), sample(35, 12), sample(70, 2), sample(75, 1)];
    expect(computeCapacityTrend(samples).trend).toBe('rising');
  });

  it('detects a clear falling trend', () => {
    const samples = [sample(80, 13), sample(85, 12), sample(40, 2), sample(35, 1)];
    expect(computeCapacityTrend(samples).trend).toBe('falling');
  });

  it('is stable when the half-over-half difference is within the threshold', () => {
    const samples = [sample(60, 13), sample(62, 12), sample(61, 2), sample(63, 1)];
    expect(computeCapacityTrend(samples).trend).toBe('stable');
  });

  it('reports the real sample count regardless of sufficiency', () => {
    expect(computeCapacityTrend([sample(50, 1)]).sampleCount).toBe(1);
  });

  it('splits by sample count after sorting by time, not by calendar proximity - an odd count drops the middle sample', () => {
    // 5 samples: sorted ascending, mid = floor(5/2) = 2, so the earlier half
    // is the first 2 and the later half is the last 2 - the middle sample
    // (index 2) belongs to neither half.
    const samples = [sample(50, 20), sample(52, 15), sample(999, 10), sample(70, 5), sample(75, 1)];
    const result = computeCapacityTrend(samples);
    expect(result.sampleCount).toBe(5);
    expect(result.trend).toBe('rising'); // avg(50,52)=51 vs avg(70,75)=72.5, ignoring the 999 middle outlier entirely.
  });
});

describe('computeDemandReductionTrend', () => {
  it('is null (no evidence) when nothing was resolved in either window', () => {
    expect(computeDemandReductionTrend(0, 0)).toBeNull();
  });

  it('is "more" when more was resolved recently', () => {
    expect(computeDemandReductionTrend(3, 1)).toBe('more');
  });

  it('is "fewer" when less was resolved recently', () => {
    expect(computeDemandReductionTrend(1, 3)).toBe('fewer');
  });

  it('is "same" when resolution counts match (and at least one is non-zero)', () => {
    expect(computeDemandReductionTrend(2, 2)).toBe('same');
  });
});

describe('computeRecoveryDirection', () => {
  it('is null when capacity history is insufficient, regardless of stressor evidence', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(50, 1)],
      resolvedStressorCountRecentHalf: 5,
      resolvedStressorCountPriorHalf: 0,
    });
    expect(result.band).toBeNull();
  });

  it('building_capacity: capacity rising, demand reduction not working against it', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(30, 13), sample(35, 12), sample(70, 2), sample(75, 1)],
      resolvedStressorCountRecentHalf: 2,
      resolvedStressorCountPriorHalf: 1,
    });
    expect(result.band).toBe('building_capacity');
  });

  it('under_more_pressure: capacity falling, demand reduction not compensating', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(80, 13), sample(85, 12), sample(40, 2), sample(35, 1)],
      resolvedStressorCountRecentHalf: 0,
      resolvedStressorCountPriorHalf: 0,
    });
    expect(result.band).toBe('under_more_pressure');
  });

  it('holding_steady: capacity stable', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(60, 13), sample(62, 12), sample(61, 2), sample(63, 1)],
      resolvedStressorCountRecentHalf: 0,
      resolvedStressorCountPriorHalf: 0,
    });
    expect(result.band).toBe('holding_steady');
  });

  it('mixed: capacity rising but demand reduction has actually gone backwards', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(30, 13), sample(35, 12), sample(70, 2), sample(75, 1)],
      resolvedStressorCountRecentHalf: 0,
      resolvedStressorCountPriorHalf: 3,
    });
    expect(result.band).toBe('mixed');
  });

  it('mixed: capacity falling but demand reduction has actually improved', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(80, 13), sample(85, 12), sample(40, 2), sample(35, 1)],
      resolvedStressorCountRecentHalf: 3,
      resolvedStressorCountPriorHalf: 0,
    });
    expect(result.band).toBe('mixed');
  });

  it('never shows a numeric score - only a band', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(30, 13), sample(35, 12), sample(70, 2), sample(75, 1)],
      resolvedStressorCountRecentHalf: 0,
      resolvedStressorCountPriorHalf: 0,
    });
    expect(typeof result.band).toBe('string');
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('value');
  });
});

describe('explainRecoveryDirection', () => {
  it('is honest about insufficient data', () => {
    const result = computeRecoveryDirection({ recentCapacitySamples: [], resolvedStressorCountRecentHalf: 0, resolvedStressorCountPriorHalf: 0 });
    expect(explainRecoveryDirection(result, 14)).toMatch(/not enough/i);
  });

  it('cites the real lookback window and what the trend is based on when sufficient', () => {
    const result = computeRecoveryDirection({
      recentCapacitySamples: [sample(30, 13), sample(35, 12), sample(70, 2), sample(75, 1)],
      resolvedStressorCountRecentHalf: 0,
      resolvedStressorCountPriorHalf: 0,
    });
    const explanation = explainRecoveryDirection(result, 14);
    expect(explanation).toContain('14 days');
    expect(explanation.toLowerCase()).toContain('capacity check-ins');
  });
});
