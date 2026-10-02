import { describe, it, expect } from 'vitest';
import {
  computeSleepShortfall, computeMentalFatigue, computeSocialLoad, SleepNight,
} from './recovery-debt-engine';
import { Stressor } from './energy-delta-engine';

describe('computeSleepShortfall', () => {
  it('returns null with no nights logged - never a fabricated 0', () => {
    expect(computeSleepShortfall(8, [])).toBeNull();
  });

  it('averages the shortfall across logged nights', () => {
    const nights: SleepNight[] = [{ date: '2026-01-01', hours: 6 }, { date: '2026-01-02', hours: 7 }];
    // shortfalls: 2, 1 -> average 1.5
    expect(computeSleepShortfall(8, nights)).toBe(1.5);
  });

  it('floors a night of more sleep than target at zero shortfall, never negative', () => {
    const nights: SleepNight[] = [{ date: '2026-01-01', hours: 9 }, { date: '2026-01-02', hours: 6 }];
    // shortfalls: 0, 2 -> average 1
    expect(computeSleepShortfall(8, nights)).toBe(1);
  });

  it('only looks at the most recent 7 nights', () => {
    const nights: SleepNight[] = Array.from({ length: 10 }, (_, i) => ({ date: `2026-01-${10 + i}`, hours: i < 3 ? 2 : 8 }));
    // the first 3 (shortfall 6 each) fall outside the 7-night window
    expect(computeSleepShortfall(8, nights)).toBe(0);
  });
});

describe('computeMentalFatigue', () => {
  it('returns null with no check-in yet', () => {
    expect(computeMentalFatigue(null)).toBeNull();
  });

  it('maps very_low and low mental capacity to high fatigue', () => {
    expect(computeMentalFatigue('very_low')).toBe('high');
    expect(computeMentalFatigue('low')).toBe('high');
  });

  it('maps okay to moderate fatigue', () => {
    expect(computeMentalFatigue('okay')).toBe('moderate');
  });

  it('maps good and strong to low fatigue', () => {
    expect(computeMentalFatigue('good')).toBe('low');
    expect(computeMentalFatigue('strong')).toBe('low');
  });
});

describe('computeSocialLoad', () => {
  const stressor = (overrides: Partial<Pick<Stressor, 'severity' | 'persistence' | 'capacityAtLogging'>> = {}): Pick<Stressor, 'severity' | 'persistence' | 'capacityAtLogging'> => ({
    severity: 3, persistence: 'repeated', capacityAtLogging: null, ...overrides,
  });

  it('returns a null band with zero social stressors logged - never a fabricated 0', () => {
    const result = computeSocialLoad([]);
    expect(result.band).toBeNull();
    expect(result.commitmentCount).toBe(0);
    expect(result.acceptedWhileLow).toBe(false);
  });

  it('bands a single light commitment as low', () => {
    const result = computeSocialLoad([stressor({ severity: 1, persistence: 'one_off' })]);
    expect(result.band).toBe('low');
    expect(result.commitmentCount).toBe(1);
  });

  it('bands several heavy, ongoing commitments as high', () => {
    const result = computeSocialLoad([
      stressor({ severity: 5, persistence: 'ongoing' }),
      stressor({ severity: 4, persistence: 'ongoing' }),
    ]);
    expect(result.band).toBe('high');
  });

  it('flags when at least one commitment was logged while capacity was already low', () => {
    const result = computeSocialLoad([stressor({ capacityAtLogging: 30 }), stressor({ capacityAtLogging: 70 })]);
    expect(result.acceptedWhileLow).toBe(true);
  });

  it('does not flag acceptedWhileLow when capacity at logging was never known', () => {
    const result = computeSocialLoad([stressor({ capacityAtLogging: null }), stressor({ capacityAtLogging: undefined })]);
    expect(result.acceptedWhileLow).toBe(false);
  });
});
