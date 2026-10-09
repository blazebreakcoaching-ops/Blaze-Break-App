// Nova Context Brain governance - Evolution Engine PR4.
//
// nova-brain.ts (client) and nova-tools.ts (server) already implement a
// real, Firestore-persisted memory store with one real structural dedup
// path (updateNovaMemoryBySourceAndType matches on source+type) and one
// real retention mechanism (logJourney caps 'state'-type memories at the
// 15 most recent). What's missing, and what this file adds, is pure/
// testable governance logic on top of that real data: a canonical key
// derivation consistent with the existing source+type dedup match, a
// single explicit data-zone constant (every Nova memory is personal
// coaching context - there is no ambiguity to resolve per-memory), an
// evidence-state label for display that doesn't require changing the
// already-consumed confidence enum, and a pure aggregation function for
// the platform-wide Context Brain Health view.
//
// This file does NOT change what gets written to a memory document's
// `content` field, and does not rename the stored `confidence` enum
// ('low'|'medium'|'high'|'verified') that NovaChat.tsx, EvolutionEngine.tsx,
// and server.ts's search/write tools already read and write - doing so
// would be a much larger, riskier change than this PR's real target,
// which is the concrete problem found during investigation: App.tsx was
// writing a 'Navigation Context' entry into this exact memory store on
// every single tab switch, competing for one of the "5 most recent"
// slots getNovaContextAndMetadata (server.ts) injects directly into
// Nova's live conversation context - displacing genuinely useful
// memories (a completed boundary rehearsal, a confirmed preference)
// with "User entering module: home" noise. That call is removed in this
// PR (see App.tsx); this file is the supporting governance
// infrastructure, not a workaround for it.

// Every Nova memory is personal coaching context about one user - there
// is no second data zone a memory document could legitimately belong to.
// Stored explicitly (rather than left implicit) so the Evolution Engine's
// data-zone vocabulary (feature-registry-v2.ts's DataZone type) can name
// this store the same way it names every other real data source.
export const NOVA_MEMORY_DATA_ZONE = 'private_recovery_vault' as const;

// Matches the exact match condition updateNovaMemoryBySourceAndType
// (nova-brain.ts) already uses to decide "is this the same memory as one
// we already have" - making that implicit match explicit and reusable,
// not introducing a new/different notion of identity.
export const deriveCanonicalKey = (source: string, type: string): string => `${source}::${type}`;

// Display-only mapping from the existing stored confidence value to the
// richer "evidence state" vocabulary the spec describes - never written
// back to a memory document, never changing what's actually stored.
// Chosen as the closest honest reading of what each existing value
// already means in context (see nova-tools.ts's own comment on why
// 'verified' is reserved for deterministic/system writes, never a model's
// own claim about itself).
export const EVIDENCE_STATE_LABELS: Record<string, string> = {
  low: 'Observed Once',
  medium: 'Repeated',
  high: 'Behaviourally Supported',
  verified: 'System Verified',
};

export const evidenceStateLabel = (confidence: string | undefined | null): string =>
  (confidence && EVIDENCE_STATE_LABELS[confidence]) || 'Unknown';

// ---- Context Brain Health aggregation --------------------------------
//
// Deliberately operates on a stripped-down shape - never the memory's
// `content` - matching the spec's own rule that the normal governance
// view shows type/source/confidence/volume/conflicts, not raw private
// text. server.ts is responsible for mapping real Firestore docs down to
// this shape before calling in; this function never sees more than that.
export interface MemoryHealthEntry {
  ownerUid: string;
  type: string;
  confidence: string | null;
  canonicalKey: string | null;
}

export interface ContextBrainHealthSummary {
  totalMemories: number;
  usersScanned: number;
  byType: Record<string, number>;
  byConfidence: Record<string, number>;
  // A (ownerUid, canonicalKey) pair with more than one memory document is
  // a real governance problem, not a display nuance: it means the
  // structural dedup path (updateNovaMemoryBySourceAndType) was bypassed
  // for that pair - two "effective current state" records exist for the
  // same source+type where only one should.
  duplicateCandidateGroups: number;
  duplicateCandidateMemories: number;
  // Memories written via the freeform paths (addNovaMemory, logJourney,
  // Nova's own remember_about_user tool) have no canonical key at all -
  // not a bug, just a real limit on what can be structurally deduped
  // today, reported honestly rather than silently treated as zero.
  memoriesWithoutCanonicalKey: number;
}

export const summarizeMemoryHealth = (entries: MemoryHealthEntry[]): ContextBrainHealthSummary => {
  const byType: Record<string, number> = {};
  const byConfidence: Record<string, number> = {};
  const groupCounts = new Map<string, number>();
  let withoutCanonicalKey = 0;

  for (const entry of entries) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    const confidenceKey = entry.confidence || 'unknown';
    byConfidence[confidenceKey] = (byConfidence[confidenceKey] || 0) + 1;

    if (entry.canonicalKey) {
      const groupKey = `${entry.ownerUid}::${entry.canonicalKey}`;
      groupCounts.set(groupKey, (groupCounts.get(groupKey) || 0) + 1);
    } else {
      withoutCanonicalKey++;
    }
  }

  let duplicateCandidateGroups = 0;
  let duplicateCandidateMemories = 0;
  for (const count of groupCounts.values()) {
    if (count > 1) {
      duplicateCandidateGroups++;
      duplicateCandidateMemories += count;
    }
  }

  return {
    totalMemories: entries.length,
    usersScanned: new Set(entries.map((e) => e.ownerUid)).size,
    byType,
    byConfidence,
    duplicateCandidateGroups,
    duplicateCandidateMemories,
    memoriesWithoutCanonicalKey: withoutCanonicalKey,
  };
};
