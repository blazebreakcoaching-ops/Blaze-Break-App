import { describe, it, expect } from 'vitest';
import {
  defaultNudgePreferences, normaliseNudgePreferences,
  isLivePreferenceOwner,
} from './notification-preferences';

describe('safe notification preferences', () => {
  it('starts with nudges disabled for an unknown account', () => {
    expect(defaultNudgePreferences().notificationsEnabled).toBe(false);
    expect(normaliseNudgePreferences(null).notificationsEnabled).toBe(false);
  });
  it('rejects malformed or unexpected preference fields', () => {
    const result = normaliseNudgePreferences({
      notificationsEnabled: 'true',
      nudgeFrequency: 'maximum',
      quietHoursStart: '25:99',
      quietHoursEnd: '07:45',
      allowedNudgeCategories: ['check_in_reminder', false, 10],
    });
    expect(result.notificationsEnabled).toBe(false);
    expect(result.nudgeFrequency).toBe('low');
    expect(result.quietHoursStart).toBe('20:00');
    expect(result.quietHoursEnd).toBe('07:45');
    expect(result.allowedNudgeCategories).toEqual(['check_in_reminder']);
  });
  it('never applies a delayed read from the previous account', () => {
    expect(isLivePreferenceOwner('A', 'B', false)).toBe(false);
    expect(isLivePreferenceOwner('A', 'A', true)).toBe(false);
    expect(isLivePreferenceOwner('A', 'A', false)).toBe(true);
    expect(isLivePreferenceOwner('A', null, false)).toBe(false);
  });
});
