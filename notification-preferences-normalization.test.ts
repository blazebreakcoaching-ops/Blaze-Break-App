// NHEI PHASE 3C-2B CHECKPOINT 2 SECTION 12 - STANDALONE NOTIFICATION
// PREFERENCES SCHEMA REMEDIATION TESTS
//
// Unrelated to NHEI (see notification-preferences-normalization.ts's own
// header). Tests real client-shaped preference documents - the exact
// default state src/components/NotificationSettingsView.tsx constructs,
// plus the variations a real user's toggles would produce - against the
// actual notification-router.ts decision logic, proving the normalisation
// closes the three gaps the section 10 investigation document found,
// without ever touching stored data (this file never imports or calls
// anything Firestore-related).

import { describe, it, expect } from 'vitest';
import { normalizeClientNotificationPreferences, type ClientNotificationPreferencesDocument } from './notification-preferences-normalization';
import { routeNotification } from './notification-router';

// The exact default object NotificationSettingsView.tsx's useState call
// constructs before any save - a real, not hypothetical, client-shaped
// document shape.
const CLIENT_DEFAULT_DOCUMENT: ClientNotificationPreferencesDocument = {
  notificationsEnabled: false,
  nudgeFrequency: 'low',
  quietHoursStart: '20:00',
  quietHoursEnd: '08:00',
  allowedNudgeCategories: [
    'check_in_reminder', 'recovery_action_reminder', 'energy_budget_reflection',
    'boundary_practice_reminder', 'weekly_review_reminder', 'memory_review_reminder', 'goal_follow_up',
    'fuel_pattern_reminder',
  ],
};

describe('normalizeClientNotificationPreferences - real client-shaped fixtures', () => {
  it('maps the real default client document into the router shape without throwing', () => {
    const normalized = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    expect(normalized.notificationsEnabled).toBe(false);
    expect(normalized.nudgeFrequency).toBe('discreet'); // 'low' -> 'discreet'
    expect(normalized.quietHoursStart).toBe(20);
    expect(normalized.quietHoursEnd).toBe(8);
  });

  it('drops the 3 client categories with no router equivalent, maps the other 5 correctly, in no particular order', () => {
    const normalized = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    expect(new Set(normalized.allowedNudgeCategories)).toEqual(new Set([
      'checkin_reminder', 'recovery_action', 'boundary_practice', 'weekly_review', 'goal_followup',
    ]));
    expect(normalized.allowedNudgeCategories).not.toContain('energy_budget_reflection');
    expect(normalized.allowedNudgeCategories.length).toBe(5);
  });

  it.each([
    ['low', 'discreet'],
    ['medium', 'supportive'],
    ['high', 'detailed'],
  ] as const)('maps client frequency "%s" to router frequency "%s"', (clientValue, routerValue) => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, nudgeFrequency: clientValue });
    expect(normalized.nudgeFrequency).toBe(routerValue);
  });

  it('an unrecognised/missing nudgeFrequency falls back to the router default, not an invalid value', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, nudgeFrequency: 'garbage' });
    expect(normalized.nudgeFrequency).toBe('supportive');
  });

  it('parses HH:MM quiet-hours strings to local-hour integers, discarding minute precision', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, quietHoursStart: '22:30', quietHoursEnd: '07:15' });
    expect(normalized.quietHoursStart).toBe(22);
    expect(normalized.quietHoursEnd).toBe(7);
  });

  it('a malformed or missing quiet-hours string normalises to null, matching the router\'s own safe default', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, quietHoursStart: 'not-a-time', quietHoursEnd: undefined });
    expect(normalized.quietHoursStart).toBeNull();
    expect(normalized.quietHoursEnd).toBeNull();
  });

  it('a null/undefined stored document normalises to the router defaults, never throwing', () => {
    expect(() => normalizeClientNotificationPreferences(null)).not.toThrow();
    expect(() => normalizeClientNotificationPreferences(undefined)).not.toThrow();
    const normalized = normalizeClientNotificationPreferences(undefined);
    expect(normalized.allowedNudgeCategories).toEqual([]);
    expect(normalized.quietHoursStart).toBeNull();
  });

  it('never persists or mutates anything - calling it twice on the same input is side-effect-free and idempotent', () => {
    const first = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    const second = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    expect(first).toEqual(second);
    // The input fixture itself is untouched.
    expect(CLIENT_DEFAULT_DOCUMENT.nudgeFrequency).toBe('low');
  });
});

