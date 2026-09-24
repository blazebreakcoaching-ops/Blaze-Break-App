import { describe, it, expect } from 'vitest';
import { isDemoUser, DEMO_FINGERPRINT, DEMO_STATS, DEMO_VELOCITY_MAP, DEMO_ENERGY_COMMITMENTS, DEMO_DERIVED_SUMMARIES } from './demo-data';
import { BurnoutProfile } from '../types';

// The exact, real archetype names this app uses - kept as a literal list
// here (not imported as a type) so this test fails loudly if
// DEMO_FINGERPRINT.profile is ever changed to something outside this set,
// rather than silently type-checking against whatever the union happens
// to allow.
const REAL_BURNOUT_PROFILES: BurnoutProfile[] = [
  'High-Functioning Exhausted',
  'Over-Giver',
  'Silent Resenter',
  'Founder on Fire',
  'Manager in the Middle',
  'The Impostor',
  'The Perfectionist',
  'The Constant Adapter',
  'The Second Shift',
  'Crisis Sprinter',
  'People-Pleasing Performer',
  'Responsibility Addict',
];

describe('isDemoUser', () => {
  it('is true for an anonymous visitor with no saved profile name', () => {
    expect(isDemoUser(true, undefined)).toBe(true);
  });

  it('is true for an anonymous visitor with an empty profile name', () => {
    expect(isDemoUser(true, '')).toBe(true);
  });

  it('is false once an anonymous session has a real saved profile name', () => {
    expect(isDemoUser(true, 'Real Name')).toBe(false);
  });

  it('is false for a real (non-anonymous) signed-in user, regardless of name', () => {
    expect(isDemoUser(false, undefined)).toBe(false);
    expect(isDemoUser(false, 'Real Name')).toBe(false);
  });
});

describe('DEMO_FINGERPRINT', () => {
  it('reuses one of the app\'s real, established archetypes - never an invented one', () => {
    expect(REAL_BURNOUT_PROFILES).toContain(DEMO_FINGERPRINT.profile);
  });
});

describe('DEMO_STATS', () => {
  it('has nonzero points and streak, so isBrandNewUser() treats it as an established account', () => {
    expect(DEMO_STATS.points).toBeGreaterThan(0);
    expect(DEMO_STATS.streak).toBeGreaterThan(0);
  });

  it('never carries a real-sounding invented name', () => {
    expect(DEMO_STATS.profile?.fullName).toBe('Sample Account');
  });

  it('starts with an empty support circle, so no sample contact ever reaches Firestore via migrateSupportCircleIfNeeded', () => {
    expect(DEMO_STATS.supportCircle).toEqual([]);
  });
});

describe('DEMO_VELOCITY_MAP', () => {
  it('has a two-week span of realistic 0-100 output/recovery values', () => {
    expect(DEMO_VELOCITY_MAP.length).toBe(14);
    for (const day of DEMO_VELOCITY_MAP) {
      expect(day.energyOutput).toBeGreaterThan(0);
      expect(day.energyOutput).toBeLessThanOrEqual(100);
      expect(day.recoveryInput).toBeGreaterThan(0);
      expect(day.recoveryInput).toBeLessThanOrEqual(100);
    }
  });

  it('narrows toward balance by the end, consistent with DEMO_PULSE_HISTORY\'s upward trend', () => {
    const first = DEMO_VELOCITY_MAP[0];
    const last = DEMO_VELOCITY_MAP[DEMO_VELOCITY_MAP.length - 1];
    expect(first.energyOutput - first.recoveryInput).toBeGreaterThan(last.energyOutput - last.recoveryInput);
  });
});

describe('DEMO_ENERGY_COMMITMENTS', () => {
  it('is every entry tagged isSample so EnergyBudgetMatrix never writes them to Firestore', () => {
    expect(DEMO_ENERGY_COMMITMENTS.length).toBeGreaterThan(0);
    for (const c of DEMO_ENERGY_COMMITMENTS) {
      expect(c.isSample).toBe(true);
    }
  });

  it('has at least one active and one resolved commitment, for a populated-looking ledger', () => {
    expect(DEMO_ENERGY_COMMITMENTS.some(c => c.status === 'active')).toBe(true);
    expect(DEMO_ENERGY_COMMITMENTS.some(c => c.status !== 'active')).toBe(true);
  });
});

describe('DEMO_DERIVED_SUMMARIES', () => {
  const EXPECTED_TYPES = ['recovery_debt', 'recovery_velocity', 'energy_trend', 'mood_trend'];

  it('has all four card types, each marked available with a real value', () => {
    for (const type of EXPECTED_TYPES) {
      const summary = DEMO_DERIVED_SUMMARIES[type];
      expect(summary).toBeTruthy();
      expect(summary.type).toBe(type);
      expect(summary.status).toBe('available');
      expect(summary.value).toBeGreaterThan(0);
    }
  });
});
