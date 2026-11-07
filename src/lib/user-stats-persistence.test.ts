import { describe, expect, it } from 'vitest';
import type { UserStats } from '../types';
import { statsForSafeWrite } from './user-stats-persistence';

const original: UserStats = {
  points: 150, streak: 2, rehearsalCount: 1, lastEngagementDate: '2026-11-07',
  unlockedBadges: ['first_step'], committedActionIds: ['start'],
  supportCircle: [{ id: 'test-1' } as UserStats['supportCircle'][number]],
  profile: {
    fullName: 'Test User', role: '', organization: '',
    subscription: 'premium' as UserStats['profile'] extends infer _T ? any : never,
    letNovaLearn: false,
    questioningStyle: null,
  },
};

describe('Firestore user_stats/core autosave payload', () => {
  it('removes the legacy profile subscription field that rules prohibit', () => {
    const payload = statsForSafeWrite(original);
    expect(payload.profile).not.toHaveProperty('subscription');
    expect(payload.profile).toHaveProperty('fullName', 'Test User');
    expect(payload.profile).toHaveProperty('letNovaLearn', false);
    expect(payload.profile).toHaveProperty('questioningStyle', null);
  });

  it('does not copy support contacts back into the unvalidated stats document', () => {
    expect(statsForSafeWrite(original)).not.toHaveProperty('supportCircle');
  });

  it('preserves recovery points and other legitimate stats', () => {
    const payload = statsForSafeWrite(original);
    expect(payload.points).toBe(150);
    expect(payload.unlockedBadges).toEqual(['first_step']);
    expect(payload.committedActionIds).toEqual(['start']);
  });

  it('strips undefined data without modifying the original account object', () => {
    const payload = statsForSafeWrite({
      ...original,
      profile: { ...original.profile!, novaTone: undefined },
      recoveryScore: undefined,
    });
    expect(payload).not.toHaveProperty('recoveryScore');
    expect(payload.profile).not.toHaveProperty('novaTone');
    expect(original.profile).toHaveProperty('subscription', 'premium');
  });
});
