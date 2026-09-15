import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getEffectiveNotificationPreferences,
  isWithinQuietHours,
  routeNotification,
} from './notification-router';

describe('getEffectiveNotificationPreferences', () => {
  it('an account with no stored preferences gets the sensible default', () => {
    expect(getEffectiveNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('an invalid stored frequency falls back to the default rather than being trusted', () => {
    expect(getEffectiveNotificationPreferences({ nudgeFrequency: 'constant' } as any).nudgeFrequency).toBe('supportive');
  });

  it('an out-of-range quiet hour is treated as not configured', () => {
    expect(getEffectiveNotificationPreferences({ quietHoursStart: 25 } as any).quietHoursStart).toBeNull();
    expect(getEffectiveNotificationPreferences({ quietHoursStart: -1 } as any).quietHoursStart).toBeNull();
  });

  it('a valid stored config is honestly reflected', () => {
    const prefs = getEffectiveNotificationPreferences({
      notificationsEnabled: false, allowedNudgeCategories: ['checkin_reminder'], nudgeFrequency: 'discreet', maxNudgesPerDay: 2, quietHoursStart: 22, quietHoursEnd: 7,
    });
    expect(prefs).toEqual({ notificationsEnabled: false, allowedNudgeCategories: ['checkin_reminder'], nudgeFrequency: 'discreet', maxNudgesPerDay: 2, quietHoursStart: 22, quietHoursEnd: 7 });
  });
});

describe('isWithinQuietHours', () => {
  it('returns false when quiet hours are not configured', () => {
    expect(isWithinQuietHours(2, null, null)).toBe(false);
  });

  it('returns false for a degenerate equal start/end rather than treating it as always-quiet', () => {
    expect(isWithinQuietHours(3, 9, 9)).toBe(false);
  });

  it('handles a same-day window correctly (9 -> 17)', () => {
    expect(isWithinQuietHours(12, 9, 17)).toBe(true);
    expect(isWithinQuietHours(8, 9, 17)).toBe(false);
    expect(isWithinQuietHours(17, 9, 17)).toBe(false);
  });

  it('handles an overnight window correctly (22 -> 7)', () => {
    expect(isWithinQuietHours(23, 22, 7)).toBe(true);
    expect(isWithinQuietHours(3, 22, 7)).toBe(true);
    expect(isWithinQuietHours(10, 22, 7)).toBe(false);
  });
});

describe('routeNotification', () => {
  const available = { push: true, email: true, sms: true };

  it('a guardian_alert always sends via SMS regardless of preferences, quiet hours, or caps', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, notificationsEnabled: false, quietHoursStart: 0, quietHoursEnd: 23 };
    expect(routeNotification('guardian_alert', prefs, 3, 999, available)).toEqual({ send: true, channel: 'sms' });
  });

  it('a guardian_alert falls back to push if SMS is unavailable', () => {
    expect(routeNotification('guardian_alert', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, { push: true, email: false, sms: false })).toEqual({ send: true, channel: 'push' });
  });

  it('routine categories are blocked when notifications are disabled', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, notificationsEnabled: false };
    expect(routeNotification('checkin_reminder', prefs, 12, 0, available)).toEqual({ send: false, channel: null, reason: 'notifications_disabled' });
  });

  it('routine categories are blocked when frequency is off', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, nudgeFrequency: 'off' as const };
    expect(routeNotification('checkin_reminder', prefs, 12, 0, available).send).toBe(false);
  });

  it('a category not in an explicit allow-list is blocked', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, allowedNudgeCategories: ['weekly_review'] };
    expect(routeNotification('checkin_reminder', prefs, 12, 0, available)).toEqual({ send: false, channel: null, reason: 'category_not_allowed' });
  });

  it('an empty allow-list means every category is allowed (opt-out model)', () => {
    expect(routeNotification('checkin_reminder', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, available).send).toBe(true);
  });

  it('quiet hours block a routine notification', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, quietHoursStart: 22, quietHoursEnd: 7 };
    expect(routeNotification('checkin_reminder', prefs, 23, 0, available)).toEqual({ send: false, channel: null, reason: 'quiet_hours' });
  });

  it('the daily cap blocks further routine notifications once reached', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, maxNudgesPerDay: 2 };
    expect(routeNotification('checkin_reminder', prefs, 12, 2, available)).toEqual({ send: false, channel: null, reason: 'daily_cap_reached' });
    expect(routeNotification('checkin_reminder', prefs, 12, 1, available).send).toBe(true);
  });

  it('prefers push over email and SMS for a routine category', () => {
    expect(routeNotification('checkin_reminder', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, available)).toEqual({ send: true, channel: 'push' });
  });

  it('falls back to email when push is unavailable', () => {
    expect(routeNotification('checkin_reminder', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, { push: false, email: true, sms: true })).toEqual({ send: true, channel: 'email' });
  });

  it('only ally_nudge falls back to SMS when push and email are both unavailable', () => {
    const onlySms = { push: false, email: false, sms: true };
    expect(routeNotification('ally_nudge', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, onlySms)).toEqual({ send: true, channel: 'sms' });
    expect(routeNotification('checkin_reminder', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, onlySms)).toEqual({ send: false, channel: null, reason: 'no_channel_available' });
  });

  it('reports no_channel_available when nothing is available at all', () => {
    expect(routeNotification('checkin_reminder', DEFAULT_NOTIFICATION_PREFERENCES, 12, 0, { push: false, email: false, sms: false })).toEqual({ send: false, channel: null, reason: 'no_channel_available' });
  });
});
