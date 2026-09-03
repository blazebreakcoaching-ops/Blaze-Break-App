import { describe, it, expect } from 'vitest';
import { computeClimateConcern, computeMoodConcern, computeOverallConcern, computeTrend, ClimateAverages } from './org-risk-trend';

describe('computeClimateConcern: the direction is the whole point - getting this backwards would flip good and bad', () => {
  const allBest: ClimateAverages = { demands: 5, control: 5, support: 5, relationships: 5, role: 5, change: 5 };
  const allWorst: ClimateAverages = { demands: 1, control: 1, support: 1, relationships: 1, role: 1, change: 1 };
  const midpoint: ClimateAverages = { demands: 3, control: 3, support: 3, relationships: 3, role: 3, change: 3 };

  it('a perfect average (everyone strongly agrees things are fine) means zero concern', () => {
    expect(computeClimateConcern(allBest)).toBe(0);
  });

  it('the worst possible average means maximum concern', () => {
    expect(computeClimateConcern(allWorst)).toBe(100);
  });

  it('the exact midpoint of the scale means half concern', () => {
    expect(computeClimateConcern(midpoint)).toBe(50);
  });

  it('a single weak dimension pulls the overall concern up, not down', () => {
    const oneWeakDimension: ClimateAverages = { demands: 2, control: 5, support: 5, relationships: 5, role: 5, change: 5 };
    const concern = computeClimateConcern(oneWeakDimension);
    expect(concern).not.toBe(0);
    expect(concern).toBeGreaterThan(0);
  });

  it('returns null for null input rather than a fake zero', () => {
    expect(computeClimateConcern(null)).toBeNull();
  });

  it('clamps an out-of-range value rather than producing a nonsensical result outside 0-100', () => {
    const outOfRange: ClimateAverages = { demands: 7, control: 3, support: 3, relationships: 3, role: 3, change: 3 };
    const concern = computeClimateConcern(outOfRange);
    expect(concern).toBeGreaterThanOrEqual(0);
    expect(concern).toBeLessThanOrEqual(100);
  });
});

describe('computeMoodConcern: a direct percentage, but still worth checking the edges', () => {
  it('all-negative mood pulses means 100 concern', () => {
    expect(computeMoodConcern(0, 10, 0)).toBe(100);
  });

  it('all-positive mood pulses means zero concern', () => {
    expect(computeMoodConcern(10, 0, 0)).toBe(0);
  });

  it('an even split of positive and negative, with some neutral, computes the negative share correctly', () => {
    expect(computeMoodConcern(4, 4, 2)).toBe(40);
  });

  it('returns null when there is no mood data at all, not a fake zero concern', () => {
    expect(computeMoodConcern(0, 0, 0)).toBeNull();
  });
});

describe('computeOverallConcern: combining whatever signals actually exist', () => {
  it('averages both signals when both are present', () => {
    expect(computeOverallConcern(40, 60)).toBe(50);
  });

  it('uses climate alone when mood data does not exist yet', () => {
    expect(computeOverallConcern(70, null)).toBe(70);
  });

  it('uses mood alone when climate survey has no responses yet', () => {
    expect(computeOverallConcern(null, 30)).toBe(30);
  });

  it('returns null, not zero, when neither signal exists - a brand new org should read as "not enough data", not as "no risk"', () => {
    expect(computeOverallConcern(null, null)).toBeNull();
  });
});

describe('computeTrend: real wellbeing signals move slowly - small noise should not read as a trend', () => {
  it('a large increase in concern is called worsening', () => {
    const result = computeTrend(60, 40);
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(20);
  });

  it('a large decrease in concern is called improving', () => {
    const result = computeTrend(30, 55);
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-25);
  });

  it('a change smaller than the stable threshold is called stable, not worsening or improving', () => {
    const result = computeTrend(42, 40);
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(2);
  });

  it('exactly zero change is stable', () => {
    const result = computeTrend(50, 50);
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(0);
  });

  it('is unknown, not stable or a fake zero delta, when there is no prior snapshot to compare against', () => {
    const result = computeTrend(50, null);
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  it('is unknown when the current score itself cannot be computed', () => {
    const result = computeTrend(null, 50);
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });
});
