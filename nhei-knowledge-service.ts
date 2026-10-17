// NHEI PHASE 3B - KNOWLEDGE SERVICE (FIRESTORE-BACKED)
//
// The Firestore-backed layer over nhei-knowledge-retrieval-engine.ts's
// pure functions, in the same "I/O at the edges" shape as
// nhei-persistence-service.ts - and reusing that exact same minimal
// FirestoreLike interface, since both files need the identical narrow
// surface (collection/doc/get/set/update) and defining it twice would
// just be two copies to keep in sync.
//
// IMPORTANT DISTINCTION FROM nhei-persistence-service.ts: knowledge
// entries are shared platform content, never personal data - there is no
// uid anywhere in this file's collection path or in NheiKnowledgeEntry's
// schema. None of NHEI's three consent purposes (nhei-consent.ts) gate
// anything here - reading or writing educational content has nothing to
// do with a user's own evidence-processing consent, and gating it that
// way would be a category error, not an extra safety measure. This is
// deliberate, not an oversight - see the Phase 3B delivery report.
//
// Collection: `nhei_knowledge_entries` (top-level, NOT under users/{uid} -
// this is shared content, not scoped to any one person). One Firestore
// document per entry, which is what makes real topic/evidence-category/
// approval-status filtering possible - see nhei-knowledge-types.ts's
// header comment for why the existing app_config/knowledge_chunks single-
// document shape could not support this.
//
// Nothing in this file is imported by server.ts or any live route in
// Phase 3B - per instruction, this stays a standalone, directly-testable
// module until a later, separately-approved phase wires it in.

import {
  type NheiKnowledgeEntry,
  validateKnowledgeEntry,
} from './nhei-knowledge-types';
import {
  retrieveKnowledge,
  type NheiKnowledgeRetrievalQuery,
  type NheiKnowledgeRetrievalResult,
} from './nhei-knowledge-retrieval-engine';
import {
  decideKnowledgeApproval,
  decideKnowledgeRejection,
  type NheiKnowledgeReviewChecklist,
} from './nhei-knowledge-governance';
import type { FirestoreLike } from './nhei-persistence-service';

const KNOWLEDGE_COLLECTION = 'nhei_knowledge_entries';
const nowIso = (): string => new Date().toISOString();

// ---- Phase 3C-2A section 12: cross-instance cache correctness ----------
//
// The Phase 3C-1 cache (below) was TTL-only: on a multi-instance
// deployment, a write on instance A would never invalidate instance B's
// cache until B's own 30s TTL happened to expire independently. Section
// 12's explicit instruction treats that asymmetrically: "a newly approved
// article becoming visible slightly late may be acceptable" (fine to
// leave as pure TTL), but "a revoked or unsafe article continuing to be
// served must be treated more strictly" (NOT fine to leave as pure TTL) -
// a rejected/unapproved entry staying visible on another instance for up
// to 30 seconds is exactly the failure mode this section calls out.
//
// The fix uses EXISTING Firestore - no new service, queue, or external
// cache - which is the "avoid new infrastructure unless justified"
// instruction's own escape hatch applied to a genuine correctness need.
// One extra tiny document (`nhei_knowledge_meta/cache_version`) records a
// version stamp, bumped by every write this file makes. Every retrieval -
// even a cache hit - reads that ONE small document first. If its stamp
// doesn't match what the local cache was built from, the cache is treated
// as stale regardless of TTL, and a fresh collection read happens. This
// means:
//   * A cache hit now costs one tiny single-document read instead of
//     zero reads (a modest, bounded cost increase, not proportional to
//     collection size) - still a large win over a full collection scan
//     as the content library grows, which is what section 8's original
//     cache was justified by and what this section also asks to keep.
//   * Cross-instance revocation becomes correct on the NEXT read from any
//     instance, not after up to 30 seconds (or longer, on an even higher
//     TTL) - because the version stamp is shared, real Firestore state,
//     not a per-process in-memory value.
// The TTL is kept too, but widened (from 30s to 5 minutes) now that it is
// a pure cleanup/safety-net bound rather than the primary correctness
// mechanism - the version check is what actually decides staleness.
const KNOWLEDGE_VERSION_COLLECTION = 'nhei_knowledge_meta';
const KNOWLEDGE_VERSION_DOC_ID = 'cache_version';