describe('normalizeClientNotificationPreferences -> routeNotification: the actual bugs from section 10, now fixed at the read boundary', () => {
  it('quiet hours ARE now honoured for a real user who saved 20:00-08:00 quiet hours via the live Settings screen (bug 1, fixed)', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, notificationsEnabled: true });
    // 23:00 local falls inside the overnight 20:00-08:00 window.
    const decision = routeNotification('checkin_reminder', normalized, 23, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('quiet_hours');
  });

  it('the same real user is correctly sendable outside their quiet hours (confirming the exclusion above is about quiet hours specifically)', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, notificationsEnabled: true });
    const decision = routeNotification('checkin_reminder', normalized, 14, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(true);
    expect(decision.channel).toBe('push');
  });

  it('a real user\'s category selection no longer unconditionally blocks checkin_reminder (bug 3, fixed) - the default document includes check_in_reminder, which now maps correctly', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, notificationsEnabled: true });
    const decision = routeNotification('checkin_reminder', normalized, 14, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(true);
  });

  it('a real user who explicitly UNCHECKED check_in_reminder in the live Settings screen is correctly blocked (the fix does not just always allow everything)', () => {
    const withoutCheckin: ClientNotificationPreferencesDocument = {
      ...CLIENT_DEFAULT_DOCUMENT,
      notificationsEnabled: true,
      allowedNudgeCategories: (CLIENT_DEFAULT_DOCUMENT.allowedNudgeCategories as string[]).filter((c) => c !== 'check_in_reminder'),
    };
    const normalized = normalizeClientNotificationPreferences(withoutCheckin);
    const decision = routeNotification('checkin_reminder', normalized, 14, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('category_not_allowed');
  });

  it('nudgeFrequency "off" remains unreachable from the client\'s own vocabulary (low/medium/high) - notificationsEnabled is still the only real off-switch, matching current behaviour exactly', () => {
    const normalized = normalizeClientNotificationPreferences({ ...CLIENT_DEFAULT_DOCUMENT, notificationsEnabled: true, nudgeFrequency: 'low' });
    expect(normalized.nudgeFrequency).not.toBe('off');
    const decision = routeNotification('checkin_reminder', normalized, 14, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(true);
  });

  it('notificationsEnabled: false (the real default before a user ever saves) still blocks everything, exactly as today', () => {
    const normalized = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    const decision = routeNotification('checkin_reminder', normalized, 14, 0, { push: true, email: false, sms: false });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe('notifications_disabled');
  });

  it('guardian_alert still bypasses every preference, including a client-shaped document with notifications disabled - the safety exception is unaffected by this remediation', () => {
    const normalized = normalizeClientNotificationPreferences(CLIENT_DEFAULT_DOCUMENT);
    const decision = routeNotification('guardian_alert', normalized, 2, 0, { push: true, email: false, sms: true });
    expect(decision.send).toBe(true);
  });
});

describe('this module is prepared but NOT wired into any live route (per instruction 12)', () => {
  it('server.ts does not import normalizeClientNotificationPreferences - it is standalone, not yet activated', async () => {
    const fs = await import('node:fs');
    const serverSource = fs.readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
    expect(serverSource).not.toContain('normalizeClientNotificationPreferences');
    expect(serverSource).not.toContain('notification-preferences-normalization');
  });
});
