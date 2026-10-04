// Pure logic for Support Capsules (Master Support Circle spec): the
// privacy primitive that replaces Recovery Ally's old single blanket
// "share this category forever" toggle (AllyPermissions) with a real,
// scoped, expiring share per category - one capsule per category, each
// with its own start time and its own real expiry.
//
// SCOPE NOTE: a capsule here only ever covers one of the four things
// Recovery Ally already knows how to share (Shared Goals, Milestone
// Updates, Energy Levels, Allow Messages) - a standing view permission,
// not a one-off support request. That is why only the expiry options
// that make sense for a standing permission are implemented
// ('today'/'seven_days'/'until_date'/'until_off'); the spec's "Until
// completed" and "One-time" options describe a specific support
// *request* ("I could use encouragement until this resolves"), a
// different capsule shape that doesn't exist yet - adding those options
// here now would be a choice with no real behaviour behind it.
//
// MIGRATION NOTE: existing Recovery Ally relationships created before
// this model existed have a legacy `permissions` object and no capsules
// at all. deriveEffectiveSharing treats that per category - a category
// with its own capsule is governed entirely by that capsule; a category
// with no capsule yet falls back to the legacy boolean, so an existing
// relationship's sharing never silently drops to "nothing shared" the
// moment this ships. See RecoveryAlly.tsx for the one-time, lazy,
// write-real-capsules migration that runs the first time the owner's own
// page loads, after which the legacy object is no longer consulted for
// that user.

export type SupportCapsuleCategory = 'viewGoals' | 'viewMilestones' | 'viewEnergyStats' | 'sendPings';

export const SUPPORT_CAPSULE_CATEGORIES: SupportCapsuleCategory[] = [
  'viewGoals', 'viewMilestones', 'viewEnergyStats', 'sendPings',
];

export const SUPPORT_CAPSULE_CATEGORY_LABELS: Record<SupportCapsuleCategory, string> = {
  viewGoals: 'Shared Goals',
  viewMilestones: 'Milestone Updates',
  viewEnergyStats: 'Energy Levels',
  sendPings: 'Messages from them',
};

// What a brand new Recovery Ally invite shares by default - exactly
// matching the old AllyPermissions defaults, so a fresh invite behaves
// identically to before, just backed by real capsules instead of a
// blanket object.
export const DEFAULT_SHARED_CATEGORIES: SupportCapsuleCategory[] = ['viewGoals', 'viewMilestones', 'sendPings'];

export type SupportCapsuleExpiryType = 'today' | 'seven_days' | 'until_date' | 'until_off';

export const SUPPORT_CAPSULE_EXPIRY_TYPES: SupportCapsuleExpiryType[] = ['today', 'seven_days', 'until_date', 'until_off'];

export const SUPPORT_CAPSULE_EXPIRY_LABELS: Record<SupportCapsuleExpiryType, string> = {
  today: 'Just for today',
  seven_days: 'For 7 days',
  until_date: 'Until a date I choose',
  until_off: "Until I turn it off",
};

export interface SupportCapsule {
  category: SupportCapsuleCategory;
  expiryType: SupportCapsuleExpiryType;
  startAt: string; // ISO
  expiresAt: string | null; // ISO; null only ever means until_off
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const isValidCapsuleCategory = (value: unknown): value is SupportCapsuleCategory =>
  typeof value === 'string' && (SUPPORT_CAPSULE_CATEGORIES as string[]).includes(value);

export const isValidCapsuleExpiryType = (value: unknown): value is SupportCapsuleExpiryType =>
  typeof value === 'string' && (SUPPORT_CAPSULE_EXPIRY_TYPES as string[]).includes(value);

// 'until_date' is the one expiry type that needs extra input (which
// date). Validated together, with `now`, so a malformed or already-past
// date can't create a capsule that silently never expires, or one that's
// already expired the instant it's created.
export const isValidCapsuleExpiryInput = (
  expiryType: SupportCapsuleExpiryType,
  untilDate: unknown,
  now: string
): boolean => {
  if (expiryType !== 'until_date') return true;
  if (typeof untilDate !== 'string') return false;
  const parsed = new Date(untilDate).getTime();
  if (isNaN(parsed)) return false;
  return parsed > new Date(now).getTime();
};

// Computes the real expiry timestamp at creation time - never trusts a
// client-supplied expiresAt directly, only the expiryType (+ untilDate
// for that one type) it was actually asked to compute from.
export const computeCapsuleExpiresAt = (
  expiryType: SupportCapsuleExpiryType,
  startAt: string,
  untilDate?: string | null
): string | null => {
  const start = new Date(startAt);
  if (expiryType === 'until_off') return null;
  if (expiryType === 'today') {
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.toISOString();
  }
  if (expiryType === 'seven_days') {
    return new Date(start.getTime() + 7 * ONE_DAY_MS).toISOString();
  }
  // until_date - caller must have validated untilDate with
  // isValidCapsuleExpiryInput before reaching here.
  const parsed = new Date(untilDate || start);
  parsed.setHours(23, 59, 59, 999);
  return parsed.toISOString();
};

export const isCapsuleActive = (capsule: Pick<SupportCapsule, 'expiresAt'>, now: string): boolean => {
  if (capsule.expiresAt === null) return true;
  return new Date(capsule.expiresAt).getTime() > new Date(now).getTime();
};

// The real replacement for reading the old blanket permissions object:
// for each category, an active (non-expired) capsule for that category
// means it's shared; a category with no capsule at all falls back to the
// legacy boolean (see MIGRATION NOTE above) - there is otherwise no
// "shared by default" behaviour anywhere in this function.
export const deriveEffectiveSharing = (
  capsules: Pick<SupportCapsule, 'category' | 'expiresAt'>[],
  now: string,
  legacyFallback: Partial<Record<SupportCapsuleCategory, boolean>> = {}
): Record<SupportCapsuleCategory, boolean> => {
  const categoriesWithCapsule = new Set(capsules.map((c) => c.category));
  const result = {} as Record<SupportCapsuleCategory, boolean>;
  for (const category of SUPPORT_CAPSULE_CATEGORIES) {
    if (categoriesWithCapsule.has(category)) {
      result[category] = capsules.some((c) => c.category === category && isCapsuleActive(c, now));
    } else {
      result[category] = legacyFallback[category] === true;
    }
  }
  return result;
};
