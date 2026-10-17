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
const KNOWLEDGE_CACHE_TTL_MS = 30_000;
const knowledgeCache = new WeakMap<FirestoreLike, { entries: NheiKnowledgeEntry[]; invalidCount: number; expiresAt: number }>();

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
  return { ok: true, value: { ...entry, ...decision } };
}

// Fetches every document in the collection and validates each one -
// malformed documents are reported separately, never silently dropped
// into the approved set, matching "reject malformed records." Cached per
// `db` for KNOWLEDGE_CACHE_TTL_MS - see the cache comment above.
async function fetchAllValidatedEntries(db: FirestoreLike): Promise<{ valid: NheiKnowledgeEntry[]; invalidCount: number }> {
  const cached = knowledgeCache.get(db);
  if (cached && cached.expiresAt > Date.now()) {
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
  knowledgeCache.set(db, { entries: valid, invalidCount, expiresAt: Date.now() + KNOWLEDGE_CACHE_TTL_MS });
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
