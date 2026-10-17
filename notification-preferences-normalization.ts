// NHEI PHASE 3C-2B CHECKPOINT 2 SECTION 12 - STANDALONE NOTIFICATION
// PREFERENCES SCHEMA REMEDIATION (PREPARED, NOT WIRED)
//
// This file is deliberately UNRELATED to NHEI and lives as its own,
// separate module - per instruction 12, "do not fold an unrelated
// migration into this NHEI integration change." It addresses a
// pre-existing, independently discovered bug (Phase 3C-2B section 10's
// investigation document) in how notification-router.ts's scheduled push
// check reads `users/{uid}/preferences/notifications`, a document written
// exclusively by `src/components/NotificationSettingsView.tsx` in a
// different shape than `notification-router.ts` expects - meaning, today,
// a real user's chosen quiet hours never suppress push notifications, and
// a real user who has ever saved their category selection has their
// push `checkin_reminder` notifications blocked unconditionally.
//
// Per section 10's own recommendation, this implements the "normalise at
// the read boundary, not the stored data" option: a pure, I/O-free
// function that translates the client's already-stored document shape
// into notification-router.ts's own NotificationPreferences shape, in
// memory, on read. It never writes to Firestore and never alters any
// existing stored document - "do not change existing saved preferences
// without explicit approval" is satisfied by construction, not by a
// runtime check.
//
// This function is NOT wired into server.ts's actual
// getEffectiveNotificationPreferences call site in this checkpoint.
// Wiring it in is a deliberate follow-up step requiring explicit human
// approval: unlike NHEI's own Educational Mode (reversible, flag-gated,
// off by default), substituting this function at the real call site
// would immediately change already-deployed behaviour for every existing
// user the next time the scheduled push check runs - quiet hours and
// category filtering would start actually being enforced. That is exactly
// the kind of behaviour change this checkpoint's own governing principles
// say must not happen without an explicit decision, so it is prepared and
// fully tested here, not activated.

import type { NotificationPreferences } from './notification-router';

// The exact shape NotificationSettingsView.tsx (the only writer of
// `users/{uid}/preferences/notifications` anywhere in this codebase)
// persists. Duplicated here deliberately rather than imported from the
// .tsx file - a backend module has no reason to depend on a React
// component file, and this file's own tests pin the shape directly
// against real fixtures matching that component's default state.
export interface ClientNotificationPreferencesDocument {
  notificationsEnabled?: unknown;
  nudgeFrequency?: unknown; // the client's own vocabulary: 'low' | 'medium' | 'high'
  quietHoursStart?: unknown; // 'HH:MM' string, e.g. '20:00'
  quietHoursEnd?: unknown; // 'HH:MM' string, e.g. '08:00'
  allowedNudgeCategories?: unknown; // the client's own category vocabulary
}

// Semantic correspondence only, not an exact equivalence - see the
// section 10 investigation document's own note that confirming this
// exact mapping is a product call, referencing the client's UI copy
// ("Maximum 1 quiet nudge per day" / "Up to 2 considerate nudges per
// day" / "Up to 3 nudges throughout your active hours").
const CLIENT_TO_ROUTER_FREQUENCY: Record<string, NotificationPreferences['nudgeFrequency']> = {
  low: 'discreet',
  medium: 'supportive',
  high: 'detailed',
};

// Per the section 10 investigation document section 5: 3 of the client's
// 8 category strings have no router equivalent today
// (energy_budget_reflection, memory_review_reminder,
// fuel_pattern_reminder) - routing cannot apply to those categories
// regardless of spelling, so they map to `undefined` and are dropped,
// rather than guessed at or silently misassigned to an unrelated router
// category. climate_survey/guardian_alert/ally_nudge have no client-side
// toggle at all, so a client-shaped document can never request them -
// that is a separate, pre-existing product gap this normalisation does
// not attempt to close.
const CLIENT_TO_ROUTER_CATEGORY: Record<string, string | undefined> = {
  check_in_reminder: 'checkin_reminder',
  recovery_action_reminder: 'recovery_action',
  energy_budget_reflection: undefined,
  boundary_practice_reminder: 'boundary_practice',
  weekly_review_reminder: 'weekly_review',
  memory_review_reminder: undefined,
  goal_follow_up: 'goal_followup',
  fuel_pattern_reminder: undefined,
};

// Parses the client's 'HH:MM' string into the router's local-hour
// integer (0-23), discarding minute precision - the router's own
// granularity is already hourly, so no information it can use is lost.
// Malformed/missing input returns null, matching the router's existing
// safe-default behaviour for any other invalid quiet-hours input.
function parseClientHour(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):\d{2}$/.exec(value.trim());
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  return hour >= 0 && hour <= 23 ? hour : null;
}

// Pure, no I/O, no Firestore access. Takes whatever was actually read
// back from `users/{uid}/preferences/notifications` (the same
// `Partial<...> | null | undefined` shape getEffectiveNotificationPreferences
// itself accepts) and returns the router's own NotificationPreferences
// shape directly - this is the function a future, separately approved
// change would substitute for (or compose before)
// getEffectiveNotificationPreferences at its one call site in server.ts.
export function normalizeClientNotificationPreferences(
  stored: ClientNotificationPreferencesDocument | null | undefined,
): NotificationPreferences {
  const storedClientCategories = Array.isArray(stored?.allowedNudgeCategories)
    ? stored!.allowedNudgeCategories.filter((c): c is string => typeof c === 'string')
    : [];
  const allowedNudgeCategories = storedClientCategories
    .map((c) => CLIENT_TO_ROUTER_CATEGORY[c])
    .filter((c): c is string => typeof c === 'string');

  const nudgeFrequency =
    typeof stored?.nudgeFrequency === 'string' && stored.nudgeFrequency in CLIENT_TO_ROUTER_FREQUENCY
      ? CLIENT_TO_ROUTER_FREQUENCY[stored.nudgeFrequency]
      : 'supportive'; // matches DEFAULT_NOTIFICATION_PREFERENCES.nudgeFrequency in notification-router.ts

  return {
    notificationsEnabled: typeof stored?.notificationsEnabled === 'boolean' ? stored.notificationsEnabled : true,
    allowedNudgeCategories,
    nudgeFrequency,
    // The client has no UI for this field at all - never present in a
    // real stored document, so there is nothing to normalise; null means
    // "no daily cap," matching the router's own default.
    maxNudgesPerDay: null,
    quietHoursStart: parseClientHour(stored?.quietHoursStart),
    quietHoursEnd: parseClientHour(stored?.quietHoursEnd),
  };
}
