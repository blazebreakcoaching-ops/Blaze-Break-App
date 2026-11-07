import { describe, expect, it } from 'vitest';
import { isSafeAuthenticatedStorageKey as allowed } from './secure-local-storage-keys';

describe('signed-in storage may access only its own customer data', () => {
  it('preserves theme and feature flags without exposing old global profiles', () => {
    expect(allowed('blaze_theme_mode', 'A')).toBe(true);
    expect(allowed('blaze_feature_flags', 'A')).toBe(true);
    expect(allowed('blaze_profile', 'A')).toBe(false);
    expect(allowed('blaze_fingerprint', 'A')).toBe(false);
    expect(allowed('blaze_break_pulse_history', 'A')).toBe(false);
    expect(allowed('blaze_notification_preferences', 'A')).toBe(false);
  });

  it('allows current UID account data but not the previous person on this browser', () => {
    for (const prefix of [
      'blaze_profile_v2:',
      'blaze_nova_learning_consent_v2:',
      'blaze_break_pulse_history_v2:',
      'blaze_break_last_pulse_alert_v2:',
      'blaze_break_last_checkin_v2:',
      'blaze_nudge_history_v2:',
      'blaze-nova-guide-invite-v1:',
      'blaze-nova-guide-progress-v1:',
    ]) {
      expect(allowed(prefix + 'account-A', 'account-A')).toBe(true);
      expect(allowed(prefix + 'account-A', 'account-B')).toBe(false);
      expect(allowed(prefix + 'account-B', 'account-A')).toBe(false);
      expect(allowed(prefix + 'account-A-extra', 'account-A')).toBe(false);
    }
  });

  it('preserves the current account Nova chat without enabling bare global keys', () => {
    for (const base of [
      'nova_chat_history', 'nova_chat_ratings', 'nova_chat_feedback_notes',
      'nova_chat_feedback_tags', 'nova_chat_feedback_submitted',
      'nova_voice_enabled', 'nova_feedback_last_shown',
    ]) {
      expect(allowed(base + '::account-A', 'account-A')).toBe(true);
      expect(allowed(base + '::account-A', 'account-B')).toBe(false);
      expect(allowed(base, 'account-A')).toBe(false);
    }
  });

  it('does not enable personal keys before Firebase resolves an actual UID', () => {
    expect(allowed('blaze_profile_v2:account-A', null)).toBe(false);
    expect(allowed('blaze_profile_v2:__pending__', '__pending__')).toBe(false);
    expect(allowed('blaze_profile_v2:account%20A', 'account A')).toBe(true);
    expect(allowed('blaze_profile_v2:account A', 'account A')).toBe(false);
  });
});
