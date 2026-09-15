// Pure decision logic for where a notification actually goes. Centralises
// what was previously scattered/absent: the pulse-check push scheduler and
// the ally-nudge SMS scheduler each independently decided whether/how to
// notify someone, and neither consulted the user's own notification
// preferences (users/{uid}/preferences/notifications) - that doc was read
// only by the in-app banner (NotificationSettingsView.tsx, InAppNudge.tsx),
// so a person's quiet-hours/category/frequency choices never applied to
// push or SMS. This module is the one place that answers "should this
// notification go out right now, and on which channel" - see
// docs/NOTIFICATION_ARCHITECTURE.md for the channel-priority rationale
// (in-app > push > email > SMS).
//
// Deliberately I/O-free: server.ts resolves the caller's local hour (via
// Intl.DateTimeFormat against their stored timezone, same pattern already
// used by the ally-nudge scheduler) and today's send count before calling
// in, so this stays fully unit-testable without a clock or a database.

export type NotificationChannel = 'push' | 'email' | 'sms';

export type NotificationCategory =
  | 'checkin_reminder'
  | 'recovery_action'
  | 'boundary_practice'
  | 'weekly_review'
  | 'goal_followup'
  | 'climate_survey'
  | 'guardian_alert'
  | 'ally_nudge';

export interface NotificationPreferences {
  notificationsEnabled: boolean;
  // Empty list = opt-out model (all categories allowed unless explicitly
  // removed), matching how allowedNudgeCategories already behaves for the
  // in-app banner today - an empty/unset list has never meant "nothing."
  allowedNudgeCategories: string[];
  nudgeFrequency: 'discreet' | 'supportive' | 'detailed' | 'off';
  maxNudgesPerDay: number | null;
  quietHoursStart: number | null; // local hour, 0-23
  quietHoursEnd: number | null; // local hour, 0-23
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notificationsEnabled: true,
  allowedNudgeCategories: [],
  nudgeFrequency: 'supportive',
  maxNudgesPerDay: null,
  quietHoursStart: null,
  quietHoursEnd: null,
};

export const getEffectiveNotificationPreferences = (
  stored: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences => ({
  notificationsEnabled: typeof stored?.notificationsEnabled === 'boolean' ? stored.notificationsEnabled : DEFAULT_NOTIFICATION_PREFERENCES.notificationsEnabled,
  allowedNudgeCategories: Array.isArray(stored?.allowedNudgeCategories) ? stored!.allowedNudgeCategories.filter((c) => typeof c === 'string') : [],
  nudgeFrequency: (['discreet', 'supportive', 'detailed', 'off'] as const).includes(stored?.nudgeFrequency as any)
    ? (stored!.nudgeFrequency as NotificationPreferences['nudgeFrequency'])
    : DEFAULT_NOTIFICATION_PREFERENCES.nudgeFrequency,
  maxNudgesPerDay: typeof stored?.maxNudgesPerDay === 'number' && stored.maxNudgesPerDay >= 0 ? stored.maxNudgesPerDay : null,
  quietHoursStart: typeof stored?.quietHoursStart === 'number' && stored.quietHoursStart >= 0 && stored.quietHoursStart <= 23 ? stored.quietHoursStart : null,
  quietHoursEnd: typeof stored?.quietHoursEnd === 'number' && stored.quietHoursEnd >= 0 && stored.quietHoursEnd <= 23 ? stored.quietHoursEnd : null,
});

// Handles the overnight-wrap case (e.g. 22 -> 7) as well as the same-day
// case (e.g. 9 -> 17). Equal start/end is treated as "no quiet hours"
// configured, not "quiet all day" - a degenerate/accidental config should
// never silently suppress every notification.
export const isWithinQuietHours = (localHour: number, start: number | null, end: number | null): boolean => {
  if (start === null || end === null || start === end) return false;
  if (start < end) return localHour >= start && localHour < end;
  return localHour >= start || localHour < end;
};

export interface ChannelAvailability {
  push: boolean;
  email: boolean;
  sms: boolean;
}

export interface RoutingDecision {
  send: boolean;
  channel: NotificationChannel | null;
  reason?: 'notifications_disabled' | 'category_not_allowed' | 'quiet_hours' | 'daily_cap_reached' | 'no_channel_available';
}

// The actual routing decision. Guardian alerts are a deliberate exception
// to every preference/quiet-hours/frequency gate below: they're a safety
// escalation the person themselves just triggered by tapping a button
// right now, not a routine nudge that can wait until morning - see
// docs/PRODUCT_SAFETY_PRIVACY.md's "safety must not be removed to save
// money/convenience" principle. Every other category goes through the
// full preference stack, and channel priority is push, then email, then
// (ally_nudge only) SMS - matching the product direction that SMS is
// never the default routine-engagement channel.
export const routeNotification = (
  category: NotificationCategory,
  prefs: NotificationPreferences,
  localHour: number,
  sentTodayCount: number,
  availability: ChannelAvailability
): RoutingDecision => {
  if (category === 'guardian_alert') {
    if (availability.sms) return { send: true, channel: 'sms' };
    if (availability.push) return { send: true, channel: 'push' };
    return { send: false, channel: null, reason: 'no_channel_available' };
  }

  if (!prefs.notificationsEnabled || prefs.nudgeFrequency === 'off') {
    return { send: false, channel: null, reason: 'notifications_disabled' };
  }
  if (prefs.allowedNudgeCategories.length > 0 && !prefs.allowedNudgeCategories.includes(category)) {
    return { send: false, channel: null, reason: 'category_not_allowed' };
  }
  if (isWithinQuietHours(localHour, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return { send: false, channel: null, reason: 'quiet_hours' };
  }
  if (prefs.maxNudgesPerDay !== null && sentTodayCount >= prefs.maxNudgesPerDay) {
    return { send: false, channel: null, reason: 'daily_cap_reached' };
  }

  if (availability.push) return { send: true, channel: 'push' };
  if (availability.email) return { send: true, channel: 'email' };
  if (category === 'ally_nudge' && availability.sms) return { send: true, channel: 'sms' };
  return { send: false, channel: null, reason: 'no_channel_available' };
};
