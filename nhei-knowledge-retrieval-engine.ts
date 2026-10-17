// NHEI PHASE 3B - KNOWLEDGE RETRIEVAL ENGINE
//
// Pure, deterministic functions over an already-fetched array of
// NheiKnowledgeEntry - no I/O, matching Phase 1's "pure engine" pattern.
// The Firestore-backed layer (nhei-knowledge-service.ts) fetches entries
// and calls into this file; this file never touches a database.
//
// "Do not automatically fall back to unapproved model-generated
// educational claims when no approved article exists" - every retrieval
// function here returns an explicit, typed "no content" result
// (NheiKnowledgeRetrievalResult.entries === [] with found === false) when
// nothing matches. Nothing in this file invents, paraphrases, or
// generates replacement content.

import { type NheiKnowledgeEntry, type NheiKnowledgeTopic, type NheiEvidenceCategory, type NheiKnowledgeAgeGroup, isValidNheiKnowledgeTopic } from './nhei-knowledge-types';

export const DEFAULT_RETRIEVAL_LIMIT = 10;
export const MAX_RETRIEVAL_LIMIT = 50;

// ---- Phase 3C-2A: age eligibility (section 4) ---------------------------
//
// A VIEWER'S age band, never inferred from conversation content (no
// function in this file reads conversation text at all) and never trusted
// as a final boundary from this file alone - normalizeAgeBand's job is
// purely "what does an untrusted/absent input resolve to," which is always
// the most restrictive band. The caller (eventually, a real route) is
// responsible for sourcing this from a verified, trusted age-band source
// per the phase instruction - nothing here claims to BE that verification.
export type NheiAgeBand = 'adult' | 'youth' | 'unknown';

export const isValidNheiAgeBand = (value: unknown): value is NheiAgeBand =>
  value === 'adult' || value === 'youth' || value === 'unknown';

// Fail-closed normalisation: anything that isn't exactly a recognised,
// valid age band - missing, undefined, malformed, or an unrecognised
// string - resolves to 'unknown', the most restrictive band. There is no
// path through this function that turns "I don't know this viewer's age"
// into "treat them as an adult."
export const normalizeAgeBand = (value: unknown): NheiAgeBand => (isValidNheiAgeBand(value) ? value : 'unknown');

// Which ageGroup values are eligible for which viewer band. 'unknown' gets
// exactly the same (most restrictive) eligibility as 'youth' - an
// unverified age must never be treated more permissively than a known
// youth viewer, which is the concrete form "unknown age does not bypass
// eligibility restrictions" takes here.
const AGE_GROUP_ELIGIBILITY: Record<NheiAgeBand, ReadonlySet<NheiKnowledgeAgeGroup>> = {
  adult: new Set(['all_ages', 'adult_only', 'not_recommended_for_youth']),
  youth: new Set(['all_ages']),
  unknown: new Set(['all_ages']),
};

export const isAgeEligibleKnowledgeEntry = (entry: NheiKnowledgeEntry, ageBand: NheiAgeBand): boolean =>
  AGE_GROUP_ELIGIBILITY[ageBand].has(entry.ageGroup);

export const filterByAgeEligibility = (entries: NheiKnowledgeEntry[], ageBand: NheiAgeBand): NheiKnowledgeEntry[] =>
  entries.filter((e) => isAgeEligibleKnowledgeEntry(e, ageBand));

export interface NheiKnowledgeRetrievalQuery {
  topics: NheiKnowledgeTopic[]; // OR match - an entry matching ANY listed topic is included
  evidenceCategories?: NheiEvidenceCategory[]; // optional filter; omitted = all categories
  // Omitted, undefined, or any unrecognised value is normalised to
  // 'unknown' (the most restrictive band) by retrieveKnowledge below - a
  // caller cannot bypass age eligibility by simply not setting this field.
  ageBand?: unknown;
  limit?: number;
}

export interface NheiKnowledgeRetrievalResult {
  found: boolean;
  entries: NheiKnowledgeEntry[];
  // Explicit reasons rather than a silent empty array - "appropriate
  // retrieval failure behaviour" means a caller (eventually, a
  // prompt-builder) can tell "nothing approved exists for this topic yet"
  // apart from "the query itself was malformed."
  invalidTopics: string[];
}

