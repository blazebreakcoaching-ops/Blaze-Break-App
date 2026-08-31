// Pure logic for Nova's tool-use capabilities, kept separate from server.ts
// so it can be unit tested without a live Firestore/Express instance,
// matching the pattern already established by boundary-autopilot-schemas.ts.
//
// This file intentionally contains no I/O. server.ts is responsible for
// fetching the raw permissions doc and memory documents from Firestore,
// then handing them to the pure functions here.
//
// IMPORTANT: this schema matches nova-brain.ts's real, actively-written
// memory shape (type/content/source/confidence/canEdit), not an earlier,
// more elaborate schema (memoryType/memoryText/userApproved/reviewStatus)
// that was never actually produced by any writer in this codebase. That
// mismatch meant the server's context injection and this file's original
// search tool would have silently returned nothing forever, even with
// permissions fully enabled - found and fixed as part of turning memory
// on for real.

export type NovaMemoryType = 'profile' | 'trigger' | 'state' | 'rule' | 'preference';

export interface NovaPermissions {
  allowNovaMemory?: boolean;
  allowNovaUseSavedMemories?: boolean;
  [key: string]: unknown;
}

export interface NovaMemoryDoc {
  type: NovaMemoryType;
  content: string;
  source?: string;
  confidence?: string;
  canEdit?: boolean;
  [key: string]: unknown;
}

// The backend keeps both allowNovaMemory and allowNovaUseSavedMemories as
// an AND gate. The UI writes both together from a single visible toggle
// (there's no real scenario where a user wants one true and the other
// false), but the backend checks both independently rather than trusting
// the UI never to diverge from that assumption.
export const memoryToolIsAllowed = (perms: NovaPermissions | undefined | null): boolean => {
  if (!perms) return false;
  return Boolean(perms.allowNovaMemory && perms.allowNovaUseSavedMemories);
};

// Filters a raw set of memory documents down to the ones matching the
// search query, formatted for direct inclusion in a tool response.
// Returns [] rather than throwing on missing/malformed input, since a
// tool result feeds back into a live model conversation - erroring here
// would surface as a broken chat turn, not a clean error message.
export const searchMemories = (
  perms: NovaPermissions | undefined | null,
  memories: NovaMemoryDoc[],
  query: string,
  limit: number = 10
): string[] => {
  if (!memoryToolIsAllowed(perms)) return [];

  const trimmedQuery = (query || '').trim().toLowerCase();
  if (!trimmedQuery) return [];

  return (memories || [])
    .filter((mem) => mem && typeof mem.content === 'string' && mem.content.toLowerCase().includes(trimmedQuery))
    .slice(0, limit)
    .map((mem) => `[${mem.type}] ${mem.content}`);
};

// The five real, static duration keys in MicroRecovery.tsx's ACTIONS
// catalog. Kept as a literal list here rather than imported, since
// importing a .tsx file into this Node-side module would pull in
// React/JSX tooling this file has no other reason to depend on - the
// five values are a stable, intentional contract between the two files,
// not something that changes often enough to justify that coupling.
export const VALID_RECOVERY_DURATIONS = ['30s', '2m', '5m', '10m', '20m'] as const;
export type RecoveryDuration = typeof VALID_RECOVERY_DURATIONS[number];

// A model can propose a duration that doesn't actually exist in the app's
// catalog (a hallucinated value like "15m"). This is the one thing standing
// between "Nova suggested something" and "Nova suggested something that
// actually corresponds to a real, executable recovery protocol."
export const isValidRecoveryDuration = (duration: unknown): duration is RecoveryDuration =>
  typeof duration === 'string' && (VALID_RECOVERY_DURATIONS as readonly string[]).includes(duration);

// The five real MemoryType values nova-brain.ts actually writes. Used to
// validate a model-proposed memory type before it's persisted, the same
// role isValidRecoveryDuration plays for recovery durations - stopping a
// hallucinated category from being written as if it were real.
export const VALID_MEMORY_TYPES = ['profile', 'trigger', 'state', 'rule', 'preference'] as const;

export const isValidMemoryType = (type: unknown): type is NovaMemoryType =>
  typeof type === 'string' && (VALID_MEMORY_TYPES as readonly string[]).includes(type);
