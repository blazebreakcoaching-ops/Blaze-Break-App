import { describe, it, expect } from 'vitest';
import { detectFuelPatterns, FUEL_PATTERN_COPY, FuelLogEntry } from './recovery-fuel-patterns';

const days = (n: number, entry: FuelLogEntry): FuelLogEntry[] => Array.from({ length: n }, () => ({ ...entry }));

describe('detectFuelPatterns', () => {
  it('returns nothing with fewer than 4 logged days, no matter how bad they were', () => {
    const logs = days(3, { hasEaten: false, shakyIrritable: true, hydrationGlasses: 0 });
    expect(detectFuelPatterns(logs)).toEqual([]);
  });

  it('returns nothing when a behaviour only shows up on a minority of logged days', () => {
    // 3 of 7 skipped - not a majority, so no nag over an occasional bad day
    const logs = [
      ...days(3, { hasEaten: false }),
      ...days(4, { hasEaten: true }),
    ];
    expect(detectFuelPatterns(logs)).toEqual([]);
  });

  it('flags skipped_meals once it is strictly more than half of logged days', () => {
    const logs = [
      ...days(4, { hasEaten: false }),
      ...days(3, { hasEaten: true }),
    ];
    const result = detectFuelPatterns(logs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'skipped_meals', daysAffected: 4, loggedDays: 7 });
  });

  it('treats skippedBreakfast:true the same as hasEaten:false for the meal-gap pattern', () => {
    const logs = [
      ...days(4, { skippedBreakfast: true }),
      ...days(3, {}),
    ];
    expect(detectFuelPatterns(logs).map((p) => p.id)).toEqual(['skipped_meals']);
  });

  it('excludes alcohol_frequent when includeAlcohol is false, even if the raw data qualifies', () => {
    const logs = days(5, { alcoholLogged: true });
    expect(detectFuelPatterns(logs, { includeAlcohol: false })).toEqual([]);
    expect(detectFuelPatterns(logs, { includeAlcohol: true }).map((p) => p.id)).toEqual(['alcohol_frequent']);
  });

  it('returns multiple genuine patterns in a fixed, most-significant-first priority order', () => {
    const logs = days(5, {
      hasEaten: false,
      alcoholLogged: true,
      shakyIrritable: true,
      hydrationGlasses: 2,
      caffeineTiming: 'late',
      morningLight: false,
    });
    const result = detectFuelPatterns(logs, { includeAlcohol: true });
    expect(result.map((p) => p.id)).toEqual([
      'skipped_meals',
      'alcohol_frequent',
      'shaky_irritable',
      'low_hydration',
      'late_caffeine',
      'no_morning_light',
    ]);
  });

  it('never flags a pattern for a stable week', () => {
    const logs = days(7, {
      hasEaten: true,
      alcoholLogged: false,
      shakyIrritable: false,
      hydrationGlasses: 7,
      caffeineTiming: 'early',
      morningLight: true,
    });
    expect(detectFuelPatterns(logs)).toEqual([]);
  });

  it('has matching copy (title, description, coaching, nudgeMessage) for every pattern id it can produce', () => {
    const logs = days(5, {
      hasEaten: false,
      alcoholLogged: true,
      shakyIrritable: true,
      hydrationGlasses: 2,
      caffeineTiming: 'late',
      morningLight: false,
    });
    const result = detectFuelPatterns(logs, { includeAlcohol: true });
    for (const pattern of result) {
      const copy = FUEL_PATTERN_COPY[pattern.id];
      expect(copy).toBeDefined();
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
      expect(copy.coaching.length).toBeGreaterThan(0);
      const msg = copy.nudgeMessage(pattern);
      expect(msg).toContain(String(pattern.daysAffected));
      expect(msg).toContain(String(pattern.loggedDays));
    }
  });

  it('keeps every nudge message free of shaming or pressuring language', () => {
    const logs = days(5, {
      hasEaten: false,
      alcoholLogged: true,
      shakyIrritable: true,
      hydrationGlasses: 2,
      caffeineTiming: 'late',
      morningLight: false,
    });
    const result = detectFuelPatterns(logs, { includeAlcohol: true });
    for (const pattern of result) {
      const msg = FUEL_PATTERN_COPY[pattern.id].nudgeMessage(pattern).toLowerCase();
      expect(msg).not.toMatch(/streak|overdue|behind|forgot|should|must|fail/);
    }
  });
});