async function bumpKnowledgeCacheVersion(db: FirestoreLike): Promise<void> {
  // A timestamp-plus-random-suffix stamp, not a numeric increment -
  // FirestoreLike (the minimal interface this file and
  // nhei-persistence-service.ts share) has no atomic increment operation,
  // and a plain read-then-write increment would itself be a race under
  // concurrent writers. A fresh, almost-certainly-unique stamp on every
  // write needs no read-before-write and no atomicity guarantee at all -
  // it only ever needs to be DIFFERENT from the previous stamp, never a
  // specific next integer.
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.collection(KNOWLEDGE_VERSION_COLLECTION).doc(KNOWLEDGE_VERSION_DOC_ID).set({ stamp }, { merge: true });
}

async function readKnowledgeCacheVersion(db: FirestoreLike): Promise<string | null> {
  const snap = await db.collection(KNOWLEDGE_VERSION_COLLECTION).doc(KNOWLEDGE_VERSION_DOC_ID).get();
  const data = snap.data();
  return snap.exists && typeof data?.stamp === 'string' ? data.stamp : null;
}

// ---- Phase 3C-1: bounded, invalidated-on-write cache --------------------
//
// Section 8's performance review: a collection-wide read on every single
// conversation turn does not scale as the content library grows, and
// "do not introduce new infrastructure unless justified" rules out
// reaching for a new caching service for what is, today, a few dozen
// small documents. A process-local, TTL-bounded cache - invalidated
// immediately on any write this file makes - is the minimal, justified
// fix: it removes the "every turn re-reads the whole collection" cost
// for the common case (many reads between writes) without adding any
// new infrastructure, new dependency, or new collection.
//
// Keyed by the `db` instance itself (a WeakMap, not a global object), so
// multiple FirestoreLike instances (e.g. one per test) never share a
// cache entry and a garbage-collected db's cache entry is cleaned up
// automatically - this also means a real production db and a test fake
// can never cross-contaminate.
//
// Known limitation, disclosed rather than hidden: this cache is
// PROCESS-LOCAL. A multi-instance deployment (more than one server
// process) would have each instance cache independently, so a write on
// one instance would not invalidate another instance's cache until its
// TTL expires. At today's scale (platform content edited rarely, by a
// small admin team) a short TTL makes that window small; a shared cache
// (e.g. keyed in Firestore itself via a version counter, or a real
// external cache) would be the fix if multi-instance staleness ever
// becomes a real problem - not introduced now, since nothing in this
// codebase runs multi-instance today and adding one would be exactly the
// unjustified new infrastructure this section warns against.
const KNOWLEDGE_CACHE_TTL_MS = 5 * 60_000;
const knowledgeCache = new WeakMap<FirestoreLike, { entries: NheiKnowledgeEntry[]; invalidCount: number; expiresAt: number; versionStamp: string | null }>();

export function clearKnowledgeCache(db: FirestoreLike): void {
  knowledgeCache.delete(db);
}

export type NheiKnowledgeWriteBlockedReason =
  | 'invalid_entry'
  | 'not_found'
  | 'reviewer_is_author'
  | 'checklist_incomplete'
  | 'entry_not_in_draft_state'
  | 'id_already_exists';

export type NheiKnowledgeWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: NheiKnowledgeWriteBlockedReason; errors?: string[] };

// Creates a brand-new draft. Always forces approvalStatus/reviewerId/
// lastReviewedAt/contentVersion/authorId to their correct starting
// values regardless of what the input claims - a caller cannot create an
// entry that arrives pre-approved, with a forged author, or with a
// stale version number, the same "exactly one path to an elevated state"
// principle nhei-persistence-service.ts applies to confirmationState.
export async function createDraftKnowledgeEntry(
  db: FirestoreLike,
  authorId: string,
  input: unknown,
): Promise<NheiKnowledgeWriteResult<NheiKnowledgeEntry>> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'invalid_entry', errors: ['entry must be a non-null object'] };
  }
  const forcedInput = {
    ...(input as Record<string, unknown>),
    authorId,
    approvalStatus: 'draft',
    reviewerId: null,
    lastReviewedAt: null,
    contentVersion: 1,
  };
  const validation = validateKnowledgeEntry(forcedInput);
  if (!validation.ok || !validation.entry) {
    return { ok: false, reason: 'invalid_entry', errors: validation.errors };
  }
  const entry = validation.entry;

  const existing = await db.collection(KNOWLEDGE_COLLECTION).doc(entry.id).get();
  if (existing.exists) return { ok: false, reason: 'id_already_exists' };

  await db.collection(KNOWLEDGE_COLLECTION).doc(entry.id).set(entry as unknown as Record<string, unknown>);
  clearKnowledgeCache(db);
  await bumpKnowledgeCacheVersion(db);
  return { ok: true, value: entry };
}

