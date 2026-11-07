/** Only the active Firebase identity may show or modify its own settings. */
export interface NudgePreferences {
  notificationsEnabled: boolean;
  nudgeFrequency: 'low' | 'medium' | 'high';
  quietHoursStart: string;
  quietHoursEnd: string;
  allowedNudgeCategories: string[];
}

export const defaultNudgePreferences = (): NudgePreferences => ({
  notificationsEnabled: false,
  nudgeFrequency: 'low',
  quietHoursStart: '20:00',
  quietHoursEnd: '08:00',
  allowedNudgeCategories: [
    'check_in_reminder', 'recovery_action_reminder', 'energy_budget_reflection',
    'boundary_practice_reminder', 'weekly_review_reminder', 'memory_review_reminder',
    'goal_follow_up', 'fuel_pattern_reminder',
  ],
});

const validTime = (time: unknown): time is string =>
  typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);

export function normaliseNudgePreferences(raw: unknown): NudgePreferences {
  const defaults = defaultNudgePreferences();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const item = raw as Record<string, unknown>;
  return {
    notificationsEnabled: item.notificationsEnabled === true,
    nudgeFrequency: item.nudgeFrequency === 'low' ||
      item.nudgeFrequency === 'medium' || item.nudgeFrequency === 'high'
      ? item.nudgeFrequency : defaults.nudgeFrequency,
    quietHoursStart: validTime(item.quietHoursStart) ? item.quietHoursStart : defaults.quietHoursStart,
    quietHoursEnd: validTime(item.quietHoursEnd) ? item.quietHoursEnd : defaults.quietHoursEnd,
    allowedNudgeCategories: Array.isArray(item.allowedNudgeCategories)
      ? item.allowedNudgeCategories.filter((v): v is string => typeof v === 'string').slice(0, 20)
      : defaults.allowedNudgeCategories,
  };
}

export const isLivePreferenceOwner = (requestedUid: string, actualUid: string | null, cancelled: boolean) =>
  !cancelled && requestedUid === actualUid;
