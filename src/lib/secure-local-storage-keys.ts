/**
 * A signed-in account may access browser-only device settings and its OWN
 * namespaced data. Never silently block the real account's profile/history,
 * and never fall back to old, unscoped personal keys on shared devices.
 */
const DEVICE_ONLY_KEYS = new Set([
  'blaze_dark_mode',
  'blaze_theme_mode',
  'blaze_feature_flags',
  // Interface language chosen on this device (a language code only, no
  // personal data); the signed-in account's saved choice overrides it.
  'blaze_ui_locale',
]);

const ACCOUNT_PREFIXES = [
  'blaze_profile_v2:',
  'blaze_nova_learning_consent_v2:',
  'blaze_break_pulse_history_v2:',
  'blaze_break_last_pulse_alert_v2:',
  'blaze_break_last_checkin_v2:',
  'blaze_nudge_history_v2:',
  'blaze_audit_logs_v2:',
  'blaze-nova-guide-invite-v1:',
  'blaze-nova-guide-progress-v1:',
] as const;

const ACCOUNT_NOVA_KEYS = [
  'nova_chat_history',
  'nova_chat_ratings',
  'nova_chat_feedback_notes',
  'nova_chat_feedback_tags',
  'nova_chat_feedback_submitted',
  'nova_voice_enabled',
  'nova_feedback_last_shown',
] as const;

export function isSafeAuthenticatedStorageKey(
  key: string,
  currentUid: string | null,
): boolean {
  if (DEVICE_ONLY_KEYS.has(key)) return true;
  if (!currentUid || currentUid === '__pending__') return false;
  const encodedUid = encodeURIComponent(currentUid);
  return ACCOUNT_PREFIXES.some(prefix => key === prefix + encodedUid) ||
    ACCOUNT_NOVA_KEYS.some(base => key === `${base}::${currentUid}`);
}