async function fetchEntry(db: FirestoreLike, id: string): Promise<NheiKnowledgeEntry | null> {
  const snap = await db.collection(KNOWLEDGE_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const validation = validateKnowledgeEntry(snap.data());
  return validation.ok && validation.entry ? validation.entry : null;
}

export async function approveKnowledgeEntry(
  db: FirestoreLike,
  entryId: string,
  reviewerId: string,
  checklist: NheiKnowledgeReviewChecklist,
): Promise<NheiKnowledgeWriteResult<NheiKnowledgeEntry>> {
  const entry = await fetchEntry(db, entryId);
  if (!entry) return { ok: false, reason: 'not_found' };

  const decision = decideKnowledgeApproval(entry, reviewerId, checklist, nowIso());
  if (decision.ok === false) return { ok: false, reason: decision.reason };

  await db.collection(KNOWLEDGE_COLLECTION).doc(entryId).update({
    approvalStatus: decision.approvalStatus,
    reviewerId: decision.reviewerId,
    lastReviewedAt: decision.lastReviewedAt,
  });
  clearKnowledgeCache(db);
  await bumpKnowledgeCacheVersion(db);
  return { ok: true, value: { ...entry, ...decision } };
}

export async function rejectKnowledgeEntry(
  db: FirestoreLike,
  entryId: string,
  reviewerId: string,
): Promise<NheiKnowledgeWriteResult<NheiKnowledgeEntry>> {
  const entry = await fetchEntry(db, entryId);
  if (!entry) return { ok: false, reason: 'not_found' };

  const decision = decideKnowledgeRejection(entry, reviewerId, nowIso());
  if (decision.ok === false) return { ok: false, reason: decision.reason };

  await db.collection(KNOWLEDGE_COLLECTION).doc(entryId).update({
    approvalStatus: decision.approvalStatus,
    reviewerId: decision.reviewerId,
    lastReviewedAt: decision.lastReviewedAt,
  });
  clearKnowledgeCache(db);
  await bumpKnowledgeCacheVersion(db);
  return { ok: true, value: { ...entry, ...decision } };
}

// Fetches every document in the collection and validates each one -
// malformed documents are reported separately, never silently dropped
// into the approved set, matching "reject malformed records." Cached per
// `db` for KNOWLEDGE_CACHE_TTL_MS - see the cache comment above.
async function fetchAllValidatedEntries(db: FirestoreLike): Promise<{ valid: NheiKnowledgeEntry[]; invalidCount: number }> {
  const currentVersionStamp = await readKnowledgeCacheVersion(db);
  const cached = knowledgeCache.get(db);
  // Valid only if BOTH the TTL has not elapsed (the pure-safety-net bound)
  // AND the version stamp still matches what the cache was built from
  // (the real correctness check - see the section-12 comment above). A
  // version mismatch means some writer - this process or another instance
  // entirely - has written since this cache entry was built, so it is
  // treated as stale regardless of how little time has passed.
  if (cached && cached.expiresAt > Date.now() && cached.versionStamp === currentVersionStamp) {
    return { valid: cached.entries, invalidCount: cached.invalidCount };
  }

  const snap = await db.collection(KNOWLEDGE_COLLECTION).get();
  const valid: NheiKnowledgeEntry[] = [];
  let invalidCount = 0;
  for (const doc of snap.docs) {
    const validation = validateKnowledgeEntry(doc.data());
    if (validation.ok && validation.entry) valid.push(validation.entry);
    else invalidCount += 1;
  }
  knowledgeCache.set(db, { entries: valid, invalidCount, expiresAt: Date.now() + KNOWLEDGE_CACHE_TTL_MS, versionStamp: currentVersionStamp });
  return { valid, invalidCount };
}

// The one retrieval entry point this file exposes - fetches, validates,
// and delegates filtering/ordering/limiting entirely to the pure engine.
// Never consent-gated (see header comment) and never falls back to
// inventing content when retrieveKnowledge reports found: false.
export async function retrieveApprovedKnowledge(
  db: FirestoreLike,
  query: NheiKnowledgeRetrievalQuery,
): Promise<NheiKnowledgeRetrievalResult> {
  const { valid } = await fetchAllValidatedEntries(db);
  return retrieveKnowledge(valid, query);
}
