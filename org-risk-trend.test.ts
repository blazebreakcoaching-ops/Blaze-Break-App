import { describe, it, expect } from 'vitest';
import { computeClimateStrain, computeClimateStrainByDimension, computeMoodStrain, computeOverallStrain, computeTrend, ClimateAverages } from './org-risk-trend';

describe('computeClimateStrain: the direction is the whole point - getting this backwards would flip good and bad', () => {
  const allBest: ClimateAverages = { demands: 5, control: 5, support: 5, relationships: 5, role: 5, change: 5 };
  const allWorst: ClimateAverages = { demands: 1, control: 1, support: 1, relationships: 1, role: 1, change: 1 };
  const midpoint: ClimateAverages = { demands: 3, control: 3, support: 3, relationships: 3, role: 3, change: 3 };

  it('a perfect average (everyone strongly agrees things are fine) means zero strain', () => {
    expect(computeClimateStrain(allBest)).toBe(0);
  });

  it('the worst possible average means maximum strain', () => {
    expect(computeClimateStrain(allWorst)).toBe(100);
  });

  it('the exact midpoint of the scale means half strain', () => {
    expect(computeClimateStrain(midpoint)).toBe(50);
  });

  it('a single weak dimension pulls the overall strain up, not down', () => {
    const oneWeakDimension: ClimateAverages = { demands: 2, control: 5, support: 5, relationships: 5, role: 5, change: 5 };
    const strain = computeClimateStrain(oneWeakDimension);
    expect(strain).not.toBe(0);
    expect(strain).toBeGreaterThan(0);
  });

  it('returns null for null input rather than a fake zero', () => {
    expect(computeClimateStrain(null)).toBeNull();
  });

  it('clamps an out-of-range value rather than producing a nonsensical result outside 0-100', () => {
    const outOfRange: ClimateAverages = { demands: 7, control: 3, support: 3, relationships: 3, role: 3, change: 3 };
    const strain = computeClimateStrain(outOfRange);
    expect(strain).toBeGreaterThanOrEqual(0);
    expect(strain).toBeLessThanOrEqual(100);
  });
});

describe('computeClimateStrainByDimension: the whole point is telling demands apart from support', () => {
  it('a single weak dimension shows up clearly as its own high number, not hidden in an average', () => {
    const oneWeakDimension: ClimateAverages = { demands: 1, control: 5, support: 5, relationships: 5, role: 5, change: 5 };
    const byDim = computeClimateStrainByDimension(oneWeakDimension);
    expect(byDim?.demands).toBe(100);
    expect(byDim?.control).toBe(0);
    expect(byDim?.support).toBe(0);
    expect(byDim?.relationships).toBe(0);
    expect(byDim?.role).toBe(0);
    expect(byDim?.change).toBe(0);
  });

  it('two different weak dimensions are both visible independently', () => {
    const twoWeak: ClimateAverages = { demands: 1, control: 5, support: 1, relationships: 5, role: 5, change: 5 };
    const byDim = computeClimateStrainByDimension(twoWeak);
    expect(byDim?.demands).toBe(100);
    expect(byDim?.support).toBe(100);
    expect(byDim?.control).toBe(0);
  });

  it('the blended score and the per-dimension scores agree when every dimension is equal', () => {
    const uniform: ClimateAverages = { demands: 2, control: 2, support: 2, relationships: 2, role: 2, change: 2 };
    const blended = computeClimateStrain(uniform);
    const byDim = computeClimateStrainByDimension(uniform);
    expect(byDim?.demands).toBe(blended);
    expect(byDim?.control).toBe(blended);
  });

  it('returns null for null input rather than a fake zero', () => {
    expect(computeClimateStrainByDimension(null)).toBeNull();
  });
});

describe('computeMoodStrain: a direct percentage, but still worth checking the edges', () => {
  it('all-negative mood pulses means 100 strain', () => {
    expect(computeMoodStrain(0, 10, 0)).toBe(100);
  });

  it('all-positive mood pulses means zero strain', () => {
    expect(computeMoodStrain(10, 0, 0)).toBe(0);
  });

  it('an even split of positive and negative, with some neutral, computes the negative share correctly', () => {
    expect(computeMoodStrain(4, 4, 2)).toBe(40);
  });

  it('returns null when there is no mood data at all, not a fake zero strain', () => {
    expect(computeMoodStrain(0, 0, 0)).toBeNull();
  });
});

describe('computeOverallStrain: combining whatever signals actually exist', () => {
  it('averages both signals when both are present', () => {
    expect(computeOverallStrain(40, 60)).toBe(50);
  });

  it('uses climate alone when mood data does not exist yet', () => {
    expect(computeOverallStrain(70, null)).toBe(70);
  });

  it('uses mood alone when climate survey has no responses yet', () => {
    expect(computeOverallStrain(null, 30)).toBe(30);
  });

  it('returns null, not zero, when neither signal exists - a brand new org should read as "not enough data", not as "no risk"', () => {
    expect(computeOverallStrain(null, null)).toBeNull();
  });
});

describe('computeTrend: real wellbeing signals move slowly - small noise should not read as a trend', () => {
  it('a large increase in strain is called worsening', () => {
    const result = computeTrend(60, 40);
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(20);
  });

  it('a large decrease in strain is called improving', () => {
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
