import { describe, it, expect } from 'vitest';
import { isDemoUser, DEMO_FINGERPRINT, DEMO_STATS } from './demo-data';
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