// Only ever true for an entry that has actually been through the review
// step - see nhei-knowledge-types.ts's validateKnowledgeEntry, which
// already refuses to let an entry reach 'approved' without a distinct
// reviewerId and a lastReviewedAt. This function re-checks the status
// field anyway, since a retrieval engine should never trust that every
// caller validated its input first.
export const isApprovedKnowledgeEntry = (entry: NheiKnowledgeEntry): boolean => entry.approvalStatus === 'approved';

export const filterApprovedOnly = (entries: NheiKnowledgeEntry[]): NheiKnowledgeEntry[] =>
  entries.filter(isApprovedKnowledgeEntry);

export const filterByTopics = (entries: NheiKnowledgeEntry[], topics: NheiKnowledgeTopic[]): NheiKnowledgeEntry[] =>
  topics.length === 0 ? [] : entries.filter((e) => e.topics.some((t) => topics.includes(t)));

export const filterByEvidenceCategories = (entries: NheiKnowledgeEntry[], categories: NheiEvidenceCategory[]): NheiKnowledgeEntry[] =>
  entries.filter((e) => categories.includes(e.evidenceCategory));

// Predictable ordering: by id, ascending. Deliberately not "relevance
// score" or anything that could vary run to run - a deterministic
// retrieval service should return the same order for the same inputs
// every time, which a numeric or heuristic ranking would not guarantee
// without a lot more design than Phase 3B's scope calls for.
export const stableOrderKnowledgeEntries = (entries: NheiKnowledgeEntry[]): NheiKnowledgeEntry[] =>
  [...entries].sort((a, b) => a.id.localeCompare(b.id));

// The one entry point this file exposes. Treats a malformed/unknown
// topic value as a reportable condition, not something to silently drop -
// "reject malformed records and unsupported topic values" extends to the
// query side, not just the content side. Note this function does not
// itself read Firestore - `allEntries` is whatever the caller already
// fetched (nhei-knowledge-service.ts fetches once and reuses it across
// calls, rather than this file forcing a query shape on the caller).
export function retrieveKnowledge(
  allEntries: NheiKnowledgeEntry[],
  query: NheiKnowledgeRetrievalQuery,
): NheiKnowledgeRetrievalResult {
  const invalidTopics = query.topics.filter((t) => !isValidNheiKnowledgeTopic(t)).map((t) => String(t));
  const validTopics = query.topics.filter(isValidNheiKnowledgeTopic);

  if (validTopics.length === 0) {
    return { found: false, entries: [], invalidTopics };
  }

  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_RETRIEVAL_LIMIT), MAX_RETRIEVAL_LIMIT);
  const ageBand = normalizeAgeBand(query.ageBand);

  let candidates = filterApprovedOnly(allEntries);
  candidates = filterByAgeEligibility(candidates, ageBand);
  candidates = filterByTopics(candidates, validTopics);
  if (query.evidenceCategories && query.evidenceCategories.length > 0) {
    candidates = filterByEvidenceCategories(candidates, query.evidenceCategories);
  }
  candidates = stableOrderKnowledgeEntries(candidates).slice(0, limit);

  return { found: candidates.length > 0, entries: candidates, invalidTopics };
}

// Convenience for a single-topic lookup, since that's the common case a
// future integration (nhei-knowledge-bridge.ts) will mostly use.
export const retrieveKnowledgeForTopic = (
  allEntries: NheiKnowledgeEntry[],
  topic: NheiKnowledgeTopic,
  options: Omit<NheiKnowledgeRetrievalQuery, 'topics'> = {},
): NheiKnowledgeRetrievalResult => retrieveKnowledge(allEntries, { ...options, topics: [topic] });

// Returns the single highest-version approved entry per id - versioning
// support per section 8, without needing multiple documents per id in
// storage (the service layer keeps exactly one document per id and
// increments contentVersion in place; this function exists for a caller
// that happens to be holding multiple versions of the same id at once,
// e.g. during a migration, and needs the latest deterministically).
export function latestVersionPerEntry(entries: NheiKnowledgeEntry[]): NheiKnowledgeEntry[] {
  const byId = new Map<string, NheiKnowledgeEntry>();
  for (const entry of entries) {
    const existing = byId.get(entry.id);
    if (!existing || entry.contentVersion > existing.contentVersion) byId.set(entry.id, entry);
  }
  return stableOrderKnowledgeEntries([...byId.values()]);
}
