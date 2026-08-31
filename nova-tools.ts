// Pure logic for Nova's tool-use capabilities, kept separate from server.ts
// so it can be unit tested without a live Firestore/Express instance,
// matching the pattern already established by boundary-autopilot-schemas.ts.
//
// This file intentionally contains no I/O. server.ts is responsible for
// fetching the raw permissions doc and memory documents from Firestore,
// then handing them to the pure functions here.

export interface NovaPermissions {
  allowNovaMemory?: boolean;
  allowNovaUseSavedMemories?: boolean;
  allowNovaRememberCoachingPreferences?: boolean;
  allowNovaRememberRecoveryPatterns?: boolean;
  allowNovaRememberGoals?: boolean;
  [key: string]: unknown;
}

export interface NovaMemoryDoc {
  memoryType: string;
  memoryText: string;
  userApproved?: boolean;
  reviewStatus?: string;
  expiresAt?: string | null;
  revoked?: boolean;
  [key: string]: unknown;
}

// The same category grouping already established in getNovaContextAndMetadata
// for passive context injection - kept identical here so a tool call can never
// see a category the passive context wouldn't also be allowed to include.
export const allowedMemoryCategories = (perms: NovaPermissions): string[] => {
  const categories: string[] = [];
  if (perms.allowNovaRememberCoachingPreferences) categories.push('coaching_preference', 'module_preference', 'privacy_preference');
  if (perms.allowNovaRememberRecoveryPatterns) categories.push('recovery_preference', 'recurring_pattern');
  if (perms.allowNovaRememberGoals) categories.push('user_goal');
  return categories;
};

// True if the user has consented to Nova using saved memories at all -
// the top-level gate that must pass before any category filtering matters.
export const memoryToolIsAllowed = (perms: NovaPermissions | undefined | null): boolean => {
  if (!perms) return false;
  return Boolean(perms.allowNovaMemory && perms.allowNovaUseSavedMemories);
};

// Filters a raw set of memory documents down to the ones both consented-to
// and matching the search query, formatted for direct inclusion in a tool
// response. Returns [] rather than throwing on missing/malformed input,
// since a tool result feeds back into a live model conversation - erroring
// here would surface as a broken chat turn, not a clean error message.
export const searchMemories = (
  perms: NovaPermissions | undefined | null,
  memories: NovaMemoryDoc[],
  query: string,
  limit: number = 10
): string[] => {
  if (!memoryToolIsAllowed(perms)) return [];
  const categories = allowedMemoryCategories(perms as NovaPermissions);
  if (categories.length === 0) return [];

  const trimmedQuery = (query || '').trim().toLowerCase();
  if (!trimmedQuery) return [];

  const active = (memories || []).filter((mem) =>
    mem &&
    mem.userApproved === true &&
    mem.reviewStatus === 'active' &&
    !mem.revoked &&
    (!mem.expiresAt || new Date(mem.expiresAt) > new Date()) &&
    categories.includes(mem.memoryType)
  );

  return active
    .filter((mem) => (mem.memoryText || '').toLowerCase().includes(trimmedQuery))
    .slice(0, limit)
    .map((mem) => `[${mem.memoryType.replace(/_/g, ' ')}] ${mem.memoryText}`);
};

// Mirrors the exact Duration type already established in MicroRecovery.tsx.
// Kept as a literal list here rather than imported, since importing a .tsx
// file into this Node-side module would pull in React/JSX tooling this
// file has no other reason to depend on - the five values are a stable,
// intentional contract between the two files, not something that changes
// often enough to justify that coupling.
export const VALID_RECOVERY_DURATIONS = ['30s', '2m', '5m', '10m', '20m'] as const;
export type RecoveryDuration = typeof VALID_RECOVERY_DURATIONS[number];

// A model can propose a duration that doesn't actually exist in the app's
// catalog (a hallucinated value like "15m"). This is the one thing standing
// between "Nova suggested something" and "Nova suggested something that
// actually corresponds to a real, executable recovery protocol."
export const isValidRecoveryDuration = (duration: unknown): duration is RecoveryDuration =>
  typeof duration === 'string' && (VALID_RECOVERY_DURATIONS as readonly string[]).includes(duration);
